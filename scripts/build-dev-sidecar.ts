#!/usr/bin/env bun
/**
 * `bun run build:omp:dev` — resolve the sidecar a dev run will use, and build
 * one only when it can be built.
 *
 * The GUI falls back to an installed sidecar or omp CLI when `resources/omp` is
 * absent (src/main/dev-sidecar.ts), so `bun run dev` works from a clean
 * checkout. This script answers "which agent will my dev window run?" using that
 * same resolver — duplicating the path list here once reported the wrong binary
 * — and, when the monorepo neighbor exists, delegates to build-bundled-omp.ts
 * instead of guessing.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import { resolveDevSidecar } from "../src/main/dev-sidecar";

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

// Same resolution order the app itself uses (src/main/dev-sidecar.ts): an
// installed bundle's sidecar first, an installed CLI last — and a CLI one
// release line behind the pinned sidecar is a degraded fallback, not a peer.
const resolved = resolveDevSidecar();

console.log(
	[
		"dev sidecar: none in resources/, and the omp monorepo is not next to this checkout.",
		"",
		resolved
			? `  bun run dev will use the ${resolved.kind === "bundle" ? "installed app's sidecar" : "installed omp CLI"}: ${resolved.path}`
			: "  No sidecar found — `bun run dev` will report a missing sidecar.",
		...(resolved && (!resolved.capabilities.noAutoResume || !resolved.capabilities.statsNoOpen)
			? [
					"",
					"  WARNING: that binary predates flags this GUI passes; they are omitted at spawn,",
					"  so the agent and stats dashboard still start — but it is NOT the pinned sidecar.",
				]
			: []),
		"",
		"To compile the bundled sidecar instead, place this repo at packages/gui/ inside a",
		"monorepo clone (packages/coding-agent, packages/natives) and re-run this script.",
		"",
	].join("\n"),
);
process.exit(0);
