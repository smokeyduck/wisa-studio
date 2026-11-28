// CI-only proof of the packaged GUI's own sidecar, preload IPC, and settings persistence.
// Usage: node scripts/smoke-packaged-gui.mjs <packaged executable or Windows portable wrapper>
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, _electron as electron } from "playwright";

if (process.env.CI !== "true" || process.argv.length !== 3) {
	console.error("FAIL packaged GUI proof requires CI and one packaged executable");
	process.exit(1);
}

const executablePath = path.resolve(process.argv[2]);
const portable = process.platform === "win32" && /-portable\.exe$/i.test(executablePath);
const root = await fs.mkdtemp(path.join(os.tmpdir(), "wisa GUI proof Tiếng Việt-"));
const userData = path.join(root, "appData", "wisa-studio");
const project = path.join(root, "project");
const temporary = path.join(root, "tmp");
await fs.mkdir(project);
await fs.mkdir(temporary);

// Never inherit credentials, profile overrides, Node injection flags, or ELECTRON_RUN_AS_NODE.
const env = {};
for (const name of ["PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "DISPLAY", "XAUTHORITY", "LANG"]) {
	if (process.env[name] !== undefined) env[name] = process.env[name];
}
Object.assign(env, {
	CI: "true",
	HOME: root,
	USERPROFILE: root,
	APPDATA: path.join(root, "appData"),
	LOCALAPPDATA: path.join(root, "localAppData"),
	XDG_CONFIG_HOME: path.join(root, "config"),
	XDG_CACHE_HOME: path.join(root, "cache"),
	XDG_DATA_HOME: path.join(root, "data"),
	TMPDIR: temporary,
	TMP: temporary,
	TEMP: temporary,
	WISA_PROFILE_ROOT: root,
	WISA_BROWSER_USE_AUTO_UPDATE: "0",
});
// CI runners may not allow FUSE mounts. The AppImage itself still starts
// and extracts the shipped payload, rather than exercising linux-unpacked.
if (process.platform === "linux" && executablePath.endsWith(".AppImage")) {
	env.APPIMAGE_EXTRACT_AND_RUN = "1";
}

async function bounded(operation, milliseconds) {
	const deadline = Promise.withResolvers();
	const timer = setTimeout(() => deadline.reject(new Error("operation timed out")), milliseconds);
	try {
		return await Promise.race([operation, deadline.promise]);
	} finally {
		clearTimeout(timer);
	}
}

let gui;
let guiPage;
let wrapper;
let wrapperExit;
let portableBrowser;
let portablePage;
let rendererFailed = false;
let cleanupFailed = false;
let stage = "launch";
let passed = false;
// The portable wrapper owns its extracted app. Kill only that tree if the probe cannot quit it normally.
function stopWrapper() {
	if (wrapper?.pid && wrapper.exitCode === null) {
		spawnSync("taskkill.exe", ["/pid", String(wrapper.pid), "/t", "/f"], { timeout: 5000, stdio: "ignore" });
	}
}

// The portable wrapper extracts Chromium and Python before each Electron launch.
// Keep the extraction budget separate from the sidecar and settings RPC deadlines.
const portableLaunchTimeout = 300_000;
// NSIS removes its extracted files only after Electron exits.
const portableShutdownTimeout = 75_000;
const watchdog = setTimeout(() => {
	console.error("FAIL packaged GUI proof exceeded its deadline");
	stopWrapper();
	process.exit(1);
}, portable ? 2 * (portableLaunchTimeout + portableShutdownTimeout) + 240_000 : 240_000);

async function waitForMainPage(pages) {
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		const page = pages().find(
			page => !page.isClosed() && new URL(page.url()).pathname.endsWith("/renderer/index.html"),
		);
		if (page) {
			await page.waitForLoadState("domcontentloaded", { timeout: 60_000 });
			return page;
		}
		await delay(250);
	}
	throw new Error("main-window-timeout");
}

