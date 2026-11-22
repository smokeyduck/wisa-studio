/**
 * Contracts for the template catalog and installer. Everything the Templates
 * page renders or fetches comes from here, so the two things that matter are
 * that a malformed or hostile catalog entry is dropped rather than trusted, and
 * that an install can never write outside the folder it was given.
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureAgentProfile } from "./agent-paths";
import { ensureDefaultWorkspace } from "./default-workspace";
import {
	bundledTemplates,
	CATALOG_URL,
	installTemplate,
	parseCatalog,
	parseTemplateEntry,
	templatesDir,
} from "./templates";

const REPO = "acme/site";
const REF = "0123456789abcdef0123456789abcdef01234567";

function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: "acme-site",
		name: "Acme Site",
		description: { en: "A site", vi: "Mot trang" },
		category: "landing-generic",
		tags: ["landing"],
		stack: "astro",
		source: { repo: REPO, ref: REF, license: "MIT" },
		install: {
			type: "tarball",
			url: `https://codeload.github.com/${REPO}/tar.gz/${REF}`,
			stripPrefix: `site-${REF}`,
		},
		...overrides,
	};
}

describe("parseTemplateEntry", () => {
	it("keeps a well-formed entry", () => {
		const parsed = parseTemplateEntry(entry());
		expect(parsed).toMatchObject({
			id: "acme-site",
			name: "Acme Site",
			category: "landing-generic",
			stack: "astro",
			source: { repo: REPO, ref: REF, license: "MIT" },
			install: { type: "tarball" },
		});
	});

	it("drops entries that could not be installed", () => {
		// Ids become folder names, so an id that is not a plain slug is refused.
		expect(parseTemplateEntry(entry({ id: "../escape" }))).toBeNull();
		expect(parseTemplateEntry(entry({ id: "" }))).toBeNull();
		expect(parseTemplateEntry(entry({ name: "" }))).toBeNull();
		expect(parseTemplateEntry(entry({ description: {} }))).toBeNull();
		expect(parseTemplateEntry(entry({ source: { repo: "not a repo", ref: REF } }))).toBeNull();
		expect(parseTemplateEntry(entry({ install: { type: "tarball" } }))).toBeNull();
		// Only http(s) tarball URLs: no file:, no credentials in the URL.
		expect(parseTemplateEntry(entry({ install: { type: "tarball", url: "file:///etc/passwd" } }))).toBeNull();
		expect(
			parseTemplateEntry(entry({ install: { type: "tarball", url: "https://u:p@example.com/x.tgz" } })),
		).toBeNull();
	});

	it("falls back on presentation fields but never on the install ones", () => {
		const parsed = parseTemplateEntry(entry({ category: undefined, stack: undefined, tags: "nope" }));
		expect(parsed?.category).toBe("landing-generic");
		expect(parsed?.stack).toBe("astro");
		expect(parsed?.tags).toEqual([]);
	});
});

describe("parseCatalog", () => {
	it("deduplicates by id and refuses a document with no usable template", () => {
		const catalog = parseCatalog({
			version: 2,
			templates: [entry(), entry({ name: "Duplicate" }), entry({ id: "other" })],
		});
		expect(catalog?.version).toBe(2);
		expect(catalog?.templates.map(template => template.id)).toEqual(["acme-site", "other"]);
		expect(parseCatalog({ templates: [entry({ id: "" })] })).toBeNull();
		expect(parseCatalog({})).toBeNull();
		expect(parseCatalog(null)).toBeNull();
	});
});

describe("catalog URL", () => {
	it("points at the worker that actually serves the catalog", () => {
		// The page said "Không kết nối được máy chủ danh mục" because this host
		// answered 404 while the same catalog on the koda host answered 200. A
		// URL nobody serves makes every user fall back to the bundled snapshot.
		expect(CATALOG_URL).toBe("https://koda-templates-catalog.hungdigitalproducts.workers.dev/");
		expect(new URL(CATALOG_URL).protocol).toBe("https:");
		expect(CATALOG_URL).not.toContain("wisa-templates-catalog");
	});

	it("is the address the live fetch uses, so the constant is not decorative", async () => {
		// A fresh module instance per test: the resolved catalog is memoized at module
		// scope, so a static import would make these two tests order-dependent.
		const dir = await mkdtemp(path.join(tmpdir(), "omp-catalog-"));
		configureAgentProfile(path.join(dir, "agent"));
		const live = { version: 1, updatedAt: "2026-11-01T07:59:17.853Z", templates: [entry()] };
		const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify(live), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		vi.resetModules();
		try {
			// Reset modules also resets the profile singleton; configure the fresh module.
			const { configureAgentProfile } = await import("./agent-paths");
			configureAgentProfile(path.join(dir, "agent"));
			const fresh = await import("./templates");
			const result = await fresh.readTemplatesCatalog();
			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(fetchMock.mock.calls[0]?.[0]).toBe(fresh.CATALOG_URL);
			expect(result).toMatchObject({ status: "ok", origin: "remote" });
			expect(result.status === "ok" && result.catalog.templates).toHaveLength(1);
		} finally {
			vi.unstubAllGlobals();
			vi.unstubAllEnvs();
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("falls back to the bundled snapshot when the worker can't be reached", async () => {
		// The 404 the page hit is exactly this path, and it has to keep the offline
		// list rather than reporting an empty catalog. The resolved catalog is
		// memoized at module scope for six hours, so reaching the network again in
		// this process means a fresh module instance — a static import cannot.
		const dir = await mkdtemp(path.join(tmpdir(), "omp-catalog-"));
		configureAgentProfile(path.join(dir, "agent"));
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("not found", { status: 404 })),
		);
		vi.resetModules();
		try {
			// Reset modules also resets the profile singleton; configure the fresh module.
			const { configureAgentProfile } = await import("./agent-paths");
			configureAgentProfile(path.join(dir, "agent"));
			const fresh = await import("./templates");
			const result = await fresh.readTemplatesCatalog();
			expect(result).toMatchObject({ status: "ok", origin: "bundled" });
			expect(result.status === "ok" && result.catalog.templates.length).toBe(65);
		} finally {
			vi.unstubAllGlobals();
			vi.unstubAllEnvs();
			await rm(dir, { recursive: true, force: true });
		}
	});
});

/** How many templates the snapshot file carries, before any validation drops one. */
function snapshotEntryCount(): number {
	const parsed: unknown = JSON.parse(readFileSync(path.join(__dirname, "templates-catalog.json"), "utf8"));
	if (typeof parsed !== "object" || parsed === null || !("templates" in parsed)) return 0;
	const { templates } = parsed;
	return Array.isArray(templates) ? templates.length : 0;
}

