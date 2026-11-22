/**
 * Community skills from skills.sh: the full catalogue, previews, and one-click
 * installation into the user skills folder.
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
 * The catalogue is the index's own three boards (all time, trending, hot). One
 * page of each is fetched up front so the page has something to show; the rest
 * is paged in behind it at the index's published rate limit, written to a cache
 * file as it lands, and streamed to the page as it arrives.
 *
 * What installation deliberately does NOT do: run npm/pip/node, or execute any
 * script the skill ships. It writes files; the agent decides what to do with
 * them, and the page says so.
 */
import { promises as fsp } from "node:fs";
import * as path from "node:path";
import {
	COMMUNITY_BOARDS,
	type CommunityBoard,
	type CommunityBoardState,
	type CommunitySkill,
	communitySkillSlug,
	type IpcSkillsCommunityCatalogResult,
	type IpcSkillsCommunityCatalogUpdate,
	type IpcSkillsCommunityInstallResult,
	type IpcSkillsCommunityPreviewResult,
	isCommunitySkillId,
} from "../shared/skills-community";
import { agentDir } from "./agent-paths";
import { readCapped, safeJoin } from "./install-safety";

/** The only host this module ever talks to, and the only scheme it uses. */
const SKILLS_ORIGIN = "https://skills.sh";
const SKILLS_HOST = "skills.sh";

const REQUEST_TIMEOUT_MS = 15_000;
const PAGE_MAX_BYTES = 4 * 1024 * 1024;
const DOWNLOAD_MAX_BYTES = 16 * 1024 * 1024;
/** A skill is instructions plus a few scripts; thousands of files is not one. */
const MAX_FILES = 2_000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * The index publishes 30 requests per minute and answers 429 past that. Paging
 * therefore walks the catalogue at a fixed interval rather than in parallel: the
 * whole thing is ~140 requests, and being throttled mid-way is worse than
 * arriving a few minutes later.
 */
const PAGE_INTERVAL_MS = 2_200;
const THROTTLE_BACKOFF_MS = 65_000;
/** A cached catalogue older than this is refreshed on the next open. */
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** Persist every few pages: a 10k-row board is a few MB of JSON. */
const CACHE_WRITE_EVERY = 10;

/** Where community skills install: the user-level skills folder, seen by every project. */
export function communitySkillsDir(): string {
	return path.join(agentDir(), "skills");
}

function catalogCacheFile(): string {
	return path.join(agentDir(), "..", "gui", "skills-catalog.json");
}

/**
 * A URL on skills.sh, built from the constant origin. Throws on anything that
 * would leave the host - which can only happen if this file itself is edited,
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

/** One catalogue row, or null when the index's answer is not usable as one. */
export function parseCommunitySkill(raw: unknown): CommunitySkill | null {
	if (!raw || typeof raw !== "object") return null;
	const record = raw as Record<string, unknown>;
	const source = typeof record.source === "string" ? record.source.trim() : "";
	const skillId = typeof record.skillId === "string" ? record.skillId.trim() : "";
	// Rows that are not a clean `owner/repo/slug` still list (the catalogue is
	// the index's, and its counts should add up), but only a clean id installs.
	if (!source || !skillId) return null;
	if (`${source}/${skillId}`.split("/").some(part => part === "" || part === "." || part === "..")) return null;
	const id = `${source}/${skillId}`;
	const installs = typeof record.installs === "number" && Number.isFinite(record.installs) ? record.installs : 0;
	// The name is display text; the id is what installs, so the name may fall
	// back to the slug but never disagree with it.
	const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : skillId;
	return {
		id,
		skillId,
		name,
		source,
		// Install counts are a quality signal, so a negative or fractional one is
		// clamped rather than shown as nonsense.
		installs: Math.max(0, Math.floor(installs)),
		official: record.isOfficial === true ? true : undefined,
	};
}

/** One board being paged in: its rows so far, and where the pager is. */
interface BoardProgress {
	rows: CommunitySkill[];
	seen: Set<string>;
	total: number;
	/** The next page to fetch; 1 means nothing fetched yet. */
	nextPage: number;
	complete: boolean;
	/** A pager is already walking this board; do not start a second. */
	pumping: boolean;
}

const progress = new Map<CommunityBoard, BoardProgress>();
let fetchedAt = "";
let catalogError: string | null = null;
let lastRequestAt = 0;
/** Bumped by `resetCatalogState`, so a pager from an earlier load stops. */
let generation = 0;
/** The pacing interval, relaxed to zero in tests that stub the network. */
let pageIntervalMs = PAGE_INTERVAL_MS;
const listeners = new Set<(update: IpcSkillsCommunityCatalogUpdate) => void>();

