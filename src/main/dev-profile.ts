/** WISA storage identity, selected before Electron's instance lock. */
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { app } from "electron";
import { agentDir, configureAgentProfile } from "./agent-paths";

export interface AppProfilePaths {
	userData: string;
	configDir: string;
	agentDir: string;
}

export function appProfilePaths(appData: string, home: string, packaged: boolean): AppProfilePaths {
	const name = packaged ? "wisa-studio" : "wisa-studio-dev";
	const configDir = `.${name}`;
	return { userData: join(appData, name), configDir, agentDir: join(home, configDir, "agent") };
}

/** Explicit automation anchor; never accepts another application's userData directory directly. */
function profileRoot(): string | undefined {
	const root = process.env.WISA_PROFILE_ROOT;
	if (root !== undefined && !isAbsolute(root)) throw new Error("WISA_PROFILE_ROOT must be absolute");
	return root;
}

export function applyAppProfile(): AppProfilePaths {
	app.setName("WISA STUDIO");
	app.commandLine.removeSwitch("user-data-dir");
	app.commandLine.removeSwitch("disk-cache-dir");
	const root = profileRoot();
	const paths = appProfilePaths(
		root ? join(root, "appData") : app.getPath("appData"),
		root ?? homedir(),
		app.isPackaged,
	);
	app.setAppUserModelId(app.isPackaged ? "org.wisa.studio" : "org.wisa.studio.dev");
	for (const directory of [
		paths.userData,
		join(paths.userData, "logs"),
		join(paths.userData, "Crashpad"),
		join(paths.userData, "temp"),
	]) {
		mkdirSync(directory, { recursive: true });
	}
	mkdirSync(join(paths.agentDir, "..", "tmp", "runtime"), { recursive: true, mode: 0o700 });
	// Ignore foreign --user-data-dir overrides; never import another application's profile.
	app.setPath("userData", paths.userData);
	app.commandLine.appendSwitch("disk-cache-dir", join(paths.userData, "Cache"));
	app.setPath("sessionData", paths.userData);
	app.setAppLogsPath(join(paths.userData, "logs"));
	app.setPath("crashDumps", join(paths.userData, "Crashpad"));
	app.setPath("temp", join(paths.userData, "temp"));
	configureAgentProfile(paths.agentDir);
	return paths;
}

/** Opt Git for Windows into long checkouts without writing to any Git config file. */
function enableGitLongPaths(env: NodeJS.ProcessEnv): void {
	const countKey = "GIT_CONFIG_COUNT";
	const raw = env[countKey] ?? Object.entries(env).find(([key]) => key.toUpperCase() === countKey)?.[1] ?? "0";
	const count = Number(raw);
	// Do not discard existing configuration if Git would reject the inherited count.
	if (!/^\d+$/.test(raw) || count >= 2_147_483_647) return;
	const key = `GIT_CONFIG_KEY_${count}`;
	const value = `GIT_CONFIG_VALUE_${count}`;
	for (const name of Object.keys(env)) {
		const upper = name.toUpperCase();
		if (upper === countKey || upper === key || upper === value) delete env[name];
	}
	env[key] = "core.longpaths";
	env[value] = "true";
	env[countKey] = String(count + 1);
}

/** Applied after inherited/shell/proxy overlays; never mutates the parent environment.
 * HOME, Git/SSH credentials and explicit provider API keys remain OS-owned inputs.
 */
export function agentSpawnEnv(inherited: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	const env = { ...inherited };
	for (const key of Object.keys(env)) {
		const name = key.toUpperCase();
		if (
			name.startsWith("PI_SESSION") ||
			name.startsWith("PI_TOOL_BRIDGE_") ||
			name.startsWith("PI_BROWSER_") ||
			name.startsWith("OMP_AUTH_BROKER_") ||
			name.startsWith("OMP_DAEMON_") ||
			name.startsWith("PI_TEST_") ||
			name.startsWith("PI_PANEL_") ||
			name.startsWith("CMUX_") ||
			name.startsWith("TERN_") ||
			name === "XDG_CONFIG_HOME" ||
			name === "XDG_DATA_HOME" ||
			name === "XDG_STATE_HOME" ||
			name === "XDG_CACHE_HOME" ||
			name === "XDG_RUNTIME_DIR" ||
			name === "TMPDIR" ||
			name === "TMP" ||
			name === "TEMP" ||
			STRIPPED_ENV[name]
		)
			delete env[key];
	}
	const automationRoot = profileRoot();
	if (automationRoot) {
		for (const key of Object.keys(env)) {
			const name = key.toUpperCase();
			if (name === "HOME" || name === "USERPROFILE") delete env[key];
		}
		env.HOME = automationRoot;
		env.USERPROFILE = automationRoot;
	}
	const root = dirname(agentDir());
	const configDir = basename(root);
	const temp = join(root, "tmp");
	env.TMPDIR = temp;
	env.TMP = temp;
	env.TEMP = temp;
	env.PI_NATIVES_DIR = join(root, "natives");
	env.XDG_RUNTIME_DIR = join(temp, "runtime");
	for (const kind of ["CONFIG", "DATA", "STATE", "CACHE"] as const) {
		env[`XDG_${kind}_HOME`] = join(root, "xdg", kind.toLowerCase());
	}
	if (process.platform === "win32") enableGitLongPaths(env);
	return Object.assign(env, {
		PI_CONFIG_DIR: configDir,
		PI_CODING_AGENT_DIR: agentDir(),
		PI_PROJECT_CONFIG_DIR: configDir,
		PI_CONFIG_SOURCES: "native",
	});
}

const STRIPPED_ENV: Record<string, true> = {
	OMP_PROFILE: true,
	PI_PROFILE: true,
	PI_CODING_AGENT_SESSION_DIR: true,
	PI_ARTIFACTS_DIR: true,
	PI_TOOL_CALL_ID: true,
	PI_EVAL_LOCAL_ROOTS: true,
	OMP_WORKTREE_DIR: true,
	OMP_AUTORESEARCH_DB_DIR: true,
	PI_NATIVES_DIR: true,
	OMP_GITHUB_CACHE_DB: true,
	OMP_COMMIT_CACHE_DB: true,
	OMP_JUDGMENT_CACHE_DB: true,
	OMP_AUTH_BROKER_SNAPSHOT_CACHE: true,
	PI_PACKAGE_DIR: true,
	PI_BUILD_URL: true,
	OMP_DAEMON_DIR: true,
	OMP_DAEMON_SOCKET: true,
	OMP_DAEMON_TOKEN: true,
	PI_CONFIG_FILES: true,
	PI_AUTO_QA_PUSH_URL: true,
	PI_AUTO_QA_PUSH_TOKEN: true,
	OMP_DISASM_WORKER_TOKEN: true,
	OMP_PLUGIN_ROOT: true,
	CLAUDE_PLUGIN_ROOT: true,
	PI_PROJECT_DIR: true,
	PI_TERMINAL_OWNER_PID: true,
	TERN_PANE_SOCKET: true,
	TERN_PANE: true,
	CMUX_SOCKET_PATH: true,
	CMUX_WORKSPACE_ID: true,
	CMUX_SURFACE_ID: true,
	PI_PYTHON_ENV: true,
	PI_PYTHON_ENV_DIR: true,
	PI_MCP_CONFIG: true,
	PI_CONFIG_DIR: true,
	PI_CODING_AGENT_DIR: true,
	PI_PROJECT_CONFIG_DIR: true,
	PI_CONFIG_SOURCES: true,
};
