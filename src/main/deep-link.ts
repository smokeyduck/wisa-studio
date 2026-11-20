/**
 * Registers omp:// protocol and handles deep links.
 * Supports omp://session/<id>, omp://new, and omp://wisa-auth?code=<code>.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { app } from "electron";
import { type DeepLinkPayload, IPC_EVENTS } from "../shared/ipc-types";
import { launchArguments, launchFolder, parseLaunchArgv } from "./launch-argv";
import type { SpawnWindow, WindowManager } from "./window";
import { connectWisa } from "./wisa-auth";

const PROTOCOL = "omp";

/**
 * macOS delivers the launch URL while the app is still starting, and `setupDeepLinks`
 * only runs once the first window exists — so a listener registered there would miss
 * the link that opened the app. Recorded here at import time, replayed on setup.
 */
const beforeSetup: string[] = [];
let handler: ((url: string) => void) | undefined;

app.on("open-url", (event, url) => {
	event.preventDefault();
	if (handler) handler(url);
	else beforeSetup.push(url);
});

/** Same replay story for `open -a omp ~/code/x`, which arrives as an open-file. */
const filesBeforeSetup: string[] = [];
let fileHandler: ((path: string) => void) | undefined;

app.on("open-file", (event, path) => {
	event.preventDefault();
	if (fileHandler) fileHandler(path);
	else filesBeforeSetup.push(path);
});

/** The workspace this launch was pointed at (`omp ~/code/x`), if any. */
export function startupFolder(): string | undefined {
	return launchFolder(process.argv, process.defaultApp, PROTOCOL);
}

/**
 * The `.desktop` id electron-builder installs for Linux (`linux.executableName`
 * in electron-builder.yml). It is deliberately not derived from `app.getName()`:
 * that returns the productName, "WISA STUDIO", whose space makes `xdg-settings`
 * die in awk (`cannot open …/WISA`) and leaves the scheme with whatever app
 * owned it before — the old omp, in the field.
 */
export const LINUX_DESKTOP_FILE = "omp-gui.desktop";

/**
 * A `.desktop` entry that opens this build. `%U` is what makes it a scheme
 * handler; without it `xdg-settings` registers a file that swallows the URL.
 *
 * An AppImage runs from a temporary mount that disappears on exit, so the entry
 * must point at the AppImage file itself (`APPIMAGE`), never at `execPath`.
 */
export function linuxDesktopEntry(exec: string): string {
	const quoted = /\s/.test(exec) ? `"${exec.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : exec;
	return [
		"[Desktop Entry]",
		"Type=Application",
		"Name=WISA STUDIO",
		"Comment=Desktop GUI for the omp coding agent",
		`Exec=${quoted} %U`,
		"MimeType=x-scheme-handler/omp;",
		"Terminal=false",
		"Categories=Development;",
		"",
	].join("\n");
}

/**
 * Make sure `xdg-settings` can resolve the id Electron asks it for. A deb puts
 * the entry in /usr/share/applications, where XDG already finds it; an AppImage
 * carries its entry inside the squashfs, invisible to XDG lookups, so it needs a
 * copy in the user's data dir. A copy left by an earlier launch points at a
 * `/tmp/.mount_*` that no longer exists, so it is rewritten too.
 */
function ensureLinuxDesktopEntry(): void {
	const dataHome = process.env.XDG_DATA_HOME || join(process.env.HOME ?? "", ".local", "share");
	const dir = join(dataHome, "applications");
	const file = join(dir, LINUX_DESKTOP_FILE);
	const exec = process.env.APPIMAGE || process.execPath;
	try {
		const current = existsSync(file) ? readFileSync(file, "utf8") : "";
		const target = /^Exec="?([^"\n]+?)"? %U$/m.exec(current)?.[1];
		// A live entry — one whose binary is still there — is left alone, so a
		// deb install keeps its packaged entry instead of gaining a user copy.
		if (target && existsSync(target)) return;
		mkdirSync(dir, { recursive: true });
		writeFileSync(file, linuxDesktopEntry(exec));
	} catch {
		// A read-only or unusual HOME is not fatal: the app still runs, the
		// browser hand-off just falls back to whatever handler exists.
	}
}

export function setupDeepLinks(windowManager: WindowManager, spawnWindow: SpawnWindow): void {
	// Register as default protocol handler (Windows/Linux). A dev run must not:
	// it would point `omp://` at the Electron binary (and `xdg-settings` rejects
	// the generated name), silently taking the scheme from the installed app.
	if (app.isPackaged) {
		// Electron builds the id from `app.getName()`, which is the productName
		// here; CHROME_DESKTOP is the only override it honours, and it is read at
		// call time.
		if (process.platform === "linux") {
			process.env.CHROME_DESKTOP = LINUX_DESKTOP_FILE;
			ensureLinuxDesktopEntry();
		}
		const registered = app.setAsDefaultProtocolClient(PROTOCOL);
		// Electron runs `xdg-settings set … <id>`, which resolves the entry's Exec
		// through `first_word` and fails outright when that path contains a space
		// (`~/My Apps/wisa-studio.AppImage`). Writing the association directly
		// skips that resolution, so the scheme still lands on this build.
		if (!registered && process.platform === "linux") {
			try {
				execFileSync("xdg-mime", ["default", LINUX_DESKTOP_FILE, `x-scheme-handler/${PROTOCOL}`], {
					stdio: "ignore",
				});
			} catch {
				// No xdg-mime: the deb already owns the scheme system-wide, and an
				// AppImage without it has no handler to offer anyway.
			}
		}
	}

	handler = url => handleDeepLink(url, windowManager, spawnWindow);
	for (const url of beforeSetup.splice(0)) handler(url);
	fileHandler = path => handleOpenPath(path, windowManager, spawnWindow);
	for (const path of filesBeforeSetup.splice(0)) fileHandler(path);

	// Windows/Linux (and `open -n` on macOS): the refused second instance hands
	// over its argv. Only omp:// URLs used to be read, so a workspace path was
	// dropped and the launch did nothing at all.
	app.on("second-instance", (_event, argv) => {
		const request = parseLaunchArgv(launchArguments(argv, process.defaultApp), PROTOCOL);
		if (request.kind === "url") handleDeepLink(request.url, windowManager, spawnWindow);
		else if (request.kind === "path") handleOpenPath(request.path, windowManager, spawnWindow);
		else windowManager.getTargetWindow()?.focus();
	});

	// Windows/Linux cold start: the URL that launched the app arrives in its own
	// argv, and there is no second instance to hand it over. Without this, the
	// very first click on a `omp://wisa-auth` link — the common case, the app is
	// not running yet — started the app and dropped the code on the floor.
	if (process.platform !== "darwin") {
		const startup = parseLaunchArgv(launchArguments(process.argv, process.defaultApp), PROTOCOL);
		if (startup.kind === "url") handleDeepLink(startup.url, windowManager, spawnWindow);
	}
}

