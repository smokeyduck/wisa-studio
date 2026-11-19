/**
 * `bun run dev` isolation.
 *
 * An unpackaged run must share nothing with the installed app or with a real
 * omp session:
 *
 * - userData → `<appData>/wisa-studio-dev`. userData owns Electron's
 *   SingletonLock, prefs, saved tab layouts, scheduler.db, the conversation
 *   index and gui-runtime.jsonl, so this directory is what keeps a dev run and
 *   the installed app from fighting over one instance lock.
 * - agent profile → `~/.omp-dev` via PI_CONFIG_DIR + PI_CODING_AGENT_DIR, so
 *   the sidecar's models.yml, MCP config, plugins and session history never
 *   collide with the production `~/.omp` a running agent session uses.
 *
 * These paths apply only to unpackaged builds; a packaged app keeps
 * `~/.config/omp` and `~/.omp`. Explicit overrides win: `--user-data-dir`, an
 * exported PI_CODING_AGENT_DIR / PI_CONFIG_DIR, or PI_CONFIG_DIR given by the
 * caller is honored exactly as given.
 *
 * Session identity is the one thing dev does NOT inherit: running `bun run dev`
 * from inside an omp session exports PI_SESSION_FILE/ID/TOOL_CALL_ID, and a dev
 * window that kept them would open — and write to — the session the parent
 * agent is using.
 */
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { app } from "electron";

/** omp's config root for dev. Relative on purpose: omp resolves it against $HOME. */
export const DEV_CONFIG_DIR = ".omp-dev";

/** Session-scoped variables naming an already-running agent turn. */
export const DEV_STRIPPED_ENV = ["PI_SESSION_FILE", "PI_SESSION_ID", "PI_TOOL_CALL_ID"] as const;

export interface DevProfilePaths {
	/** Electron userData for a dev run (own lock, prefs, scheduler.db, logs). */
	userData: string;
	/** PI_CONFIG_DIR value: config root, `~/.omp-dev`. */
	configDir: string;
	/** PI_CODING_AGENT_DIR value: `~/.omp-dev/agent`. */
	agentDir: string;
}

export function devProfilePaths(appData: string, home: string): DevProfilePaths {
	const root = join(home, DEV_CONFIG_DIR);
	return { userData: join(appData, "wisa-studio-dev"), configDir: DEV_CONFIG_DIR, agentDir: join(root, "agent") };
}

/**
 * Apply the dev profile. Returns null in a packaged build (nothing to isolate).
 * MUST run before `requestSingleInstanceLock()` and before anything reads
 * `app.getPath("userData")` — the lock is acquired inside that directory.
 */
export function applyDevProfile(): DevProfilePaths | null {
	if (app.isPackaged) return null;
	const paths = devProfilePaths(app.getPath("appData"), homedir());
	if (!app.commandLine.hasSwitch("user-data-dir")) {
		mkdirSync(paths.userData, { recursive: true });
		app.setPath("userData", paths.userData);
	}
	if (!process.env.PI_CODING_AGENT_DIR) process.env.PI_CODING_AGENT_DIR = paths.agentDir;
	if (!process.env.PI_CONFIG_DIR) process.env.PI_CONFIG_DIR = paths.configDir;
	for (const key of DEV_STRIPPED_ENV) delete process.env[key];
	return paths;
}
