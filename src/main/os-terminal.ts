import { spawn, type SpawnOptions } from "node:child_process";
import { stat } from "node:fs/promises";
import { posix, win32 } from "node:path";
import type { IpcOpenPathResult } from "../shared/ipc-types";

export interface TerminalLaunch {
	file: string;
	args: string[];
	options: SpawnOptions;
	waitForExit?: boolean;
}

function launchTerminal({ file, args, options, waitForExit }: TerminalLaunch): Promise<boolean> {
	const { promise, resolve } = Promise.withResolvers<boolean>();
	const child = spawn(file, args, { stdio: "ignore", detached: true, ...options });
	// Some launchers hand off to an existing app and exit, while others stay
	// open until the user closes the terminal. Catch immediate startup errors
	// without keeping the GUI tied to the lifetime of the terminal window.
	const timer = waitForExit ? undefined : setTimeout(() => done(true), 350);
	function done(ok: boolean) {
		clearTimeout(timer);
		child.unref();
		resolve(ok);
	}
	child.once("error", () => done(false));
	child.once("exit", code => done(code === 0));
	return promise;
}

function nativeEnv(inherited: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {};
	for (const [key, value] of Object.entries(inherited)) {
		// The OS shell is not an OMP sidecar and must not receive private agent
		// profile or capability variables from the process that launched WISA.
		if (!/^(?:PI_|OMP_|WISA_PROFILE_ROOT$|WISA_TERMINAL_CWD$|ELECTRON_RUN_AS_NODE$)/i.test(key)) env[key] = value;
	}
	return env;
}

function windowsEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
	return Object.entries(env).find(([key]) => key.toUpperCase() === name)?.[1];
}

const WINDOWS_POWERSHELL = '"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"';

function* windowsLaunches(cwd: string, env: NodeJS.ProcessEnv): Generator<TerminalLaunch> {
	const systemRoot = windowsEnv(env, "SYSTEMROOT") ?? windowsEnv(env, "WINDIR");
	const localAppData = windowsEnv(env, "LOCALAPPDATA");
	const unc = /^[\\/]{2}/.test(cwd);
	// CMD profiles reject UNC and Windows Terminal interprets semicolon as a
	// command separator and %NAME% as an environment expansion in its cwd.
	if (!unc && !/[;%]/.test(cwd) && localAppData && win32.isAbsolute(localAppData)) {
		yield {
			file: win32.join(localAppData, "Microsoft", "WindowsApps", "wt.exe"),
			args: ["-w", "new", "new-tab", "--startingDirectory", cwd],
			options: { env },
		};
	}
	if (!systemRoot || !win32.isAbsolute(systemRoot)) return;
	// A detached console program started directly by Node has no interactive
	// stdio. CMD's `start` opens a new, interactive console instead. The only
	// shell code here is fixed; paths from the workspace are cwd/env data.
	const file = win32.join(systemRoot, "System32", "cmd.exe");
	const consoleEnv = { ...env, SystemRoot: systemRoot };
	const options = { cwd: unc ? systemRoot : cwd, env: consoleEnv, windowsHide: true, windowsVerbatimArguments: true };
	const uncStartup = unc
		? ` -NoExit -EncodedCommand ${Buffer.from(
				"$dir = $env:WISA_TERMINAL_CWD; Remove-Item Env:WISA_TERMINAL_CWD; Set-Location -LiteralPath $dir",
				"utf16le",
			).toString("base64")}`
		: "";
	yield {
		file,
		args: ["/d", "/c", `if exist ${WINDOWS_POWERSHELL} (start "" ${WINDOWS_POWERSHELL}${uncStartup}) else (exit /b 1)`],
		options: unc ? { ...options, env: { ...consoleEnv, WISA_TERMINAL_CWD: cwd } } : options,
		waitForExit: true,
	};
	if (!unc) {
		yield { file, args: ["/d", "/c", 'start "" "%SystemRoot%\\System32\\cmd.exe" /d'], options, waitForExit: true };
	}
}

function* linuxLaunches(cwd: string, env: NodeJS.ProcessEnv): Generator<TerminalLaunch> {
	if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return;
	// Never pick a launcher executable from the workspace via an empty or
	// relative PATH component when spawning with that workspace as cwd.
	env.PATH = (env.PATH ?? "/usr/local/bin:/usr/bin:/bin").split(":").filter(posix.isAbsolute).join(":");
	if (!env.PATH) return;
	const options = { cwd, env };
	yield { file: "xdg-terminal-exec", args: [`--dir=${cwd}`], options };
	yield { file: "x-terminal-emulator", args: [], options };
	yield { file: "gnome-terminal", args: ["--window", `--working-directory=${cwd}`], options };
	yield { file: "konsole", args: ["--workdir", cwd], options };
	yield { file: "xfce4-terminal", args: ["--window", `--working-directory=${cwd}`], options };
}

export async function openSystemTerminal(
	cwd: string,
	{
		platform = process.platform,
		inheritedEnv = process.env,
		isDirectory = async (dir: string) => (await stat(dir)).isDirectory(),
		launch = launchTerminal,
	} = {},
): Promise<IpcOpenPathResult> {
	if (platform !== "win32" && platform !== "darwin" && platform !== "linux") {
		return { ok: false, error: "unsupported-platform" };
	}
	const path = platform === "win32" ? win32 : posix;
	if (!path.isAbsolute(cwd) || !(await isDirectory(cwd).catch(() => false))) {
		return { ok: false, error: "workspace-unavailable" };
	}
	const env = nativeEnv(inheritedEnv);
	const launches =
		platform === "win32"
			? windowsLaunches(cwd, env)
			: platform === "linux"
				? linuxLaunches(cwd, env)
				: [{ file: "/usr/bin/open", args: ["-b", "com.apple.Terminal", cwd], options: { env }, waitForExit: true }];
	for (const candidate of launches) {
		if (await launch(candidate).catch(() => false)) return { ok: true };
	}
	return { ok: false, error: "terminal-unavailable" };
}
