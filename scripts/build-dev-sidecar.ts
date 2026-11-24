#!/usr/bin/env bun
/**
 * `bun run build:omp:dev`, the preflight for `bun run dev`: require the
 * pinned sidecar, an explicit dev override, or build from monorepo source.
 *
 * No installed-app or global-CLI fallback: those binaries predate the isolation
 * environment (PI_CONFIG_SOURCES / PI_PROJECT_CONFIG_DIR) and would read the
 * user's ~/.omp. A checkout with neither a sidecar nor the monorepo fails here.
 */
import { existsSync, statSync } from "node:fs";
import * as path from "node:path";
import { bundledOmpFilename, resolveOmpCandidate } from "../src/main/bundled-omp-path";

const guiRoot = path.join(import.meta.dir, "..");
const override = process.env.OMP_BUNDLED_OMP;
if (override) {
	if (!statSync(override, { throwIfNoEntry: false })?.isFile()) {
		console.error(`dev sidecar: OMP_BUNDLED_OMP is not a file: ${override}`);
		process.exit(1);
	}
	console.log(`dev sidecar: ${path.resolve(override)}`);
	process.exit(0);
}

const repoRoot = path.join(guiRoot, "..", "..");
const monorepoReady = existsSync(path.join(repoRoot, "packages", "coding-agent", "scripts", "compile-binary.ts"));
const sidecar = resolveOmpCandidate(guiRoot, "resources", bundledOmpFilename());

if (sidecar) {
	console.log(`dev sidecar: ${sidecar}`);
	process.exit(0);
}

if (monorepoReady) {
	console.log("dev sidecar: none in resources/, building from monorepo source…");
	const built = Bun.spawnSync(["bun", "run", "build:omp"], { cwd: guiRoot, stdio: ["inherit", "inherit", "inherit"] });
	process.exit(built.exitCode ?? 1);
}

console.error(
	[
		`dev sidecar missing: resources/${bundledOmpFilename()} not found, and the omp monorepo is not next to this checkout.`,
		"",
		"  - Build from source: place this repo at packages/gui/ inside an omp monorepo clone",
		"    (packages/coding-agent, packages/natives), then run `bun run build:omp`.",
		"  - Or copy a prebuilt sidecar for this host into resources/ under the name above,",
		"    or set OMP_BUNDLED_OMP to its path. It must honor PI_CONFIG_SOURCES and PI_PROJECT_CONFIG_DIR.",
		"",
	].join("\n"),
);
process.exit(1);
