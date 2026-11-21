/**
 * Catalog fetching, caching and template installation for the Templates page.
 *
 * The catalog is maintained outside this repo (a Cloudflare worker serving
 * `web-templates.json`); the copy in this folder is the build-time snapshot, so
 * the page still lists templates when the network or the worker is unavailable.
 * Installing is a tarball download from codeload pinned to the entry's commit,
 * unpacked with the dependency-free reader in `tar-extract.ts`.
 *
 * What installation deliberately does NOT do: run npm/pip, or reach any host but
 * the catalog's own tarball URL and its redirects. The page tells the user the
 * next step (install dependencies, start the dev server) instead.
 */
import { promises as fsp } from "node:fs";
import * as path from "node:path";
import type {
	IpcTemplateInstallResult,
	IpcTemplatesCatalogResult,
	TemplateCatalog,
	TemplateEntry,
} from "../shared/templates";
import { agentDir } from "./agent-paths";
import { readCapped, safeJoin } from "./install-safety";
import { extractTarGz, stripTopLevel, type TarEntry } from "./tar-extract";
import bundledCatalog from "./templates-catalog.json";

/**
 * Where the live catalog is served. The worker used to answer on
 * `wisa-templates-catalog.<account>.workers.dev`, which now returns 404, so the
 * page fell back to the bundled snapshot forever; `koda-templates-catalog` is the
 * same catalog on the host that still serves it.
 */
export const CATALOG_URL = "https://koda-templates-catalog.hungdigitalproducts.workers.dev/";
const CATALOG_TIMEOUT_MS = 8_000;
const CATALOG_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const CATALOG_MAX_BYTES = 4 * 1024 * 1024;
const TARBALL_MAX_BYTES = 64 * 1024 * 1024;
const TARBALL_TIMEOUT_MS = 60_000;
const MAX_ENTRIES = 5_000;

/** Where downloaded templates live: inside the GUI-owned Work workspace. */
export function templatesDir(): string {
	return path.join(agentDir(), "..", "work", "templates");
}

function catalogCacheFile(): string {
	return path.join(agentDir(), "..", "gui", "templates-catalog.json");
}

/** Reject anything that is not a plain http(s) URL — no file:, no credentials. */
function isHttpUrl(value: unknown): value is string {
	if (typeof value !== "string") return false;
	try {
		const url = new URL(value);
		return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
	} catch {
		return false;
	}
}

/**
 * Validate one catalog entry. Everything the page renders or fetches comes from
 * here, so a malformed or hostile catalog entry is dropped rather than trusted:
 * an entry without a usable tarball URL or a stable id is not installable.
 */
export function parseTemplateEntry(raw: unknown): TemplateEntry | null {
	if (!raw || typeof raw !== "object") return null;
	const value = raw as Record<string, unknown>;
	const id = typeof value.id === "string" ? value.id.trim() : "";
	// Ids become folder names.
	if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(id)) return null;
	const name = typeof value.name === "string" ? value.name.trim() : "";
	if (!name) return null;
	const description = (value.description ?? {}) as Record<string, unknown>;
	const descriptionEn = typeof description.en === "string" ? description.en : "";
	if (!descriptionEn) return null;
	const source = (value.source ?? {}) as Record<string, unknown>;
	const repo = typeof source.repo === "string" ? source.repo : "";
	if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
	const ref = typeof source.ref === "string" ? source.ref : "";
	if (!/^[\w.-]{1,100}$/.test(ref)) return null;
	const install = (value.install ?? {}) as Record<string, unknown>;
	if (install.type !== "tarball" || !isHttpUrl(install.url)) return null;
	const tags = Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string") : [];
	return {
		id,
		name,
		...(typeof value.nameVi === "string" && value.nameVi.trim() ? { nameVi: value.nameVi.trim() } : {}),
		description: {
			en: descriptionEn,
			...(typeof description.vi === "string" && description.vi ? { vi: description.vi } : {}),
		},
		category: typeof value.category === "string" && value.category ? value.category : "landing-generic",
		tags: tags.slice(0, 20),
		stack: typeof value.stack === "string" && value.stack ? value.stack : "astro",
		source: {
			provider: "github",
			repo,
			ref,
			license: typeof source.license === "string" ? source.license : "unknown",
			...(typeof source.licenseUrl === "string" && isHttpUrl(source.licenseUrl)
				? { licenseUrl: source.licenseUrl }
				: {}),
			...(typeof source.attribution === "string" && source.attribution ? { attribution: source.attribution } : {}),
		},
		...(typeof value.demoUrl === "string" && isHttpUrl(value.demoUrl) ? { demoUrl: value.demoUrl } : {}),
		...(typeof value.thumbnail === "string" ? { thumbnail: value.thumbnail } : {}),
		...(value.featured === true ? { featured: true } : {}),
		install: {
			type: "tarball",
			url: install.url,
			...(typeof install.stripPrefix === "string" && install.stripPrefix
				? { stripPrefix: install.stripPrefix }
				: {}),
		},
	};
}

