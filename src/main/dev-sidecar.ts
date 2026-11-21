/**
 * Dev-only sidecar fallbacks for a checkout with no `resources/omp`.
 *
 * `bun run build:omp` needs the omp monorepo next to this one; without it a dev
 * run has no agent. Rather than failing every tab with "built-in omp not found",
 * an unpackaged run falls back to, in order:
 *
 * 1. the sidecar inside an installed WISA STUDIO / omp bundle, including the
 *    `/tmp/.mount_*` directory a running AppImage unpacks to (same release
 *    line, same flags — this is the only fallback that is guaranteed to speak
 *    the GUI's protocol);
 * 2. an `omp` CLI installed by bun/npm, last resort because its release line may
 *    lag the GUI's and reject flags the sidecar is spawned with
 *    (`--no-auto-resume`, `stats --no-open`).
 *
 * Which of those flags a candidate actually understands is PROBED, never
 * assumed: the CLI one release line behind the pinned sidecar rejects both, and
 * hardcoding them crash-looped the agent and the stats server. The probe result
 * travels with the choice as `SidecarCapabilities`, and each spawn site omits
 * the flags the binary would refuse.
 *
 * A packaged build never consults any of this.
 */
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BUN_GLOBAL_ENTRY = join(
	".bun",
	"install",
	"global",
	"node_modules",
	"@oh-my-pi",
	"pi-coding-agent",
	"dist",
	"cli.js",
);

/**
 * Which optional flags a resolved binary accepts. Both default to true so a
 * bundled/pinned sidecar — the normal case — needs no probe at all.
 */
export interface SidecarCapabilities {
	/** Accepts `--no-auto-resume`, the fresh-launch guard against the CLI's autoResume pref. */
	noAutoResume: boolean;
	/** Accepts `stats --no-open`; without it the dashboard server opens a browser. */
	statsNoOpen: boolean;
}

/** A pinned sidecar built from this repo's Core pin accepts everything the GUI passes. */
export const FULL_CAPABILITIES: SidecarCapabilities = { noAutoResume: true, statsNoOpen: true };

export interface DevSidecar {
	path: string;
	kind: "bundle" | "cli";
	capabilities: SidecarCapabilities;
}

/** Bundle paths an installed GUI puts its sidecar in, newest naming first. */
function bundledCandidates(home: string, tmpDir: string): string[] {
	const exe = process.platform === "win32" ? "omp.exe" : "omp";
	const macApps = [
		"/Applications/WISA STUDIO.app",
		"/Applications/omp.app",
		join(home, "Applications", "WISA STUDIO.app"),
		join(home, "Applications", "omp.app"),
	];
	const macPaths = macApps.map(app => join(app, "Contents", "Resources", exe));
	const linuxPaths = [
		"/opt/WISA STUDIO/resources",
		"/opt/wisa-studio/resources",
		"/opt/omp/resources",
		"/usr/lib/omp/resources",
	].map(dir => join(dir, exe));
	const winPaths = [
		join(home, "AppData", "Local", "Programs", "wisa-studio", "resources"),
		join(home, "AppData", "Local", "Programs", "omp", "resources"),
	].map(dir => join(dir, exe));
	return [...macPaths, ...linuxPaths, ...winPaths, ...appImageSidecars(tmpDir, exe)];
}

/**
 * A running AppImage unpacks to `/tmp/.mount_<name>-XXXX/resources/omp`. The
 * mount is named after the APP ID, which is `wisa-studio` for this product and
 * `omp` for its previous name — matching only `.mount_omp` missed the installed
 * WISA STUDIO AppImage entirely and dropped the dev run onto a lagging CLI.
 * Prefer the newest mount.
 */
function appImageSidecars(tmpDir: string, exe: string): string[] {
	try {
		return readdirSync(tmpDir)
			.filter(name => name.startsWith(".mount_omp") || name.startsWith(".mount_wisa"))
			.sort()
			.reverse()
			.map(name => join(tmpDir, name, "resources", exe));
	} catch {
		return [];
	}
}

function isExecutable(path: string): boolean {
	try {
		accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/**
 * `stats --help` lists `--no-open` on every sidecar that has it, and it is the
 * one flag the dashboard server depends on. Cheap (one short spawn) and exact.
 */
function supportsStatsNoOpen(path: string): boolean {
	const probe = spawnSync(path, ["stats", "--help"], { encoding: "utf8", timeout: 20_000 });
	if (probe.error || probe.status !== 0) return false;
	return `${probe.stdout ?? ""}${probe.stderr ?? ""}`.includes("--no-open");
}

/**
 * `--no-auto-resume` is a hidden flag — it appears in no help text — so the only
 * honest probe is to hand it to the parser alongside a deliberately invalid
 * `--mode`. The mode error is reported first either way; a binary that does not
 * know the flag reports it too. Neither probe can start a session: both fail
 * argument parsing before any turn is opened.
 */
function supportsNoAutoResume(path: string): boolean {
	const probe = spawnSync(path, ["--mode=__gui_probe__", "--no-auto-resume"], { encoding: "utf8", timeout: 20_000 });
	if (probe.error) return false;
	return !`${probe.stdout ?? ""}${probe.stderr ?? ""}`.includes("unknown flag: --no-auto-resume");
}

/** Probe both optional flags. Only ever called for a dev fallback candidate. */
export function probeSidecarCapabilities(path: string): SidecarCapabilities {
	return { noAutoResume: supportsNoAutoResume(path), statsNoOpen: supportsStatsNoOpen(path) };
}

function resolveCli(home: string): string | null {
	const exe = process.platform === "win32" ? "omp.exe" : "omp";
	const candidates = [
		join(home, BUN_GLOBAL_ENTRY),
		join(home, ".bun", "bin", exe),
		`/usr/local/bin/${exe}`,
		`/opt/homebrew/bin/${exe}`,
	];
	for (const candidate of candidates) {
		if (!existsSync(candidate)) continue;
		let resolved = candidate;
		try {
			resolved = realpathSync(candidate);
		} catch {
			// A broken symlink keeps the literal path; the spawn failure is reported.
		}
		if (isExecutable(resolved)) return resolved;
	}
	return null;
}

/**
 * Resolve the agent a dev run should spawn, or null when the machine has none.
 *
 * Order: an installed bundle (including a running AppImage's mount) before a
 * bare CLI, and a candidate that accepts every flag the GUI passes before one
 * that does not — a lagging CLI still runs, just without the two optional
 * flags, so it is preferred only when nothing better exists.
 */
export function resolveDevSidecar(home: string = homedir(), tmpDir: string | null = "/tmp"): DevSidecar | null {
	const bundles = bundledCandidates(home, tmpDir ?? "").filter(path => existsSync(path) && isExecutable(path));
	const cli = resolveCli(home);
	const candidates: { path: string; kind: "bundle" | "cli" }[] = [
		...bundles.map(path => ({ path, kind: "bundle" as const })),
		...(cli ? [{ path: cli, kind: "cli" as const }] : []),
	];
	// Probing spawns the binary, so stop at the first candidate that accepts
	// every flag; keep the first degraded one only as a last resort.
	let degraded: DevSidecar | null = null;
	for (const candidate of candidates) {
		const capabilities = probeSidecarCapabilities(candidate.path);
		if (capabilities.noAutoResume && capabilities.statsNoOpen) return { ...candidate, capabilities };
		degraded ??= { ...candidate, capabilities };
	}
	return degraded;
}
