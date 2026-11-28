#!/usr/bin/env bun
import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { resolveConfig } from "electron-vite";
import { build, createServer, type Rollup, type UserConfig, type ViteDevServer } from "vite";
import { DEV_REBUILD_MESSAGE } from "../src/shared/dev-restart";

// Own Electron's lifecycle: electron-vite 3 starts the replacement before the
// previous process exits, racing Electron's profile lock on main rebuilds.
const { values, positionals } = parseArgs({
	args: process.argv.slice(2),
	allowPositionals: true,
	options: {
		clearScreen: { type: "string", default: "false" },
		mode: { type: "string", default: "development" },
		config: { type: "string" },
	},
});
const electronPath = createRequire(import.meta.url)("electron") as string;
const watchers: Rollup.RollupWatcher[] = [];
let server: ViteDevServer | undefined;
let running: { child: ChildProcess; closed: Promise<unknown>; replacing: boolean } | undefined;
let stopping = false;
let started = false;
let restarting = Promise.resolve();

async function stopElectron(): Promise<void> {
	const previous = running;
	if (!previous) return;
	previous.replacing = true;
	if (previous.child.exitCode === null && previous.child.signalCode === null) {
		if (previous.child.connected) previous.child.send(DEV_REBUILD_MESSAGE);
		else previous.child.kill();
	}
	await previous.closed;
	if (running === previous) running = undefined;
}

async function shutdown(code: number): Promise<void> {
	if (stopping) return;
	stopping = true;
	await stopElectron();
	await Promise.all(watchers.map(watcher => watcher.close()));
	await server?.close();
	process.exitCode = code;
}

function launch(): void {
	if (stopping) return;
	const env = { ...process.env };
	delete env.ELECTRON_RUN_AS_NODE;
	const child = spawn(electronPath, [".", ...positionals], { stdio: ["inherit", "inherit", "inherit", "ipc"], env });
	const instance = { child, closed: once(child, "exit"), replacing: false };
	running = instance;
	void instance.closed
		.then(([code]) => {
			if (!instance.replacing) return shutdown(code ?? 1);
		})
		.catch(fail);
}

function fail(error: unknown): void {
	console.error(error);
	void shutdown(1);
}

async function watch(config: UserConfig, changed: () => void): Promise<void> {
	const result = await build({ ...config, configFile: false, build: { ...config.build, watch: {} } });
	if (!("on" in result)) throw new Error("Expected a Vite build watcher");
	watchers.push(result);
	await new Promise<void>((resolve, reject) => {
		let first = true;
		result.on("event", event => {
			if (event.code === "ERROR") {
				if (first) reject(event.error);
				else console.error(event.error);
			} else if (event.code === "END") {
				if (first) {
					first = false;
					resolve();
				} else if (started) changed();
			}
		});
	});
}

process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));
try {
	process.env.NODE_ENV_ELECTRON_VITE = "development";
	const { config } = await resolveConfig(
		{
			mode: values.mode,
			configFile: values.config,
			clearScreen: values.clearScreen !== "false",
		},
		"serve",
		"development",
	);
	if (!config?.main || !config.preload || !config.renderer) throw new Error("Missing Electron Vite configuration");
	await watch(config.main, () => {
		restarting = restarting
			.then(async () => {
				console.log("Restarting Electron after main rebuild...");
				await stopElectron();
				launch();
			})
			.catch(fail);
	});
	await watch(config.preload, () => server?.ws.send({ type: "full-reload" }));
	server = await createServer({ ...config.renderer, configFile: false });
	await server.listen();
	server.printUrls();
	const url = server.resolvedUrls?.local[0];
	if (!url) throw new Error("Missing renderer URL");
	process.env.ELECTRON_RENDERER_URL = url;
	started = true;
	launch();
} catch (error) {
	fail(error);
}
