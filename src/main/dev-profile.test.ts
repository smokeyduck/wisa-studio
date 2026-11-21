import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEV_CONFIG_DIR, DEV_STRIPPED_ENV, devProfilePaths } from "./dev-profile";
import { FULL_CAPABILITIES, resolveDevSidecar } from "./dev-sidecar";

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

	/**
	 * A shell script stands in for the agent, without a 300 MB binary in the
	 * test. It answers both probes the way a binary with the given capabilities
	 * does: `stats --help` lists `--no-open` only when supported, and the
	 * `--mode=… --no-auto-resume` probe reports an unknown flag only when not.
	 */
	async function fakeSidecar(path: string, caps: { noOpen: boolean; noAutoResume: boolean }): Promise<void> {
		await mkdir(join(path, ".."), { recursive: true });
		const lines = ["#!/bin/sh"];
		lines.push('case "$*" in');
		lines.push("  *--help*)");
		lines.push("    echo USAGE");
		lines.push(`    echo "      ${caps.noOpen ? "--no-open       Start without a browser" : "--json"}"`);
		lines.push("    exit 0 ;;");
		lines.push("esac");
		if (!caps.noAutoResume) lines.push('echo "Error: unknown flag: --no-auto-resume" >&2');
		lines.push("exit 0");
		await writeFile(path, `${lines.join("\n")}\n`);
		await chmod(path, 0o755);
	}

	// The bun-global CLI entry the resolver treats as the last-resort fallback.
	const CLI_ENTRY = [".bun", "install", "global", "node_modules", "@oh-my-pi", "pi-coding-agent", "dist", "cli.js"];

	it("returns null when the machine has neither an installed app nor a CLI", () => {
		expect(resolveDevSidecar(home, null)).toBeNull();
	});

	it("prefers an installed app's sidecar over a lagging CLI", async () => {
		await fakeSidecar(join(home, ...CLI_ENTRY), { noOpen: false, noAutoResume: false });
		const bundle = join(home, "Applications", "WISA STUDIO.app", "Contents", "Resources", "omp");
		await fakeSidecar(bundle, { noOpen: true, noAutoResume: true });

		expect(resolveDevSidecar(home, null)).toEqual({ path: bundle, kind: "bundle", capabilities: FULL_CAPABILITIES });
	});

	it("finds the sidecar inside a running WISA STUDIO AppImage mount", async () => {
		// The mount is named after the app id (`wisa-studio`), not `omp`; matching
		// only `.mount_omp` dropped a dev run onto a lagging CLI.
		const tmp = join(home, "tmp");
		const mount = join(tmp, ".mount_wisa-sUCyleB", "resources", "omp");
		await fakeSidecar(mount, { noOpen: true, noAutoResume: true });

		expect(resolveDevSidecar(home, tmp)).toEqual({ path: mount, kind: "bundle", capabilities: FULL_CAPABILITIES });
	});

	it("still reads a mount from the previous `omp` app id", async () => {
		const tmp = join(home, "tmp");
		const mount = join(tmp, ".mount_omp-0.f8PPNn", "resources", "omp");
		await fakeSidecar(mount, { noOpen: true, noAutoResume: true });

		expect(resolveDevSidecar(home, tmp)).toEqual({ path: mount, kind: "bundle", capabilities: FULL_CAPABILITIES });
	});

	it("reports the flags a lagging CLI rejects instead of assuming it speaks the protocol", async () => {
		const cli = join(home, ...CLI_ENTRY);
		await fakeSidecar(cli, { noOpen: false, noAutoResume: false });

		// Degraded but usable: the spawn sites omit what it refuses.
		expect(resolveDevSidecar(home, null)).toEqual({
			path: cli,
			kind: "cli",
			capabilities: { noAutoResume: false, statsNoOpen: false },
		});
	});

	it("falls back to a degraded CLI when the installed sidecar is only partly compatible", async () => {
		const bundle = join(home, "Applications", "omp.app", "Contents", "Resources", "omp");
		await fakeSidecar(bundle, { noOpen: true, noAutoResume: false });

		expect(resolveDevSidecar(home, null)).toEqual({
			path: bundle,
			kind: "bundle",
			capabilities: { noAutoResume: false, statsNoOpen: true },
		});
	});

	it("ignores a non-executable candidate", async () => {
		const bundle = join(home, "Applications", "omp.app", "Contents", "Resources", "omp");
		await fakeSidecar(bundle, { noOpen: true, noAutoResume: true });
		await chmod(bundle, 0o644);

		expect(resolveDevSidecar(home, null)).toBeNull();
	});
});