/**
 * Drop everything held in memory: rows, cache metadata, and any pager still
 * running. Tests call this between cases; production never does, because the
 * catalogue is meant to survive for the life of the process.
 */
export function resetCatalogState(): void {
	generation += 1;
	progress.clear();
	fetchedAt = "";
	catalogError = null;
	lastRequestAt = 0;
	pageIntervalMs = PAGE_INTERVAL_MS;
	loading = null;
}

/** Relax the pacing interval. Only tests use this; the real limit is 30/minute. */
export function setCatalogPacingForTests(ms: number): void {
	pageIntervalMs = ms;
}

/** Subscribe to per-page updates; returns the unsubscribe. */
export function onCatalogUpdate(listener: (update: IpcSkillsCommunityCatalogUpdate) => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function emit(board: CommunityBoard): void {
	const state = boardState(board);
	if (!state) return;
	for (const listener of listeners) listener({ board, state });
}

function boardState(board: CommunityBoard): CommunityBoardState | null {
	const entry = progress.get(board);
	if (!entry) return null;
	return { skills: entry.rows, total: entry.total, complete: entry.complete };
}

function emptyBoard(): BoardProgress {
	return { rows: [], seen: new Set(), total: 0, nextPage: 1, complete: false, pumping: false };
}

function sleep(ms: number): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, ms);
	return promise;
}

/** Wait out the shared pacing interval, so pages never trip the index's limit. */
async function pace(): Promise<void> {
	const wait = lastRequestAt + pageIntervalMs - Date.now();
	if (wait > 0) await sleep(wait);
	lastRequestAt = Date.now();
}

