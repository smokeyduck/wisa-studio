/**
 * Community skills from skills.sh: search, and one-click installation into the
 * user skills folder.
 *
 * Everything the Community tab shows or installs comes from here, and all of it
 * is network input, so this module is written defensively:
 *
 * - One host, https only. URLs are built from a constant origin (never from a
 *   string the renderer supplies), credentials are stripped, and redirects are
 *   refused rather than followed to somewhere else.
 * - Every answer is bounded: a byte cap on the body, a request timeout, a cap
 *   on how many files a skill may carry, and a cap on each file's size.
 * - Every `files[].path` is checked with the same defensive join the template
 *   installer uses (`safeJoin`), and the whole tree is written into a staging
 *   folder that is renamed into place, so a rejected path or a failed write
 *   leaves nothing behind and never touches an existing skill.
 *
 * What installation deliberately does NOT do: run npm/pip/node, or execute any
 * script the skill ships. It writes files; the agent decides what to do with
 * them, and the page says so.
 */
import { promises as fsp } from "node:fs";
import * as path from "node:path";
import {
	COMMUNITY_QUERY_MIN_LENGTH,
	type CommunitySkill,
	communitySkillSlug,
	type IpcSkillsCommunityInstallResult,
	type IpcSkillsCommunitySearchResult,
	isCommunitySkillId,
} from "../shared/skills-community";
import { agentDir } from "./agent-paths";
import { readCapped, safeJoin } from "./install-safety";

/** The only host this module ever talks to, and the only scheme it uses. */
const SKILLS_ORIGIN = "https://skills.sh";
const SKILLS_HOST = "skills.sh";

const SEARCH_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const SEARCH_MAX_BYTES = 2 * 1024 * 1024;
const DOWNLOAD_MAX_BYTES = 16 * 1024 * 1024;
/** A skill is instructions plus a few scripts; thousands of files is not one. */
const MAX_FILES = 2_000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
/** The page shows a screenful; a wider answer only costs validation time. */
const MAX_RESULTS = 100;

/** Where community skills install: the user-level skills folder, seen by every project. */
export function communitySkillsDir(): string {
	return path.join(agentDir(), "skills");
}

/**
 * A URL on skills.sh, built from the constant origin. Throws on anything that
 * would leave the host · which can only happen if this file itself is edited,
 * since every caller passes literal paths and validated slugs. Exported so the
 * guard is tested directly rather than only through its callers.
 */
export function skillsApiUrl(pathname: string): URL {
	const url = new URL(pathname, SKILLS_ORIGIN);
	if (url.protocol !== "https:" || url.hostname !== SKILLS_HOST || url.username || url.password) {
		throw new Error("refusing a request outside skills.sh");
	}
	return url;
}

/** One search hit, or null when the index's answer is not usable as a row. */
export function parseCommunitySkill(raw: unknown): CommunitySkill | null {
	if (!raw || typeof raw !== "object") return null;
	const record = raw as Record<string, unknown>;
	const id = typeof record.id === "string" ? record.id.trim() : "";
	if (!isCommunitySkillId(id)) return null;
	const parts = id.split("/");
	const slug = communitySkillSlug(id);
	if (!slug) return null;
	const installs = typeof record.installs === "number" && Number.isFinite(record.installs) ? record.installs : 0;
	const source =
		typeof record.source === "string" && record.source.trim() ? record.source.trim() : `${parts[0]}/${parts[1]}`;
	// The name is display text; the id is what installs, so the name may fall
	// back to the slug but never disagree with it.
	const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : slug;
	return {
		id,
		skillId: typeof record.skillId === "string" && record.skillId.trim() ? record.skillId.trim() : slug,
		name,
		source,
		// Install counts are a quality signal, so a negative or fractional one is
		// clamped rather than shown as nonsense.
		installs: Math.max(0, Math.floor(installs)),
	};
}

/** Whether `target` exists on disk, whatever it is. */
async function pathExists(target: string): Promise<boolean> {
	try {
		await fsp.access(target);
		return true;
	} catch {
		return false;
	}
}