async function closeGui() {
	if (wrapper) {
		try {
			await bounded(
				Promise.all([wrapperExit, portablePage?.evaluate(() => window.omp.app.quit()).catch(() => {})]),
				portableShutdownTimeout,
			);
		} catch {
			cleanupFailed = true;
			stopWrapper();
			throw new Error("portable shutdown failed");
		} finally {
			await portableBrowser?.close();
			wrapper = undefined;
			portableBrowser = undefined;
			portablePage = undefined;
		}
		return;
	}
	const owned = gui;
	const ownedPage = guiPage;
	guiPage = undefined;
	gui = undefined;
	if (!owned) return;
	try {
		// Use the application's quit IPC so its quit latch runs normal sidecar teardown.
		await bounded(
			Promise.all([
				owned.waitForEvent("close", { timeout: 15_000 }),
				// The context can disappear before evaluate resolves; actual process exit is still required.
				ownedPage
					? ownedPage.evaluate(() => window.omp.app.quit()).catch(() => {})
					: owned.evaluate(({ app }) => app.quit()).catch(() => {}),
			]),
			15_000,
		);
	} catch {
		cleanupFailed = true;
		throw new Error("GUI shutdown failed");
	}
}

async function launchPortable(watchRenderer) {
	// Playwright's Electron launcher waits for debugger endpoints on the launched
	// process's stderr. NSIS launches a child GUI; use Chromium's port file instead.
	const portFile = path.join(userData, "DevToolsActivePort");
	await fs.rm(portFile, { force: true });
	wrapper = spawn(executablePath, ["--remote-debugging-port=0"], { cwd: project, env, stdio: "ignore" });
	wrapperExit = new Promise((resolve, reject) => {
		wrapper.once("error", reject);
		wrapper.once("exit", code => (code === 0 ? resolve() : reject(new Error("portable-exit-failed"))));
	});
	let exited = false;
	const markExited = () => {
		exited = true;
	};
	void wrapperExit.then(markExited, markExited);
	const deadline = Date.now() + portableLaunchTimeout;
	while (Date.now() < deadline) {
		if (exited) {
			await wrapperExit;
			throw new Error("portable-early-exit");
		}
		const text = await fs.readFile(portFile, "utf8").catch(error => {
			if (error.code !== "ENOENT") throw error;
			return "";
		});
		const endpoint = /^(\d+)\r?\n(\/devtools\/browser\/[\w-]+)/.exec(text);
		if (endpoint) {
			portableBrowser = await chromium.connectOverCDP(`ws://127.0.0.1:${endpoint[1]}${endpoint[2]}`, {
				timeout: Math.max(1, deadline - Date.now()),
			});
			const [context] = portableBrowser.contexts();
			context.on("page", watchRenderer);
			for (const page of context.pages()) watchRenderer(page);
			portablePage = await waitForMainPage(() => context.pages());
			return portablePage;
		}
		await delay(250);
	}
	throw new Error("portable-debug-port-timeout");
}

async function launchGui() {
	rendererFailed = false;
	const watchRenderer = page =>
		page.on("crash", () => {
			rendererFailed = true;
		});
	let page;
	if (portable) {
		page = await launchPortable(watchRenderer);
	} else {
		gui = await electron.launch({ executablePath, cwd: project, env, timeout: 60_000 });
		gui.on("window", watchRenderer);
		for (const page of gui.windows()) watchRenderer(page);
		assert.equal(
			await gui.evaluate(({ app }, expected) => app.isPackaged && app.getPath("userData") === expected, userData),
			true,
		);
		guiPage = await waitForMainPage(() => gui.windows());
		page = guiPage;
	}
	stage = "own sidecar READY";
	const readyDeadline = Date.now() + 90_000;
	while (
		!(await bounded(
			page.evaluate(async () => {
				if (!window.omp?.tabs) return false;
				const tabs = await window.omp.tabs.list();
				if (!tabs.some(tab => tab.active === true && tab.status === "ready")) return false;
				// READY can precede a usable active-tab route during startup and restore.
				return (await window.omp.rpc.getState()).success;
			}),
			15_000,
		))
	) {
		if (Date.now() > readyDeadline) throw new Error("own-sidecar-ready-timeout");
		await delay(250);
	}
	return page;
}