describe("bundled snapshot", () => {
	it("is the live catalog as served, so nothing was dropped on the way in", () => {
		// `parseCatalog` drops anything it cannot install, so a parsed count below
		// the file's own array length means the snapshot carries entries the page
		// will never show. The numbers are the payload the koda worker served when
		// the snapshot was regenerated: regenerating again updates them on purpose.
		const bundled = bundledTemplates();
		expect(bundled.version).toBe(1);
		expect(bundled.updatedAt).toBe("2026-11-01T07:59:17.853Z");
		expect(bundled.templates).toHaveLength(65);
		expect(snapshotEntryCount()).toBe(65);
		expect(bundled.templates).toHaveLength(snapshotEntryCount());
	});

	it("is a valid catalog, so the page works offline", () => {
		const bundled = bundledTemplates();
		expect(bundled.templates.length).toBeGreaterThan(0);
		for (const template of bundled.templates) {
			// Every bundled entry must round-trip: a bad one would be dropped at
			// runtime and silently shrink the offline list.
			expect(parseTemplateEntry(template)).not.toBeNull();
		}
	});

	it("ships a screenshot for every template it lists", () => {
		// The page renders `./templates/<basename>`, which the renderer's public
		// dir has to carry: the CSP allows no remote images, so a catalog entry
		// without its file would render as an empty card.
		const thumbnails = path.join(__dirname, "..", "renderer", "public", "templates");
		const missing: string[] = [];
		for (const template of bundledTemplates().templates) {
			const name = template.thumbnail?.slice(template.thumbnail.lastIndexOf("/") + 1);
			if (!name || !existsSync(path.join(thumbnails, name))) missing.push(template.id);
		}
		expect(missing).toEqual([]);
	});
});

describe("installTemplate", () => {
	const tempDirs: string[] = [];

	beforeEach(async () => {
		const dir = await mkdtemp(path.join(tmpdir(), "omp-templates-"));
		tempDirs.push(dir);
		configureAgentProfile(path.join(dir, "agent"));
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	afterAll(async () => {
		await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
	});

	it("refuses an id that is not a plain slug before touching the network", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		await expect(installTemplate("../etc")).resolves.toMatchObject({ status: "error" });
		await expect(installTemplate("")).resolves.toMatchObject({ status: "error" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("installs into the Work workspace, which is the folder the page opens", () => {
		// The installer and the page must agree on the destination: the page opens
		// the folder as a session, so a mismatch would open an empty directory.
		expect(templatesDir()).toBe(path.join(ensureDefaultWorkspace(), "templates"));
	});
});
