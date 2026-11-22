import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bundledOmpFilename, resolveBundledOmp } from "./bundled-omp-path";

describe("bundledOmpFilename", () => {
	it("uses the host sidecar filename", () => {
		expect(bundledOmpFilename()).toBe(process.platform === "win32" ? "omp.exe" : "omp");
	});
});

describe("resolveBundledOmp", () => {
	const roots: string[] = [];
	afterEach(() => {
		vi.unstubAllEnvs();
		for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
	});

	it("packaged ignores inherited overrides and cwd/app ancestors, even when its binary is missing", () => {
		const root = mkdtempSync(join(tmpdir(), "wisa-bundled-"));
		roots.push(root);
		const resources = join(root, "package", "resources");
		mkdirSync(resources, { recursive: true });
		mkdirSync(join(root, "resources"));
		const foreign = join(root, "resources", bundledOmpFilename());
		writeFileSync(foreign, "foreign");
		vi.stubEnv("OMP_BUNDLED_OMP", foreign);
		expect(resolveBundledOmp(true, resources, root)).toBeNull();
		expect(resolveBundledOmp(true, undefined, root)).toBeNull();
		const shipped = join(resources, bundledOmpFilename());
		writeFileSync(shipped, "wisa");
		expect(resolveBundledOmp(true, resources, root)).toBe(shipped);
	});

	it("retains explicit dev binary overrides", () => {
		const root = mkdtempSync(join(tmpdir(), "wisa-dev-bundled-"));
		roots.push(root);
		const override = join(root, bundledOmpFilename());
		writeFileSync(override, "dev");
		vi.stubEnv("OMP_BUNDLED_OMP", override);
		expect(resolveBundledOmp(false, undefined, root)).toBe(override);
	});
});
