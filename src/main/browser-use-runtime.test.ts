import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BrowserUseRuntime } from "./browser-use-runtime";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function file(path: string, content = "") {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, content);
}

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "wisa-browser-update-"));
	roots.push(root);
	const resources = join(root, "resources");
	const data = join(root, "data");
	const payload = join(resources, "browser-use");
	const windows = process.platform === "win32";
	await Promise.all([
		file(join(payload, "version.json"), JSON.stringify({ version: "1.0.8", executable: "chromium/chrome" })),
		file(join(payload, "packages", "seed"), "local seed"),
		file(join(payload, "chromium", "chrome")),
		file(join(payload, windows ? "uv.exe" : "uv")),
		file(join(payload, windows ? "python/python.exe" : "python/bin/python3")),
		file(join(resources, "browser-use-bridge.py")),
	]);
	return { resources, data };
}

describe("Browser Use updates", () => {
	it("activates only a validated release, keeps open sessions pinned, and reloads the validated version after restart", async () => {
		const { resources, data } = await fixture();
		const runtime = new BrowserUseRuntime(resources, data, {
			release: async () => "1.0.9",
			install: ({ directory, version }) => file(join(directory, "packages", `browser_use-${version}.dist-info`, "METADATA"), version),
			check: async ({ env }) => {
				const version = await readFile(join(env.PYTHONPATH ?? "", "browser_use-1.0.9.dist-info", "METADATA"), "utf8");
				return JSON.stringify({ version });
			},
		});
		const previous = runtime.current;
		await expect(runtime.checkForUpdate()).resolves.toBe("1.0.9");
		expect(runtime.current?.version).toBe("1.0.9");
		expect(await readFile(join(previous?.packages ?? "", "seed"), "utf8")).toBe("local seed");
		expect(new BrowserUseRuntime(resources, data).current).toEqual(runtime.current);
	});

	it("keeps the working package selected when a newer wheel fails the Chromium check", async () => {
		const { resources, data } = await fixture();
		const runtime = new BrowserUseRuntime(resources, data, {
			release: async () => "1.0.9",
			install: ({ directory, version }) => file(join(directory, "packages", `browser_use-${version}.dist-info`, "METADATA"), version),
			check: async () => { throw new Error("Chromium start failed"); },
		});
		const previous = runtime.current;
		await expect(runtime.checkForUpdate()).rejects.toThrow("Chromium start failed");
		expect(runtime.current).toEqual(previous);
		expect(new BrowserUseRuntime(resources, data).current?.version).toBe("1.0.8");
	});
});