async function getJson(url: URL, maxBytes: number, signal?: AbortSignal): Promise<unknown> {
	const response = await fetch(url, {
		credentials: "omit",
		headers: { accept: "application/json" },
		// Refused, not followed: a redirect is how a request ends up on a host
		// this module never agreed to talk to.
		redirect: "error",
		signal: signal
			? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
			: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const bytes = await readCapped(response, maxBytes);
	if (!bytes) throw new Error("response too large");
	return JSON.parse(bytes.toString("utf8"));
}

/** One page of one board, validated into rows. */
export interface CatalogPage {
	rows: CommunitySkill[];
	total: number;
	hasMore: boolean;
}

async function fetchPage(board: CommunityBoard, page: number): Promise<CatalogPage> {
	const body = (await getJson(skillsApiUrl(`/api/skills/${board}/${page}`), PAGE_MAX_BYTES)) as {
		skills?: unknown;
		total?: unknown;
		hasMore?: unknown;
	} | null;
	const raw = body?.skills;
	if (!Array.isArray(raw)) throw new Error("the catalogue answered without rows");
	const rows: CommunitySkill[] = [];
	for (const item of raw) {
		const parsed = parseCommunitySkill(item);
		if (parsed) rows.push(parsed);
	}
	const total = typeof body?.total === "number" && Number.isFinite(body.total) ? body.total : rows.length;
	return { rows, total, hasMore: body?.hasMore === true };
}

/** Append a page to a board, skipping rows already seen (the index repeats none, but be sure). */
function absorb(board: CommunityBoard, page: number, answer: CatalogPage): void {
	const entry = progress.get(board) ?? emptyBoard();
	progress.set(board, entry);
	for (const row of answer.rows) {
		if (entry.seen.has(row.id)) continue;
		entry.seen.add(row.id);
		entry.rows.push(row);
	}
	entry.total = Math.max(entry.total, answer.total);
	entry.nextPage = page + 1;
	// `hasMore` is the index's word; the row count is ours. Believing only
	// `hasMore` would page forever if it ever stopped flipping.
	entry.complete = !answer.hasMore || answer.rows.length === 0 || entry.rows.length >= entry.total;
}

/**
 * Walk the rest of one board in the background, emitting each page as it lands.
 * A failure leaves the board where it stopped; the next open resumes from there
 * because the cache records `nextPage`.
 */
async function pump(board: CommunityBoard): Promise<void> {
	const entry = progress.get(board);
	if (!entry || entry.pumping || entry.complete) return;
	const mine = generation;
	entry.pumping = true;
	let sinceWrite = 0;
	try {
		while (!entry.complete && mine === generation) {
			await pace();
			const page = entry.nextPage;
			let answer: CatalogPage;
			try {
				answer = await fetchPage(board, page);
			} catch (error) {
				// Throttled: wait out the window and try this page once more.
				if (!String(error).includes("HTTP 429")) throw error;
				await sleep(THROTTLE_BACKOFF_MS);
				answer = await fetchPage(board, page);
			}
			absorb(board, page, answer);
			emit(board);
			sinceWrite += 1;
			if (sinceWrite >= CACHE_WRITE_EVERY) {
				sinceWrite = 0;
				await writeCache();
			}
		}
	} catch {
		// Offline or refused: keep what landed. The page still lists it, and the
		// next open resumes from `nextPage`.
	} finally {
		entry.pumping = false;
		await writeCache();
	}
}

function startPumps(): void {
	for (const board of COMMUNITY_BOARDS) void pump(board);
}

/** The whole catalogue as the page sees it right now. */
function snapshot(installed: Record<string, string>): IpcSkillsCommunityCatalogResult {
	const boards = {} as Record<CommunityBoard, CommunityBoardState>;
	let any = false;
	for (const board of COMMUNITY_BOARDS) {
		const state = boardState(board);
		if (state && state.skills.length > 0) any = true;
		boards[board] = state ?? { skills: [], total: 0, complete: false };
	}
	if (!any) return { status: "error", error: catalogError ?? "the catalogue is empty" };
	return { status: "ok", boards, root: communitySkillsDir(), installed, fetchedAt };
}

/** Slug -> folder, for the skills already installed under the user skills root. */
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

/** The cached catalogue, when it is still readable and still valid. */
async function readCache(): Promise<{ boards: Record<string, BoardProgress>; fetchedAt: string } | null> {
	try {
		const text = await fsp.readFile(catalogCacheFile(), "utf8");
		const parsed = JSON.parse(text) as {
			fetchedAt?: unknown;
			boards?: Record<string, { rows?: unknown; total?: unknown; nextPage?: unknown; complete?: unknown }>;
		};
		if (!parsed.boards || typeof parsed.boards !== "object") return null;
		const boards: Record<string, BoardProgress> = {};
		for (const board of COMMUNITY_BOARDS) {
			const raw = parsed.boards[board];
			if (!raw || !Array.isArray(raw.rows)) continue;
			const entry = emptyBoard();
			for (const row of raw.rows) {
				const parsedRow = parseCommunitySkill(row);
				if (!parsedRow || entry.seen.has(parsedRow.id)) continue;
				entry.seen.add(parsedRow.id);
				entry.rows.push(parsedRow);
			}
			entry.total = typeof raw.total === "number" && Number.isFinite(raw.total) ? raw.total : entry.rows.length;
			entry.nextPage =
				typeof raw.nextPage === "number" && Number.isFinite(raw.nextPage)
					? Math.max(1, Math.floor(raw.nextPage))
					: 1;
			entry.complete = raw.complete === true;
			boards[board] = entry;
		}
		return { boards, fetchedAt: typeof parsed.fetchedAt === "string" ? parsed.fetchedAt : "" };
	} catch {
		return null;
	}
}

async function writeCache(): Promise<void> {
	const file = catalogCacheFile();
	const partial = `${file}.${process.pid}.tmp`;
	const boards: Record<string, { rows: CommunitySkill[]; total: number; nextPage: number; complete: boolean }> = {};
	for (const board of COMMUNITY_BOARDS) {
		const entry = progress.get(board);
		if (!entry) continue;
		boards[board] = {
			rows: entry.rows,
			total: entry.total,
			nextPage: entry.nextPage,
			complete: entry.complete,
		};
	}
	try {
		await fsp.mkdir(path.dirname(file), { recursive: true });
		await fsp.writeFile(partial, JSON.stringify({ fetchedAt, boards }), "utf8");
		await fsp.rename(partial, file);
	} catch {
		await fsp.rm(partial, { force: true }).catch(() => {});
	}
}

let loading: Promise<IpcSkillsCommunityCatalogResult> | null = null;

/**
 * The catalogue the page lists. The cache answers instantly; a stale or missing
 * one is refreshed from page 1 of each board, and the rest of every board is
 * paged in behind it. Concurrent callers share one load.
 */
export async function readCatalog(): Promise<IpcSkillsCommunityCatalogResult> {
	if (loading) return loading;
	loading = (async () => {
		const installed = await installedCommunitySkills();
		const cached = await readCache();
		const fresh = cached && Date.now() - Date.parse(cached.fetchedAt) < CACHE_MAX_AGE_MS;
		if (cached && Number.isFinite(Date.parse(cached.fetchedAt)) && fresh) {
			for (const board of COMMUNITY_BOARDS) {
				const entry = cached.boards[board];
				if (entry) progress.set(board, entry);
			}
			fetchedAt = cached.fetchedAt;
			// A cached board that stopped early resumes where it stopped.
			startPumps();
			return snapshot(installed);
		}

		// Nothing usable on disk: fetch the first page of each board in order, so
		// one failing host does not cost the other two their first screenful.
		for (const board of COMMUNITY_BOARDS) {
			try {
				await pace();
				const answer = await fetchPage(board, 1);
				const entry = emptyBoard();
				progress.set(board, entry);
				absorb(board, 1, answer);
			} catch (error) {
				catalogError = `catalogue unavailable: ${String(error)}`;
				if (!progress.has(board)) progress.set(board, emptyBoard());
			}
		}
		if (progress.size > 0) fetchedAt = new Date().toISOString();
		await writeCache();
		startPumps();
		return snapshot(installed);
	})();
	try {
		return await loading;
	} finally {
		loading = null;
	}
}

/**
 * Re-fetch page 1 of every board, discarding what the pager had. The page's
 * refresh action: rows come back in rank order, and the background pager starts
 * over from page 2.
 */
export async function refreshCatalog(): Promise<IpcSkillsCommunityCatalogResult> {
	const installed = await installedCommunitySkills();
	for (const board of COMMUNITY_BOARDS) {
		try {
			await pace();
			const answer = await fetchPage(board, 1);
			const entry = emptyBoard();
			progress.set(board, entry);
			absorb(board, 1, answer);
			emit(board);
		} catch (error) {
			catalogError = `catalogue unavailable: ${String(error)}`;
		}
	}
	fetchedAt = new Date().toISOString();
	await writeCache();
	startPumps();
	return snapshot(installed);
}

/** One skill's files and its instructions, for the preview panel. */
export async function previewSkill(id: string): Promise<IpcSkillsCommunityPreviewResult> {
	const cleanId = typeof id === "string" ? id.trim() : "";
	const parts = cleanId.split("/");
	// A preview reads one URL on the index's own host and runs nothing, so the
	// only requirement is that the id cannot walk out of its path.
	if (parts.length < 2 || parts.some(part => !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(part))) {
		return { status: "error", error: "invalid skill id" };
	}
	try {
		const url = skillsApiUrl(`/api/download/${parts.map(encodeURIComponent).join("/")}`);
		const body = (await getJson(url, DOWNLOAD_MAX_BYTES)) as { files?: unknown } | null;
		const raw = body?.files;
		if (!Array.isArray(raw)) return { status: "error", error: "the download did not contain a file list" };
		const files: string[] = [];
		let skillMd = "";
		for (const item of raw) {
			if (!item || typeof item !== "object") continue;
			const record = item as Record<string, unknown>;
			const filePath = typeof record.path === "string" ? record.path : "";
			const contents = typeof record.contents === "string" ? record.contents : "";
			if (!filePath) continue;
			files.push(filePath);
			// The top-level SKILL.md is the skill; a nested one belongs to a script.
			if (!skillMd && /^SKILL\.md$/i.test(filePath)) skillMd = contents;
		}
		if (files.length === 0) return { status: "error", error: "the skill has no files" };
		return { status: "ok", id: cleanId, files, skillMd };
	} catch (error) {
		return { status: "error", error: `preview failed: ${String(error)}` };
	}
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

/** Whether `target` exists on disk, whatever it is. */
async function pathExists(target: string): Promise<boolean> {
	try {
		await fsp.access(target);
		return true;
	} catch {
		return false;
	}
}

/**
 * Download and install one skill into the WISA profile's agent/skills/<slug>.
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
	// The slug is a plain name, so this can only fail on a programming error -
	// but the destination is never assembled without the same join as the files.
	if (!dir) return { status: "error", error: "invalid skill id" };

	try {
		await fsp.mkdir(root, { recursive: true });
		await fsp.access(dir);
		return { status: "error", error: "already installed" };
	} catch {
		// Not there yet - expected.
	}

	let body: unknown;
	try {
		const url = skillsApiUrl(`/api/download/${[owner, repo, slug].map(encodeURIComponent).join("/")}`);
		body = await getJson(url, DOWNLOAD_MAX_BYTES);
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