/** Validate a whole catalog document; unknown fields are dropped. */
export function parseCatalog(raw: unknown): TemplateCatalog | null {
	if (!raw || typeof raw !== "object") return null;
	const value = raw as Record<string, unknown>;
	const list = Array.isArray(value.templates) ? value.templates : null;
	if (!list) return null;
	const seen = new Set<string>();
	const templates: TemplateEntry[] = [];
	for (const item of list) {
		const entry = parseTemplateEntry(item);
		if (!entry || seen.has(entry.id)) continue;
		seen.add(entry.id);
		templates.push(entry);
	}
	if (templates.length === 0) return null;
	return {
		version: typeof value.version === "number" ? value.version : 1,
		...(typeof value.updatedAt === "string" ? { updatedAt: value.updatedAt } : {}),
		templates,
	};
}

/** The snapshot compiled into the bundle. */
export function bundledTemplates(): TemplateCatalog {
	return parseCatalog(bundledCatalog) ?? { version: 1, templates: [] };
}

async function readCache(): Promise<{ catalog: TemplateCatalog; fetchedAt: string } | null> {
	try {
		const text = await fsp.readFile(catalogCacheFile(), "utf8");
		const parsed = JSON.parse(text) as { fetchedAt?: unknown; catalog?: unknown };
		const catalog = parseCatalog(parsed.catalog);
		if (!catalog) return null;
		return { catalog, fetchedAt: typeof parsed.fetchedAt === "string" ? parsed.fetchedAt : "" };
	} catch {
		return null;
	}
}

async function writeCache(catalog: TemplateCatalog): Promise<void> {
	const file = catalogCacheFile();
	const partial = `${file}.${process.pid}.tmp`;
	try {
		await fsp.mkdir(path.dirname(file), { recursive: true });
		await fsp.writeFile(partial, JSON.stringify({ fetchedAt: new Date().toISOString(), catalog }), "utf8");
		await fsp.rename(partial, file);
	} catch {
		await fsp.rm(partial, { force: true }).catch(() => {});
	}
}

async function fetchCatalog(): Promise<TemplateCatalog | null> {
	try {
		const response = await fetch(CATALOG_URL, {
			credentials: "omit",
			headers: { accept: "application/json" },
			signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
		});
		if (!response.ok) return null;
		const bytes = await readCapped(response, CATALOG_MAX_BYTES);
		if (!bytes) return null;
		return parseCatalog(JSON.parse(bytes.toString("utf8")));
	} catch {
		return null;
	}
}

let catalogMemo: { catalog: TemplateCatalog; origin: "remote" | "cache"; fetchedAt: number } | null = null;

/**
 * The catalog the page lists. Live fetch first, then the last good fetch, then
 * the bundled snapshot — each answer says which it is, so the page can be honest
 * about a stale list instead of pretending it is current.
 */
/** Template id → folder, for the templates already unpacked on disk. */
async function installedTemplates(): Promise<Record<string, string>> {
	const root = templatesDir();
	let names: string[];
	try {
		names = await fsp.readdir(root);
	} catch {
		return {};
	}
	const found: Record<string, string> = {};
	for (const name of names) {
		// Staging folders (`<id>.<pid>.partial`) are not installs.
		if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(name)) continue;
		found[name] = path.join(root, name);
	}
	return found;
}

type ResolvedCatalog =
	| Exclude<IpcTemplatesCatalogResult, { status: "ok" }>
	| Omit<Extract<IpcTemplatesCatalogResult, { status: "ok" }>, "installed">;

async function resolveCatalog(): Promise<ResolvedCatalog> {
	if (catalogMemo && Date.now() - catalogMemo.fetchedAt < CATALOG_MAX_AGE_MS) {
		return { status: "ok", catalog: catalogMemo.catalog, origin: catalogMemo.origin };
	}
	const remote = await fetchCatalog();
	if (remote) {
		catalogMemo = { catalog: remote, origin: "remote", fetchedAt: Date.now() };
		void writeCache(remote);
		return { status: "ok", catalog: remote, origin: "remote" };
	}
	const cached = await readCache();
	if (cached) {
		catalogMemo = { catalog: cached.catalog, origin: "cache", fetchedAt: Date.now() };
		return { status: "ok", catalog: cached.catalog, origin: "cache", fetchedAt: cached.fetchedAt };
	}
	const bundled = bundledTemplates();
	if (bundled.templates.length === 0) return { status: "unavailable", error: "the catalog is empty" };
	return { status: "ok", catalog: bundled, origin: "bundled" };
}

export async function readTemplatesCatalog(): Promise<IpcTemplatesCatalogResult> {
	const [catalog, installed] = await Promise.all([resolveCatalog(), installedTemplates()]);
	if (catalog.status !== "ok") return catalog;
	// Which templates are already unpacked travels WITH the catalog: the page
	// would otherwise offer "Install" for a folder it has, and the install would
	// fail with "already installed" for no visible reason.
	return { ...catalog, installed };
}

