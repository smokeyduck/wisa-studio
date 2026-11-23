// CI-only proof of the packaged GUI's own sidecar, preload IPC, and settings persistence.
// Usage: node scripts/smoke-packaged-gui.mjs <packaged executable or Windows portable wrapper>
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { _electron as electron } from "playwright";

if (process.env.CI !== "true" || process.argv.length !== 3) {
	console.error("FAIL packaged GUI proof requires CI and one packaged executable");
	process.exit(1);
}

const executablePath = path.resolve(process.argv[2]);
const root = await fs.mkdtemp(path.join(os.tmpdir(), "wisa GUI proof Tiếng Việt-"));
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
});

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
let rendererFailed = false;
let cleanupFailed = false;
let stage = "launch";
let passed = false;
// Playwright owns the launched process tree and its exit cleanup; never discover or kill runner processes.
const watchdog = setTimeout(() => {
	console.error("FAIL packaged GUI proof exceeded its deadline");
	process.exit(1);
}, 240_000);

async function closeGui() {
	const owned = gui;
	gui = undefined;
	if (!owned) return;
	try {
		// Use the application's quit IPC so its quit latch runs normal sidecar teardown.
		await bounded(
			Promise.all([
				owned.waitForEvent("close", { timeout: 15_000 }),
				// The context can disappear before evaluate resolves; actual process exit is still required.
				owned
					.windows()[0]
					.evaluate(() => window.omp.app.quit())
					.catch(() => {}),
			]),
			15_000,
		);
	} catch {
		cleanupFailed = true;
		throw new Error("GUI shutdown failed");
	}
}

async function launchGui() {
	rendererFailed = false;
	gui = await electron.launch({ executablePath, cwd: project, env, timeout: 60_000 });
	const watchRenderer = page =>
		page.on("crash", () => {
			rendererFailed = true;
		});
	gui.on("window", watchRenderer);
	for (const page of gui.windows()) watchRenderer(page);
	assert.equal(
		await gui.evaluate(
			({ app }, expected) => app.isPackaged && app.getPath("userData") === expected,
			path.join(root, "appData", "wisa-studio"),
		),
		true,
	);
	const page = await gui.firstWindow({ timeout: 60_000 });
	stage = "own sidecar READY";
	const readyDeadline = Date.now() + 90_000;
	while (
		!(await page.evaluate(async () => {
			if (!window.omp?.tabs) return false;
			const tabs = await window.omp.tabs.list();
			return tabs.some(tab => tab.active === true && tab.status === "ready");
		}))
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
			"settings-delivery-unknown",
			"settings-not-connected",
			"settings-response-failed",
			"settings-boolean-missing",
			"operation timed out",
		].find(value => message.includes(value)) ??
		(error instanceof Error && ["TypeError", "AssertionError", "TimeoutError"].includes(error.name)
			? error.name
			: "unclassified");
	console.error(`FAIL packaged GUI proof: ${stage}; code=${code}`);
} finally {
	try {
		await closeGui();
		if (!cleanupFailed) await fs.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
	} catch {
		cleanupFailed = true;
		console.error("FAIL packaged GUI proof: cleanup");
	}
	clearTimeout(watchdog);
}

if (cleanupFailed) process.exit(1);
if (passed)
	console.log("PASS packaged GUI: own sidecar READY, settings IPC round-trip and restart persistence, live renderer");
process.exitCode = passed ? 0 : 1;
