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
import { agentDir } from "./agent-paths";
import { safeJoin } from "./install-safety";
import { communitySkillsDir, installSkill, parseCommunitySkill, searchSkills, skillsApiUrl } from "./skills-community";

const ID = "anthropics/skills/pdf";
const SEARCH_URL = "https://skills.sh/api/search";
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

	it("drops rows whose id could never be a folder, and fills missing fields from it", () => {
		expect(parseCommunitySkill({ id: "../../etc/passwd" })).toBeNull();
		expect(parseCommunitySkill({ id: "owner/repo" })).toBeNull();
		expect(parseCommunitySkill({ id: "owner/repo/a/b" })).toBeNull();
		expect(parseCommunitySkill({})).toBeNull();
		expect(parseCommunitySkill({ id: ID, installs: -5 })).toMatchObject({
			name: "pdf",
			source: "anthropics/skills",
			installs: 0,
		});
	});
});

describe("searchSkills", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("refuses a query shorter than the API's minimum before touching the network", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		await expect(searchSkills("a")).resolves.toMatchObject({ status: "error" });
		await expect(searchSkills("  ")).resolves.toMatchObject({ status: "error" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("asks skills.sh only, dedupes rows, and reports what is already installed", async () => {
		const dir = await mkdtemp(path.join(tmpdir(), "omp-community-search-"));
		vi.stubEnv("PI_CODING_AGENT_DIR", path.join(dir, "agent"));
		await mkdir(path.join(dir, "agent", "skills", "pdf"), { recursive: true });
		const fetchMock = vi.fn(async () =>
			json({
				skills: [
					{ id: ID, skillId: "pdf", name: "pdf", installs: 233721, source: "anthropics/skills" },
					{ id: ID, skillId: "pdf", name: "pdf", installs: 233721, source: "anthropics/skills" },
					{ id: "../../evil", name: "evil" },
				],
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const result = await searchSkills("pdf");
		expect(result.status).toBe("ok");
		if (result.status !== "ok") return;
		expect(result.skills.map(skill => skill.id)).toEqual([ID]);
		expect(result.skills[0].installs).toBe(233721);
		expect(result.installed?.pdf).toBe(path.join(dir, "agent", "skills", "pdf"));

		const [url] = fetchMock.mock.calls[0] as unknown as [URL];
		expect(String(url)).toBe(`${SEARCH_URL}?q=pdf`);
		expect(url.hostname).toBe("skills.sh");
		expect(url.protocol).toBe("https:");
		await rm(dir, { recursive: true, force: true });
		vi.unstubAllEnvs();
	});

	it("reports an oversized answer as an error instead of buffering it", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => json({ skills: [], padding: "x".repeat(3 * 1024 * 1024) })),
		);
		await expect(searchSkills("pdf")).resolves.toMatchObject({ status: "error" });
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
