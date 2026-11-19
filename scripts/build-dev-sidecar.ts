#!/usr/bin/env bun
/**
 * `bun run build:omp:dev` — resolve the sidecar a dev run will use, and build
 * one only when it can be built.
 *
 * The GUI falls back to an installed omp CLI when `resources/omp` is absent
 * (src/main/dev-sidecar.ts), so `bun run dev` works from a clean checkout. This
 * script answers "which agent will my dev window run?" and, when the monorepo
 * neighbor exists, delegates to build-bundled-omp.ts instead of guessing.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";

const guiRoot = path.join(import.meta.dir, "..");
const repoRoot = path.join(guiRoot, "..", "..");
const monorepoReady = existsSync(path.join(repoRoot, "packages", "coding-agent", "scripts", "compile-binary.ts"));
const sidecar = ["omp", "omp.x64", "omp.exe"].map(name => path.join(guiRoot, "resources", name)).find(existsSync);

if (sidecar) {
	console.log(`dev sidecar: ${sidecar}`);
	process.exit(0);
}

if (monorepoReady) {
	console.log("dev sidecar: none in resources/ — building from monorepo source…");
	const built = Bun.spawnSync(["bun", "run", "build:omp"], { cwd: guiRoot, stdio: ["inherit", "inherit", "inherit"] });
	process.exit(built.exitCode ?? 1);
}

const installed = [
	path.join(homedir(), ".bun", "install", "global", "node_modules", "@oh-my-pi", "pi-coding-agent", "dist", "cli.js"),
	path.join(homedir(), ".bun", "bin", "omp"),
	"/usr/local/bin/omp",
	"/opt/homebrew/bin/omp",
].find(existsSync);

console.log(
	[
		"dev sidecar: none in resources/, and the omp monorepo is not next to this checkout.",
		"",
		installed
			? `  bun run dev will use the installed omp CLI: ${installed}`
			: "  No installed omp CLI found — `bun run dev` will report a missing sidecar.",
		"",
		"To compile the bundled sidecar instead, place this repo at packages/gui/ inside a",
		"monorepo clone (packages/coding-agent, packages/natives) and re-run this script.",
		"",
	].join("\n"),
);
process.exit(0);