/** Slug → folder, for the skills already installed under the user skills root. */
async function installedCommunitySkills(): Promise<Record<string, string>> {
	const root = communitySkillsDir();
	let names: string[];
	try {
		names = await fsp.readdir(root);
	} catch {
		return {};
	}
	const found: Record<string, string> = {};
	for (const name of names) {
		// Staging folders (`<slug>.<pid>.partial`) are not installs.
		if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name) || name.startsWith(".")) continue;
		const dir = path.join(root, name);
		try {
			if (!(await fsp.stat(dir)).isDirectory()) continue;
		} catch {
			continue;
		}
		found[name] = dir;
	}
	return found;
}

/**
 * Search skills.sh. A query shorter than the API's minimum is answered without
 * touching the network, because the API would only answer 400.
 */
export async function searchSkills(query: string, signal?: AbortSignal): Promise<IpcSkillsCommunitySearchResult> {
	const trimmed = typeof query === "string" ? query.trim() : "";
	if (trimmed.length < COMMUNITY_QUERY_MIN_LENGTH) {
		return { status: "error", error: `search needs at least ${COMMUNITY_QUERY_MIN_LENGTH} characters` };
	}

	let body: unknown;
	try {
		const url = skillsApiUrl("/api/search");
		url.searchParams.set("q", trimmed);
		const response = await fetch(url, {
			credentials: "omit",
			headers: { accept: "application/json" },
			// Refused, not followed: a redirect is how a request ends up on a host
			// this module never agreed to talk to.
			redirect: "error",
			signal: signal
				? AbortSignal.any([signal, AbortSignal.timeout(SEARCH_TIMEOUT_MS)])
				: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
		});
		if (!response.ok) return { status: "error", error: `search failed (${response.status})` };
		const bytes = await readCapped(response, SEARCH_MAX_BYTES);
		if (!bytes) return { status: "error", error: "search response too large" };
		body = JSON.parse(bytes.toString("utf8"));
	} catch (error) {
		return { status: "error", error: `search failed: ${String(error)}` };
	}

	const raw = (body as { skills?: unknown } | null)?.skills;
	if (!Array.isArray(raw)) return { status: "error", error: "search returned an unusable answer" };

	const seen = new Set<string>();
	const skills: CommunitySkill[] = [];
	for (const item of raw) {
		if (skills.length >= MAX_RESULTS) break;
		const parsed = parseCommunitySkill(item);
		if (!parsed || seen.has(parsed.id)) continue;
		seen.add(parsed.id);
		skills.push(parsed);
	}
	// Already-installed skills travel with the rows: the page would otherwise
	// offer "Install" for a folder it already has, and the install would fail
	// with "already installed" for no visible reason.
	return {
		status: "ok",
		query: trimmed,
		skills,
		root: communitySkillsDir(),
		installed: await installedCommunitySkills(),
	};
}

/** One file from the download answer, already bounded and validated. */
interface DownloadFile {
	path: string;
	contents: string;
}

/**
 * Validate the download answer into the files we are willing to write. Every
 * refusal here is a whole-request refusal: a tree with one hostile path is not
 * a tree we write the other files of.
 */
function parseDownload(body: unknown): { files: DownloadFile[] } | { error: string } {
	const raw = (body as { files?: unknown } | null)?.files;
	if (!Array.isArray(raw)) return { error: "the download did not contain a file list" };
	if (raw.length === 0) return { error: "the skill has no files" };
	if (raw.length > MAX_FILES) return { error: `the skill has too many files (limit ${MAX_FILES})` };

	const files: DownloadFile[] = [];
	const seen = new Set<string>();
	for (const item of raw) {
		if (!item || typeof item !== "object") return { error: "the download has a malformed file entry" };
		const record = item as Record<string, unknown>;
		const relative = typeof record.path === "string" ? record.path : "";
		const contents = typeof record.contents === "string" ? record.contents : null;
		if (!relative || contents === null) return { error: "the download has a malformed file entry" };
		if (Buffer.byteLength(contents, "utf8") > MAX_FILE_BYTES) {
			return { error: `a file is too large (limit ${MAX_FILE_BYTES} bytes)` };
		}
		if (seen.has(relative)) return { error: "the download names the same file twice" };
		seen.add(relative);
		files.push({ path: relative, contents });
	}
	// A skill without its instructions is not a skill: nothing would load it.
	if (!files.some(file => /(^|\/)SKILL\.md$/i.test(file.path))) {
		return { error: "the skill has no SKILL.md" };
	}
	return { files };
}

