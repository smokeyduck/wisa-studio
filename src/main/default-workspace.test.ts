/**
 * Contracts for the Work workspace. Its whole value is that it is NOT a
 * project, and the agent can only know that if the folder says so: the seed
 * file is what keeps a Work session from hunting for a repo and a test suite
 * that were never meant to exist there. A user's own edits must survive.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { ensureDefaultWorkspace } from "./default-workspace";

const tempDirs: string[] = [];

async function tempAgentDir(): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omp-work-"));
	tempDirs.push(dir);
	vi.stubEnv("PI_CODING_AGENT_DIR", path.join(dir, "agent"));
	return dir;
}

afterEach(() => {
	vi.unstubAllEnvs();
});

afterAll(async () => {
	await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

describe("ensureDefaultWorkspace", () => {
	it("creates the workspace beside the agent dir and seeds AGENTS.md", async () => {
		const dir = await tempAgentDir();
		const cwd = ensureDefaultWorkspace();
		expect(cwd).toBe(path.join(dir, "work"));
		const seeded = await fs.readFile(path.join(cwd, "AGENTS.md"), "utf8");
		// The two facts the agent cannot infer from the folder: no repo, and
		// where such work actually belongs.
		expect(seeded).toContain("not a project");
		expect(seeded).toContain("Code session");
	});

	it("never overwrites an AGENTS.md the user wrote", async () => {
		const dir = await tempAgentDir();
		const cwd = path.join(dir, "work");
		await fs.mkdir(cwd, { recursive: true });
		await fs.writeFile(path.join(cwd, "AGENTS.md"), "my own rules\n");
		expect(ensureDefaultWorkspace()).toBe(cwd);
		expect(await fs.readFile(path.join(cwd, "AGENTS.md"), "utf8")).toBe("my own rules\n");
	});

	it("is idempotent", async () => {
		await tempAgentDir();
		const first = ensureDefaultWorkspace();
		const seeded = await fs.readFile(path.join(first, "AGENTS.md"), "utf8");
		expect(ensureDefaultWorkspace()).toBe(first);
		expect(await fs.readFile(path.join(first, "AGENTS.md"), "utf8")).toBe(seeded);
	});
});
