/**
 * Contracts for the skills.sh community installer.
 *
 * Everything this module installs came off the network, so the two things that
 * matter are that a hostile file tree is refused rather than written, and that
 * a failed or rejected install leaves the user's skills folder exactly as it
 * was. Both are asserted against a real temporary agent directory with `fetch`
 * stubbed, the same idiom `templates.test.ts` uses.
 */
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isCommunitySkillId } from "../shared/skills-community";
import { agentDir } from "./agent-paths";
import { safeJoin } from "./install-safety";
import {
	communitySkillsDir,
	installSkill,
	parseCommunitySkill,
	previewSkill,
	readCatalog,
	resetCatalogState,
	setCatalogPacingForTests,
	skillsApiUrl,
} from "./skills-community";

const ID = "anthropics/skills/pdf";
const DOWNLOAD_URL = `https://skills.sh/api/download/${ID}`;

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function download(files: Array<{ path: string; contents: string }>): Response {
	return json({ hash: "0".repeat(64), files });
}

/** A minimal but complete skill: the installer refuses a tree without SKILL.md. */
function skillFiles(): Array<{ path: string; contents: string }> {
	return [
		{ path: "SKILL.md", contents: "# pdf\n\nFill forms.\n" },
		{ path: "FORMS.md", contents: "# Forms\n" },
		{ path: "scripts/fill.py", contents: "print('hi')\n" },
	];
}

describe("safeJoin", () => {
	const root = path.join(path.sep, "srv", "skills");

	it("keeps an ordinary relative path inside the root", () => {
		expect(safeJoin(root, "SKILL.md")).toBe(path.join(root, "SKILL.md"));
		expect(safeJoin(root, "scripts/fill.py")).toBe(path.join(root, "scripts", "fill.py"));
	});

	it("refuses every shape that would leave the root", () => {
		for (const hostile of [
			"/etc/passwd", // absolute
			"../../outside.txt", // parent traversal
			"scripts/../../outside.txt", // traversal mid-path
			"a/../b", // `..` even when it lands back inside
			"scripts\\fill.py", // backslash: separator on Windows, literal on POSIX
			"C:\\Windows\\system.ini", // drive letter
			"C:/Windows/system.ini",
			"\\\\server\\share\\x", // UNC
			"//server/share/x",
			"", // empty
			"SKILL.md\0/../../x", // NUL truncates at the syscall boundary
			"./SKILL.md", // `.` segment
		]) {
			expect(safeJoin(root, hostile), hostile).toBeNull();
		}
	});
});

describe("skillsApiUrl", () => {
	it("only ever builds https URLs on skills.sh", () => {
		expect(skillsApiUrl("/api/search").href).toBe("https://skills.sh/api/search");
		expect(skillsApiUrl("/api/download/a/b/c").hostname).toBe("skills.sh");
	});

	it("refuses a URL that would leave the host", () => {
		expect(() => skillsApiUrl("https://evil.example/api/search")).toThrow();
		expect(() => skillsApiUrl("http://skills.sh/api/search")).toThrow();
		expect(() => skillsApiUrl("//evil.example/api/search")).toThrow();
		expect(() => skillsApiUrl("https://user:pw@skills.sh/api/search")).toThrow();
	});
});

describe("parseCommunitySkill", () => {
	it("keeps a usable row and clamps its quality signal", () => {
		expect(
			parseCommunitySkill({ id: ID, skillId: "pdf", name: "pdf", installs: 12.7, source: "anthropics/skills" }),
		).toEqual({
			id: ID,
			skillId: "pdf",
			name: "pdf",
			source: "anthropics/skills",
			installs: 12,
		});
	});

	it("drops rows that could walk out of a path, and fills missing fields from the slug", () => {
		expect(parseCommunitySkill({ source: "..", skillId: "etc" })).toBeNull();
		expect(parseCommunitySkill({ source: "owner/repo", skillId: ".." })).toBeNull();
		expect(parseCommunitySkill({ source: "", skillId: "pdf" })).toBeNull();
		expect(parseCommunitySkill({})).toBeNull();
		expect(parseCommunitySkill({ source: "anthropics/skills", skillId: "pdf", installs: -5 })).toMatchObject({
			id: ID,
			name: "pdf",
			source: "anthropics/skills",
			installs: 0,
		});
	});
});