/**
 * Bring the window already showing this workspace forward, or open it in a new
 * one. Relative paths resolve against the launcher's cwd, which is never the
 * workspace the user pointed at, so they are refused rather than guessed.
 */
export function handleOpenPath(path: string, windowManager: WindowManager, spawnWindow: SpawnWindow): void {
	if (!isAbsolute(path)) return;
	const target = resolve(path);
	for (const win of windowManager.getAllWindows()) {
		if (windowManager.recordFor(win)?.cwd !== target) continue;
		if (win.isMinimized()) win.restore();
		win.show();
		win.focus();
		return;
	}
	spawnWindow(target);
}

/** What a deep link asks for, before any window exists to carry it out. */
export type DeepLinkRequest =
	| { kind: "payload"; payload: DeepLinkPayload }
	| { kind: "wisa-auth"; code: string }
	| { kind: "none" };

/**
 * Decode a deep link. Pure so the parsing contract is testable without an
 * Electron window: `omp://new`, `omp://session/<id>`, `omp://wisa-auth?code=…`.
 *
 * new URL puts the first segment of a scheme:// URL into hostname, not pathname:
 * omp://new → host "new", omp://session/<id> → host "session" + path "/<id>".
 * (Hostname case is preserved for non-special schemes.)
 */
export function parseDeepLink(url: string): DeepLinkRequest {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return { kind: "none" };
	}

	const host = parsed.hostname.toLowerCase();
	if (host === "new") return { kind: "payload", payload: { action: "new-session" } };
	if (host === "session") {
		const sessionId = parsed.pathname.replace(/^\/+|\/+$/g, "");
		return sessionId ? { kind: "payload", payload: { action: "switch-session", sessionId } } : { kind: "none" };
	}
	if (host === "wisa-auth") {
		const code = parsed.searchParams.get("code");
		return code ? { kind: "wisa-auth", code } : { kind: "none" };
	}
	return { kind: "none" };
}

function handleDeepLink(url: string, windowManager: WindowManager, spawnWindow: SpawnWindow): void {
	const request = parseDeepLink(url);
	if (request.kind === "none") return;

	const win = windowManager.getMainWindow() ?? spawnWindow();
	if (!win) return;
	win.show();
	win.focus();

	if (request.kind === "wisa-auth") {
		// The code is single-use and short-lived, so it is spent here rather than
		// handed to the renderer: the key it buys never enters page context.
		void signInWisa(win, request.code);
		return;
	}
	// Cold start: the renderer only subscribes after load — hold the link until
	// then, otherwise it is silently dropped.
	const link = request.payload;
	if (win.webContents.isLoading()) {
		win.webContents.once("did-finish-load", () => {
			if (!win.isDestroyed()) win.webContents.send(IPC_EVENTS.DEEP_LINK, link);
		});
	} else {
		win.webContents.send(IPC_EVENTS.DEEP_LINK, link);
	}
}

/**
 * Finish the browser sign-in. The renderer is told only the outcome: it cannot
 * see the key, and it reloads the provider catalog to show the new state.
 */
async function signInWisa(win: Electron.BrowserWindow, code: string): Promise<void> {
	const result = await connectWisa(code);
	const outcome: DeepLinkPayload = result.ok
		? { action: "wisa-connected", email: result.email }
		: { action: "wisa-failed", reason: result.reason };
	if (win.isDestroyed()) return;
	if (win.webContents.isLoading()) {
		win.webContents.once("did-finish-load", () => {
			if (!win.isDestroyed()) win.webContents.send(IPC_EVENTS.DEEP_LINK, outcome);
		});
		return;
	}
	win.webContents.send(IPC_EVENTS.DEEP_LINK, outcome);
}