/**
 * Download and install one skill into `~/.omp/agent/skills/<slug>`.
 *
 * An existing folder is left untouched and reported rather than merged: the
 * user may have edited those files, and silently overwriting a skill the agent
 * is using is worse than making them remove it first.
 */
export async function installSkill(id: string): Promise<IpcSkillsCommunityInstallResult> {
	const cleanId = typeof id === "string" ? id.trim() : "";
	if (!isCommunitySkillId(cleanId)) return { status: "error", error: "invalid skill id" };
	const slug = communitySkillSlug(cleanId);
	if (!slug) return { status: "error", error: "invalid skill id" };
	const [owner, repo] = cleanId.split("/");
	const source = `${owner}/${repo}`;

	const root = communitySkillsDir();
	const dir = safeJoin(root, slug);
	// The slug is a plain name, so this can only fail on a programming error —
	// but the destination is never assembled without the same join as the files.
	if (!dir) return { status: "error", error: "invalid skill id" };

	try {
		await fsp.mkdir(root, { recursive: true });
		await fsp.access(dir);
		return { status: "error", error: "already installed" };
	} catch {
		// Not there yet · expected.
	}

	let body: unknown;
	try {
		const url = skillsApiUrl(`/api/download/${[owner, repo, slug].map(encodeURIComponent).join("/")}`);
		const response = await fetch(url, {
			credentials: "omit",
			headers: { accept: "application/json" },
			redirect: "error",
			signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
		});
		if (!response.ok) return { status: "error", error: `download failed (${response.status})` };
		const bytes = await readCapped(response, DOWNLOAD_MAX_BYTES);
		if (!bytes) return { status: "error", error: "download too large" };
		body = JSON.parse(bytes.toString("utf8"));
	} catch (error) {
		return { status: "error", error: `download failed: ${String(error)}` };
	}

	const parsed = parseDownload(body);
	if ("error" in parsed) return { status: "error", error: parsed.error };
	const { files } = parsed;

	// Every path is validated against the destination before the first byte is
	// written, so a hostile tree leaves no partial folder to clean up.
	for (const file of files) {
		if (!safeJoin(dir, file.path)) return { status: "error", error: `refusing an unsafe path: ${file.path}` };
	}

	// Write into a staging folder and rename at the end: a failed write leaves no
	// half-installed skill that the page would then refuse to reinstall.
	const staging = `${dir}.${process.pid}.partial`;
	try {
		await fsp.rm(staging, { recursive: true, force: true });
		await fsp.mkdir(staging, { recursive: true });
		for (const file of files) {
			// The same relative path, joined against staging: a path validated for
			// one root is validated again for the one actually written into.
			const staged = safeJoin(staging, file.path);
			if (!staged) throw new Error(`refusing an unsafe path: ${file.path}`);
			await fsp.mkdir(path.dirname(staged), { recursive: true });
			await fsp.writeFile(staged, file.contents, "utf8");
		}
	} catch (error) {
		await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
		return { status: "error", error: `could not write the skill: ${String(error)}` };
	}

	// The folder can appear while the download runs; the user's copy wins over
	// whatever arrived late, and the rename below would overwrite it.
	if (await pathExists(dir)) {
		await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
		return { status: "error", error: "already installed" };
	}
	try {
		await fsp.rename(staging, dir);
	} catch (error) {
		await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
		return { status: "error", error: `could not write the skill: ${String(error)}` };
	}

	return { status: "ok", id: cleanId, name: slug, source, dir, root, files: files.length };
}