/** Resolve an entry by id from whichever catalog is current. */
async function findTemplate(id: string): Promise<TemplateEntry | null> {
	const result = await readTemplatesCatalog();
	if (result.status !== "ok") return null;
	return result.catalog.templates.find(entry => entry.id === id) ?? null;
}

/**
 * Download and unpack one template into `~/.omp/work/templates/<id>`.
 *
 * An existing folder is left untouched and reported, rather than merged: the
 * user may have edited the files, and silently overwriting them is worse than
 * making them pick another name.
 */
export async function installTemplate(id: string): Promise<IpcTemplateInstallResult> {
	if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(id)) return { status: "error", error: "invalid template id" };
	const entry = await findTemplate(id);
	if (!entry) return { status: "error", error: "template not found in the catalog" };

	const root = templatesDir();
	const dir = path.join(root, entry.id);
	try {
		await fsp.mkdir(root, { recursive: true });
		await fsp.access(dir);
		return { status: "error", error: "already installed" };
	} catch {
		// Not there yet — expected.
	}

	let archive: Buffer | null;
	try {
		const response = await fetch(entry.install.url, {
			credentials: "omit",
			redirect: "follow",
			signal: AbortSignal.timeout(TARBALL_TIMEOUT_MS),
		});
		if (!response.ok) return { status: "error", error: `download failed (${response.status})` };
		archive = await readCapped(response, TARBALL_MAX_BYTES);
	} catch (error) {
		return { status: "error", error: `download failed: ${String(error)}` };
	}
	if (!archive) return { status: "error", error: "download too large" };

	let entries: TarEntry[];
	try {
		entries = stripTopLevel(extractTarGz(archive), entry.install.stripPrefix);
	} catch (error) {
		return { status: "error", error: `could not unpack the archive: ${String(error)}` };
	}
	if (entries.length === 0) return { status: "error", error: "the archive was empty" };
	if (entries.length > MAX_ENTRIES) return { status: "error", error: "the archive has too many files" };

	// Write into a staging folder and rename at the end: a failed unpack leaves
	// no half-installed template the page would then refuse to reinstall.
	const staging = `${dir}.${process.pid}.partial`;
	try {
		await fsp.rm(staging, { recursive: true, force: true });
		await fsp.mkdir(staging, { recursive: true });
		for (const item of entries) {
			const target = safeJoin(staging, item.path);
			if (!target) continue;
			if (item.type === "directory") {
				await fsp.mkdir(target, { recursive: true });
				continue;
			}
			await fsp.mkdir(path.dirname(target), { recursive: true });
			await fsp.writeFile(target, item.data, { mode: item.mode & 0o777 });
		}
		await writeTemplateNotes(staging, entry);
		await fsp.rename(staging, dir);
	} catch (error) {
		await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
		return { status: "error", error: `could not write the template: ${String(error)}` };
	}
	return { status: "ok", dir, entry };
}

/**
 * What the template folder says about itself once unpacked.
 *
 * Two files, both additive: `AGENTS.md` (read by the agent in every session
 * started in this folder, so it knows where the code came from and what to run)
 * and `.wisa/template.json` (the page reads it back to label the folder). The
 * Agentation instruction is part of the agent notes because that is how a
 * template gets its feedback overlay: the agent installs and wires it in the
 * project, rather than the installer editing someone's `package.json` blind.
 */
async function writeTemplateNotes(dir: string, entry: TemplateEntry): Promise<void> {
	const notes = `# ${entry.name}

Installed by WISA STUDIO from the web-template catalog.

- Upstream: https://github.com/${entry.source.repo} (${entry.source.license})
- Pinned at: ${entry.source.ref}
${entry.demoUrl ? `- Demo: ${entry.demoUrl}\n` : ""}
Start it with the project's own scripts (\`bun install\` / \`npm install\`, then the
dev script in \`package.json\`). Nothing was installed or built for you.

## Agentation

This project should carry the Agentation feedback overlay
(https://www.agentation.com) so visual feedback can be captured against the
running page:

1. \`npm i -D agentation\` (or the project's own package manager).
2. Mount \`<Agentation />\` in the app's root layout, or add its script tag to the
   entry HTML for a static template.
3. Keep it out of production builds.

Ask before changing anything else outside that wiring.
`;
	await fsp.writeFile(path.join(dir, "AGENTS.md"), notes, "utf8");
	await fsp.mkdir(path.join(dir, ".wisa"), { recursive: true });
	await fsp.writeFile(
		path.join(dir, ".wisa", "template.json"),
		JSON.stringify(
			{
				id: entry.id,
				name: entry.name,
				repo: entry.source.repo,
				ref: entry.source.ref,
				license: entry.source.license,
				attribution: entry.source.attribution ?? null,
				installedAt: new Date().toISOString(),
			},
			null,
			2,
		),
		"utf8",
	);
}