async function readSetting(page) {
	return await bounded(
		page.evaluate(async () => {
			const response = await window.omp.rpc.getSettings(["colorBlindMode"]);
			if (!response.success) {
				const code =
					response.code === "rpc_delivery_unknown"
						? "settings-delivery-unknown"
						: response.error === "Sidecar not connected"
							? "settings-not-connected"
							: "settings-response-failed";
				throw new Error(code);
			}
			if (typeof response.data?.values?.colorBlindMode !== "boolean") {
				throw new Error("settings-boolean-missing");
			}
			return response.data.values.colorBlindMode;
		}),
		15_000,
	);
}

async function verifyRenderer(page) {
	// Check the current renderer after settling, not a PID that happened to exist during boot.
	await delay(10_000);
	assert.equal(rendererFailed, false);
	assert.equal(page.isClosed(), false);
	if (gui) {
		assert.equal(
			await bounded(
				gui.evaluate(({ BrowserWindow }) => {
					const windows = BrowserWindow.getAllWindows();
					return (
						windows.length > 0 &&
						windows.every(
							window =>
								!window.isDestroyed() &&
								!window.webContents.isDestroyed() &&
								!window.webContents.isCrashed() &&
								window.webContents.getOSProcessId() > 0,
						)
					);
				}),
				10_000,
			),
			true,
		);
	}
	assert.equal(
		await bounded(
			page.evaluate(() => document.readyState === "complete"),
			10_000,
		),
		true,
	);
}

try {
	let page = await launchGui();
	stage = "getSettings through preload IPC";
	const toggled = !(await readSetting(page));
	stage = "setSetting and readback through preload IPC";
	assert.equal(
		await bounded(
			page.evaluate(async value => {
				const response = await window.omp.rpc.setSetting("colorBlindMode", value);
				return response.success;
			}, toggled),
			15_000,
		),
		true,
	);
	assert.equal(await readSetting(page), toggled);
	stage = "renderer stability after settings mutation";
	await verifyRenderer(page);
	stage = "first GUI shutdown";
	await closeGui();
	stage = "GUI restart";
	page = await launchGui();
	stage = "settings persistence after GUI restart";
	assert.equal(await readSetting(page), toggled);
	stage = "renderer stability after restart";
	await verifyRenderer(page);
	passed = true;
} catch (error) {
	// Never print raw Playwright messages: they can include process output and arguments.
	const message = error instanceof Error ? error.message : "";
	const code =
		[
			"portable-early-exit",
			"portable-exit-failed",
			"portable-debug-port-timeout",
			"main-window-timeout",
			"settings-delivery-unknown",
			"settings-not-connected",
			"settings-response-failed",
			"settings-boolean-missing",
			"own-sidecar-ready-timeout",
			"GUI shutdown failed",
			"portable shutdown failed",
			"operation timed out",
		].find(value => message.includes(value)) ??
		(error instanceof Error && ["TypeError", "AssertionError", "TimeoutError"].includes(error.name)
			? error.name
			: "unclassified");
	console.error(`FAIL packaged GUI proof: ${stage}; code=${code}`);
} finally {
	try {
		await closeGui();
	} catch (error) {
		cleanupFailed = true;
		const reason = error.message === "portable shutdown failed" ? error.message : "GUI shutdown failed";
		console.error(`FAIL packaged GUI proof: ${reason}`);
	}
	if (!cleanupFailed) {
		try {
			// Windows may still be releasing child process handles after Electron exits.
			await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
		} catch (error) {
			cleanupFailed = true;
			console.error(`FAIL packaged GUI proof: remove isolated profile; code=${error.code ?? "unclassified"}`);
		}
	}
	clearTimeout(watchdog);
}

if (cleanupFailed) process.exit(1);
if (passed)
	console.log("PASS packaged GUI: own sidecar READY, settings IPC round-trip and restart persistence, live renderer");
process.exitCode = passed ? 0 : 1;
