#!/usr/bin/env bun
import { type ChildProcess, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { DEV_RESTART_ENV, DEV_RESTART_EXIT_CODE } from "../src/shared/dev-restart";

const checkout = realpathSync(join(import.meta.dir, ".."));
const profileRoot = process.env.WISA_PROFILE_ROOT ?? homedir();
if (!isAbsolute(profileRoot)) throw new Error("WISA_PROFILE_ROOT must be absolute");
const checkoutId = createHash("sha256").update(checkout).digest("hex").slice(0, 24);
const registry = join(profileRoot, ".wisa-studio-dev", "tmp", "launchers", checkoutId);
const windows = process.platform === "win32";

function hasExited(child: ChildProcess): boolean {
	return child.exitCode !== null || child.signalCode !== null;
}

async function stopTree(child: ChildProcess): Promise<void> {
	const pid = child.pid;
	if (pid === undefined || hasExited(child)) return;
	if (windows) {
		const kill = spawn("taskkill.exe", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
		const [code] = await once(kill, "exit");
		if (code !== 0 && !hasExited(child)) throw new Error(`taskkill failed for dev PID ${pid} (exit ${code})`);
	} else {
		try {
			process.kill(-pid, "SIGTERM");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
		}
	}
}

async function stopDev(): Promise<void> {
	let entries: string[];
	try {
		entries = readdirSync(registry);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		entries = [];
	}
	let stopped = 0;
	for (const entry of entries) {
		if (!/^[a-f\d-]{36}\.port$/.test(entry)) continue;
		const file = join(registry, entry);
		let port: number;
		try {
			port = Number(readFileSync(file, "utf8"));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw error;
		}
		if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid dev registry entry: ${file}`);
		const response = await fetch(`http://127.0.0.1:${port}/stop/${entry.slice(0, -5)}`, {
			method: "POST",
			redirect: "error",
			proxy: "",
			signal: AbortSignal.timeout(10_000),
		}).catch(error => {
			// The launcher may have been killed outside this script, leaving its entry behind.
			if (error?.code === "ECONNREFUSED" || error?.cause?.code === "ECONNREFUSED") return null;
			throw error;
		});
		if (!response || response.status === 404) rmSync(file, { force: true });
		else if (response.status === 204) stopped++;
		else throw new Error(await response.text());
	}
	console.log(stopped ? "Stopped Wisa dev." : "No Wisa dev process is running for this checkout and profile.");
}

async function runDev(args: string[]): Promise<number> {
	let current: { child: ChildProcess; exit: Promise<number> } | undefined;
	let stopping: Promise<unknown> | undefined;
	const stop = () => {
		if (!stopping) {
			const run = current;
			stopping = run ? stopTree(run.child).then(() => run.exit) : Promise.resolve();
			void stopping.catch(() => {
				stopping = undefined;
			});
		}
		return stopping;
	};
	const onSignal = () => {
		void stop().catch(console.error);
	};
	const run = (file: string, args: string[], env?: NodeJS.ProcessEnv) => {
		const child = spawn(file, args, { cwd: checkout, detached: !windows, env, stdio: "inherit" });
		const exit = once(child, "exit").then(([code]) => code ?? 1);
		current = { child, exit };
		return exit;
	};

	// The random path lives only in the checkout/profile registry. Stop requests
	// reach the launcher that owns the child handle; registry data never supplies a PID.
	const token = randomUUID();
	const registration = join(registry, `${token}.port`);
	const pending = `${registration}.tmp`;
	mkdirSync(registry, { recursive: true, mode: 0o700 });
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			if (request.method !== "POST" || new URL(request.url).pathname !== `/stop/${token}`)
				return new Response(null, { status: 404 });
			try {
				await stop();
				return new Response(null, { status: 204 });
			} catch (error) {
				return new Response(String(error), { status: 500 });
			}
		},
	});
	process.on("SIGINT", onSignal);
	process.on("SIGTERM", onSignal);
	try {
		writeFileSync(pending, String(server.port), { mode: 0o600 });
		renameSync(pending, registration);
		const setup = await run(process.execPath, ["run", "build:omp:dev"]);
		if (stopping) return 0;
		if (setup !== 0) return setup;
		const notch = await run(process.execPath, ["run", "build:notch-island"]);
		if (stopping) return 0;
		if (notch !== 0) return notch;
		const cli = join(checkout, "scripts", "dev-server.ts");
		const env = { ...process.env, [DEV_RESTART_ENV]: "1" };
		let exitCode: number;
		do {
			exitCode = await run(process.execPath, [cli, ...args], env);
		} while (!stopping && exitCode === DEV_RESTART_EXIT_CODE);
		return stopping ? 0 : exitCode;
	} finally {
		process.off("SIGINT", onSignal);
		process.off("SIGTERM", onSignal);
		await server.stop();
		rmSync(registration, { force: true });
		rmSync(pending, { force: true });
	}
}

const args = process.argv.slice(2);
try {
	if (args.length === 1 && args[0] === "--stop") await stopDev();
	else process.exitCode = await runDev(args);
} catch (error) {
	console.error(`dev: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
}
