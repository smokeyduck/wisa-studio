import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appId, NotchAppStore, revisionInput } from "./notch-app-store";

const directories: string[] = [];
function temporaryDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), "wisa-notch-apps-"));
	directories.push(directory);
	return directory;
}
const source = {
	id: "clock",
	name: "Clock",
	html: "<script>document.body.textContent = Date.now()</script>",
	width: 320,
	height: 180,
};

afterEach(() => {
	for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("notch mini-app persistence", () => {
	it("keeps complete immutable revisions, active target and app state through restart", () => {
		const directory = temporaryDirectory();
		const store = new NotchAppStore(directory);
		store.save(source);
		const first = store.resolve({ id: source.id });
		store.save({ ...source, html: "<canvas></canvas><script>window.wisa.request('storage.get')</script>" });
		const second = store.resolve({ id: source.id });
		expect(first.revision.id).not.toBe(second.revision.id);
		store.commit({
			...store.data,
			active: first.target,
			apps: store.data.apps.map(app => ({ ...app, state: { count: 3 } })),
		});
		const restored = new NotchAppStore(directory);
		expect(restored.resolve({ id: source.id, revisionId: first.revision.id }).revision.html).toBe(source.html);
		expect(restored.resolve({ id: source.id }).revision.id).toBe(second.revision.id);
		expect(restored.data.active).toEqual(first.target);
		expect(restored.data.apps[0].state).toEqual({ count: 3 });
	});

	it("rejects corrupt stores without rewriting source", () => {
		const directory = temporaryDirectory();
		const file = join(directory, "notch-apps.json");
		const corrupt = '{"version":1,"apps":[';
		writeFileSync(file, corrupt);
		expect(() => new NotchAppStore(directory)).toThrow();
		expect(readFileSync(file, "utf8")).toBe(corrupt);
	});

	it("rejects a dangling active pointer and invalid imported dimensions", () => {
		const directory = temporaryDirectory();
		const store = new NotchAppStore(directory);
		store.save(source);
		const file = join(directory, "notch-apps.json");
		writeFileSync(file, JSON.stringify({ ...store.data, active: { appId: "clock", revisionId: "missing" } }));
		expect(() => new NotchAppStore(directory)).toThrow("Missing active revision");
		expect(() => revisionInput({ ...source, width: 1601 })).toThrow();
		expect(() => revisionInput({ ...source, height: Number.NaN })).toThrow();
		expect(() => revisionInput({ ...source, html: "x".repeat(524289) })).toThrow();
	});

	it("bounds IDs/state and does not mutate on rejected input", () => {
		const store = new NotchAppStore(temporaryDirectory());
		for (const id of ["../clock", "Clock", "a/b", "", "a".repeat(65)]) expect(() => appId(id)).toThrow();
		store.save(source);
		const before = JSON.stringify(store.data);
		expect(() => store.save({ ...source, width: 1 })).toThrow();
		expect(() => store.validateState({ value: "x".repeat(65536) })).toThrow();
		expect(() => store.validateState(undefined)).toThrow();
		expect(JSON.stringify(store.data)).toBe(before);
	});
});