describe("readCatalog", () => {
	const tempDirs: string[] = [];

	beforeEach(async () => {
		const dir = await mkdtemp(path.join(tmpdir(), "omp-community-catalog-"));
		tempDirs.push(dir);
		vi.stubEnv("PI_CODING_AGENT_DIR", path.join(dir, "agent"));
		// The catalogue is process-wide; each case starts from nothing, and pages
		// arrive instantly rather than at the index's 30-a-minute pace.
		resetCatalogState();
		setCatalogPacingForTests(0);
	});

	afterEach(() => {
		resetCatalogState();
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	afterAll(async () => {
		await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
	});

	it("fetches page 1 of every board and reports each board's own total", async () => {
		const fetchMock = vi.fn(async (url: URL) => {
			const parts = String(url).split("/");
			const board = parts.at(-2);
			const page = Number(parts.at(-1));
			return json({
				skills:
					page === 1
						? [{ skillId: `${board}-skill`, name: `${board}-skill`, source: "owner/repo", installs: 5 }]
						: [],
				total: 4000,
				hasMore: page === 1,
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await readCatalog();
		expect(result.status).toBe("ok");
		if (result.status !== "ok") return;
		expect(Object.keys(result.boards).sort()).toEqual(["all-time", "hot", "trending"]);
		for (const board of ["all-time", "trending", "hot"] as const) {
			expect(result.boards[board].skills.map(skill => skill.id)).toEqual([`owner/repo/${board}-skill`]);
			expect(result.boards[board].total).toBe(4000);
		}
		expect(result.root).toBe(communitySkillsDir());
		// The page waits for page 1 of every board; later pages arrive behind it.
		const first = fetchMock.mock.calls.slice(0, 3).map(call => String(call[0]));
		expect(first).toEqual([
			"https://skills.sh/api/skills/all-time/1",
			"https://skills.sh/api/skills/trending/1",
			"https://skills.sh/api/skills/hot/1",
		]);
		const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
		expect(init.credentials).toBe("omit");
		expect(init.redirect).toBe("error");
	});

	it("drops rows that could not become a folder, and reports what is installed", async () => {
		await mkdir(path.join(communitySkillsDir(), "pdf"), { recursive: true });
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				json({
					skills: [
						{ skillId: "pdf", name: "pdf", source: "anthropics/skills", installs: 10 },
						{ skillId: "a:b", name: "colon", source: "owner/repo" },
						{ skillId: "x", name: "two-segment", source: "owner" },
						{ skillId: "../../etc", name: "hostile", source: "owner/repo" },
					],
					total: 4,
					hasMore: false,
				}),
			),
		);

		const result = await readCatalog();
		expect(result.status).toBe("ok");
		if (result.status !== "ok") return;
		// Browsable, because the catalogue is the index's and its counts should add
		// up; only the clean id can be installed.
		expect(result.boards["all-time"].skills.map(skill => skill.id)).toEqual([
			"anthropics/skills/pdf",
			"owner/repo/a:b",
			"owner/x",
		]);
		expect(
			result.boards["all-time"].skills.filter(skill => isCommunitySkillId(skill.id)).map(skill => skill.id),
		).toEqual(["anthropics/skills/pdf"]);
		expect(result.boards["all-time"].complete).toBe(true);
		expect(result.installed).toEqual({ pdf: path.join(communitySkillsDir(), "pdf") });
	});

	it("answers with an error rather than an empty catalogue when the index is unreachable", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("offline");
			}),
		);
		await expect(readCatalog()).resolves.toMatchObject({ status: "error" });
	});

	it("keeps the cached catalogue when the index answers with nothing usable", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				json({ skills: [{ skillId: "pdf", name: "pdf", source: "anthropics/skills" }], total: 1, hasMore: false }),
			),
		);
		await expect(readCatalog()).resolves.toMatchObject({ status: "ok" });

		// A fresh process reads the cache instead of the network.
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const result = await readCatalog();
		expect(result.status).toBe("ok");
		if (result.status !== "ok") return;
		expect(result.boards["all-time"].skills.map(skill => skill.id)).toEqual(["anthropics/skills/pdf"]);
	});
});

describe("previewSkill", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns the skill's instructions and its file list without writing anything", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => download(skillFiles())),
		);
		const result = await previewSkill(ID);
		expect(result).toMatchObject({ status: "ok", id: ID, files: ["SKILL.md", "FORMS.md", "scripts/fill.py"] });
		if (result.status !== "ok") return;
		expect(result.skillMd).toContain("Fill forms");
	});

	it("refuses an id that would walk out of its path, before touching the network", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		for (const id of ["", "pdf", "../etc/passwd", "owner/repo/../../x", "owner//pdf"]) {
			await expect(previewSkill(id), id).resolves.toMatchObject({ status: "error" });
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("reports an unusable download as an error", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => json({ files: [] })),
		);
		await expect(previewSkill(ID)).resolves.toMatchObject({ status: "error" });
	});
});

