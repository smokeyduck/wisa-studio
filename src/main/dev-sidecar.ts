/**
 * Dev-only sidecar fallbacks for a checkout with no `resources/omp`.
 *
 * `bun run build:omp` needs the omp monorepo next to this one; without it a dev
 * run has no agent. Rather than failing every tab with "built-in omp not found",
 * an unpackaged run falls back to, in order:
 *
 * 1. the sidecar inside an installed WISA STUDIO / omp bundle (same release line,
 *    same flags — this is the only fallback that is guaranteed to speak the GUI's
 *    protocol);
 * 2. an `omp` CLI installed by bun/npm, last resort because its release line may
 *    lag the GUI's and reject flags the sidecar is spawned with
 *    (`--no-auto-resume`, `stats --no-open`).
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

/** A running AppImage unpacks to `/tmp/.mount_omp-XXXX/resources/omp`; prefer the newest. */
function appImageSidecars(tmpDir: string, exe: string): string[] {
	try {
		return readdirSync(tmpDir)
			.filter(name => name.startsWith(".mount_omp"))
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
 * Does this binary understand the flags the GUI spawns it with? `stats --no-open`
 * is the cheapest discriminator: a CLI one release line behind the pinned
 * sidecar rejects it, and its `--no-auto-resume` too.
 */
export function speaksGuiProtocol(path: string): boolean {
	const probe = spawnSync(path, ["stats", "--help"], { encoding: "utf8", timeout: 20_000 });
	if (probe.error || probe.status !== 0) return false;
	return `${probe.stdout ?? ""}${probe.stderr ?? ""}`.includes("--no-open");
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

/** Resolve the agent a dev run should spawn, or null when the machine has none. */
export function resolveDevSidecar(
	home: string = homedir(),
	tmpDir: string | null = "/tmp",
): { path: string; kind: "bundle" | "cli" } | null {
	for (const candidate of bundledCandidates(home, tmpDir ?? "")) {
		if (!existsSync(candidate) || !isExecutable(candidate)) continue;
		if (speaksGuiProtocol(candidate)) return { path: candidate, kind: "bundle" };
	}
	const cli = resolveCli(home);
	return cli ? { path: cli, kind: "cli" } : null;
}
