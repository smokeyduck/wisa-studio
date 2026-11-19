import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEV_CONFIG_DIR, DEV_STRIPPED_ENV, devProfilePaths } from "./dev-profile";
import { resolveDevSidecar } from "./dev-sidecar";

describe("devProfilePaths", () => {
	it("gives a dev run its own userData and agent profile", () => {
		const paths = devProfilePaths("/home/u/.config", "/home/u");
		expect(paths.userData).toBe("/home/u/.config/wisa-studio-dev");
		// Relative, so omp resolves it against $HOME — an absolute value here would
		// be joined again by the CLI and land in a nested directory.
		expect(paths.configDir).toBe(DEV_CONFIG_DIR);
		expect(paths.configDir.startsWith("/")).toBe(false);
		expect(paths.agentDir).toBe("/home/u/.omp-dev/agent");
	});

	it("names every session-scoped variable a dev run must not inherit", () => {
		// `bun run dev` from inside an omp session exports these; keeping them
		// would point a dev window at the parent agent's live session file.
		expect([...DEV_STRIPPED_ENV]).toEqual(["PI_SESSION_FILE", "PI_SESSION_ID", "PI_TOOL_CALL_ID"]);
	});

	it("keeps the dev profile away from the installed app and the production profile", () => {
		const paths = devProfilePaths("/home/u/.config", "/home/u");
		expect(paths.userData).not.toBe("/home/u/.config/omp");
		expect(paths.userData).not.toBe("/home/u/.config/@oh-my-pi/omp-gui");
		expect(paths.agentDir).not.toBe("/home/u/.omp/agent");
	});
});

describe("resolveDevSidecar", () => {
	let home: string;

	beforeEach(async () => {
		home = await mkdtemp(join(tmpdir(), "omp-gui-dev-cli-"));
	});

	afterEach(async () => {
		await rm(home, { recursive: true, force: true });
	});

	// A shell script stands in for the agent: it answers `stats --help` the way a
	// flag-compatible sidecar does, without a 300 MB binary in the test.
	async function fakeSidecar(path: string, supportsNoOpen: boolean): Promise<void> {
		await mkdir(join(path, ".."), { recursive: true });
		const flag = supportsNoOpen ? "--no-open" : "--json";
		await writeFile(
			path,
			["#!/bin/sh", '[ "$2" = "--help" ] || exit 0', "echo FLAGS", `echo "  ${flag}"`, "exit 0", ""].join("\n"),
		);
		await chmod(path, 0o755);
	}

	it("returns null when the machine has neither an installed app nor a CLI", () => {
		expect(resolveDevSidecar(home, null)).toBeNull();
	});

	it("prefers an installed app's sidecar over a lagging CLI", async () => {
		const cli = join(home, ".bun", "install", "global", "node_modules", "@oh-my-pi", "pi-coding-agent", "dist");
		await fakeSidecar(join(cli, "cli.js"), false);
		const bundle = join(home, "Applications", "WISA STUDIO.app", "Contents", "Resources", "omp");
		await fakeSidecar(bundle, true);

		expect(resolveDevSidecar(home, null)).toEqual({ path: bundle, kind: "bundle" });
	});

	it("skips an installed sidecar that rejects the GUI's flags and reports the CLI", async () => {
		const bundle = join(home, "Applications", "omp.app", "Contents", "Resources", "omp");
		await fakeSidecar(bundle, false);
		const cli = join(home, ".bun", "install", "global", "node_modules", "@oh-my-pi", "pi-coding-agent", "dist");
		await fakeSidecar(join(cli, "cli.js"), false);

		expect(resolveDevSidecar(home, null)).toEqual({ path: join(cli, "cli.js"), kind: "cli" });
	});

	it("ignores a non-executable candidate", async () => {
		const bundle = join(home, "Applications", "omp.app", "Contents", "Resources", "omp");
		await fakeSidecar(bundle, true);
		await chmod(bundle, 0o644);

		expect(resolveDevSidecar(home, null)).toBeNull();
	});
});