describe("installSkill", () => {
	const tempDirs: string[] = [];

	beforeEach(async () => {
		const dir = await mkdtemp(path.join(tmpdir(), "omp-community-"));
		tempDirs.push(dir);
		vi.stubEnv("PI_CODING_AGENT_DIR", path.join(dir, "agent"));
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	afterAll(async () => {
		await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
	});

	it("installs into the user skills folder every project sees", () => {
		expect(communitySkillsDir()).toBe(path.join(agentDir(), "skills"));
	});

	it("refuses an id that is not `owner/repo/slug` before touching the network", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		for (const id of ["", "../etc", "owner/repo", "owner/repo/../x", "/abs/slug", "owner/repo/a/b"]) {
			await expect(installSkill(id), id).resolves.toMatchObject({ status: "error" });
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("installs a skill from a stubbed download and reports where it landed", async () => {
		const fetchMock = vi.fn(async () => download(skillFiles()));
		vi.stubGlobal("fetch", fetchMock);

		const result = await installSkill(ID);
		expect(result.status).toBe("ok");
		if (result.status !== "ok") return;

		const expected = path.join(communitySkillsDir(), "pdf");
		expect(result.dir).toBe(expected);
		expect(result.files).toBe(3);
		expect(await readFile(path.join(expected, "SKILL.md"), "utf8")).toContain("Fill forms");
		expect(await readFile(path.join(expected, "scripts", "fill.py"), "utf8")).toBe("print('hi')\n");
		// The staging folder is renamed away, never left beside the install.
		expect((await readdir(communitySkillsDir())).filter(name => name.includes(".partial"))).toEqual([]);

		const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
		expect(String(url)).toBe(DOWNLOAD_URL);
		expect(init.credentials).toBe("omit");
		expect(init.redirect).toBe("error");
	});

	it("refuses to overwrite a skill that is already installed", async () => {
		const fetchMock = vi.fn(async () => download(skillFiles()));
		vi.stubGlobal("fetch", fetchMock);
		await expect(installSkill(ID)).resolves.toMatchObject({ status: "ok" });
		fetchMock.mockClear();
		await expect(installSkill(ID)).resolves.toMatchObject({ status: "error", error: "already installed" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects a file tree with a hostile path and writes nothing", async () => {
		for (const hostile of ["../escape.md", "/etc/passwd", "a\\b.md", "C:\\x.md", "..\\escape.md"]) {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () =>
					download([
						{ path: "SKILL.md", contents: "# ok\n" },
						{ path: hostile, contents: "pwn" },
					]),
				),
			);
			const result = await installSkill(ID);
			expect(result, hostile).toMatchObject({ status: "error" });
			expect(existsSync(path.join(communitySkillsDir(), "pdf"))).toBe(false);
			// Nothing escaped into the agent directory or above it.
			expect(existsSync(path.join(agentDir(), "escape.md"))).toBe(false);
			expect(existsSync(path.join(agentDir(), "skills", "escape.md"))).toBe(false);
		}
		expect(existsSync(path.join(communitySkillsDir(), "pdf"))).toBe(false);
	});

	it("caps how many files one skill may carry", async () => {
		const files = [{ path: "SKILL.md", contents: "# ok\n" }];
		for (let index = 0; index < 2_000; index += 1) files.push({ path: `f${index}.md`, contents: "x" });
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => download(files)),
		);
		await expect(installSkill(ID)).resolves.toMatchObject({ status: "error" });
		expect(existsSync(path.join(communitySkillsDir(), "pdf"))).toBe(false);
	});

	it("caps how large one file may be", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				download([
					{ path: "SKILL.md", contents: "# ok\n" },
					{ path: "big.bin", contents: "x".repeat(2 * 1024 * 1024 + 1) },
				]),
			),
		);
		await expect(installSkill(ID)).resolves.toMatchObject({ status: "error" });
		expect(existsSync(path.join(communitySkillsDir(), "pdf"))).toBe(false);
	});

	it("caps how large the whole download may be", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => json({ files: [], padding: "x".repeat(17 * 1024 * 1024) })),
		);
		await expect(installSkill(ID)).resolves.toMatchObject({ status: "error" });
		expect(existsSync(path.join(communitySkillsDir(), "pdf"))).toBe(false);
	});

	it("refuses a tree without SKILL.md, and one that names a file twice", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => download([{ path: "notes.md", contents: "x" }])),
		);
		await expect(installSkill(ID)).resolves.toMatchObject({ status: "error" });

		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				download([
					{ path: "SKILL.md", contents: "# ok\n" },
					{ path: "SKILL.md", contents: "# twice\n" },
				]),
			),
		);
		await expect(installSkill(ID)).resolves.toMatchObject({ status: "error" });
		expect(existsSync(path.join(communitySkillsDir(), "pdf"))).toBe(false);
	});

	it("reports an HTTP failure and a network failure as errors", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => json({ error: "nope" }, 404)),
		);
		await expect(installSkill(ID)).resolves.toMatchObject({ status: "error" });
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("offline");
			}),
		);
		await expect(installSkill(ID)).resolves.toMatchObject({ status: "error" });
		expect(existsSync(path.join(communitySkillsDir(), "pdf"))).toBe(false);
	});
});
