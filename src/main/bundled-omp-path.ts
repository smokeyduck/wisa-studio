import { existsSync } from "node:fs";
import { join } from "node:path";

/** Filename of the bundled omp sidecar on this platform. */
export function bundledOmpFilename(): string {
	return process.platform === "win32" ? "omp.exe" : "omp";
}

/** Resolve a bundled sidecar path, accepting a Windows .exe suffix when needed. */
export function resolveOmpCandidate(...parts: string[]): string | null {
	const candidate = join(...parts);
	if (existsSync(candidate)) return candidate;
	if (process.platform === "win32" && !candidate.toLowerCase().endsWith(".exe")) {
		const withExe = `${candidate}.exe`;
		if (existsSync(withExe)) return withExe;
	}
	return null;
}

/** Packaged WISA runs only its shipped sidecar; dev overrides must support profile isolation. */
export function resolveBundledOmp(
	packaged: boolean,
	resourcesPath: string | undefined,
	appPath: string,
): string | null {
	const name = bundledOmpFilename();
	if (packaged) return resourcesPath ? resolveOmpCandidate(resourcesPath, name) : null;
	const override = process.env.OMP_BUNDLED_OMP;
	if (override && existsSync(override)) return override;
	if (resourcesPath) {
		const bundled = resolveOmpCandidate(resourcesPath, name);
		if (bundled) return bundled;
	}
	for (const start of [appPath, process.cwd()]) {
		let dir = start;
		for (let i = 0; i < 8; i++) {
			const direct = resolveOmpCandidate(dir, "resources", name);
			if (direct) return direct;
			const nested = resolveOmpCandidate(dir, "packages", "gui", "resources", name);
			if (nested) return nested;
			const parent = join(dir, "..");
			if (parent === dir) break;
			dir = parent;
		}
	}
	return null;
}
