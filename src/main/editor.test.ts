import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { openInExternalEditor } from "./editor";

const fixture = vi.hoisted(() => ({ temp: "", file: "" }));
vi.mock("electron", () => ({ app: { getPath: () => fixture.temp } }));
vi.mock("./shell-env", () => ({
	resolveEditorCommand: async () => "fixture-editor",
	spawnPath: async () => "/os/bin",
}));
vi.mock("node:child_process", () => ({
	execFile: vi.fn(),
	spawn: (_editor: string, args: string[]) => {
		fixture.file = args[0];
		const child = new EventEmitter();
		void readFile(fixture.file, "utf8").then(async text => {
			expect(text).toBe("draft");
			await writeFile(fixture.file, "edited\n");
			child.emit("exit", 0, null);
		});
		return child;
	},
}));

afterEach(async () => {
	if (fixture.temp) await rm(fixture.temp, { recursive: true, force: true });
});

it("keeps editor drafts in the application temp directory and deletes them after roundtrip", async () => {
	fixture.temp = await mkdtemp(join(tmpdir(), "wisa-editor-test-"));
	expect(await openInExternalEditor("draft")).toEqual({ text: "edited" });
	expect(dirname(fixture.file)).toBe(fixture.temp);
	await expect(readFile(fixture.file, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
});
