import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { connect, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app, screen } from "electron";
import { AGENT_NOTCH_CHANNELS, type AgentNotchState } from "../shared/agent-notch";
import { IPC_EVENTS } from "../shared/ipc-types";
import { normalizeAgentNotchSettings, notchRequestPresentation, notchResponse } from "./agent-notch-state";
import { writeRuntimeLog } from "./runtime-log";
import type { NotchPoolRequest, NotchPoolSession, SidecarPool } from "./sidecar-pool";
import type { WindowManager } from "./window";

interface Helper {
	process: ChildProcess;
	directory: string;
	socket: string;
	ready: boolean;
	stderr: string;
	sessions: Map<string, string>;
	requests: Map<NotchPoolRequest | string, Socket | null>;
	connections: Set<Socket>;
	readyTimer?: NodeJS.Timeout;
}

export function startNativeNotch(options: {
	pool: SidecarPool;
	windowManager: WindowManager;
	readPreference: () => unknown;
	labels: () => Record<string, string>;
	onReady: () => void;
	onSettings: () => void;
	onDisable: () => void;
	onSounds: (enabled: boolean) => void;
	onOpen: (id: string) => void;
}) {
	const { pool, windowManager } = options;
	let settings = normalizeAgentNotchSettings(options.readPreference());
	let error: string | null = null;
	let disposed = false;
	const helpers = new Map<number, Helper>();
	const binary = join(
		app.isPackaged ? process.resourcesPath : join(app.getAppPath(), "resources"),
		"notch-island",
		"Notch Island.app",
		"Contents",
		"MacOS",
		"NotchIsland",
	);
	const supported = process.platform === "darwin";
	const getState = (): AgentNotchState => ({
		settings: { ...settings },
		available: supported && existsSync(binary) && error === null,
		error,
	});
	const broadcast = (): void => {
		for (const win of windowManager.getAllWindows())
			if (!win.isDestroyed()) win.webContents.send(AGENT_NOTCH_CHANNELS.changed, getState());
	};
	const open = (tabId: string): void => {
		const session = pool.notchSessions().find(item => item.tabId === tabId);
		if (!session || !windowManager.focusWindowById(session.windowId)) return;
		const win = windowManager.getAllWindows().find(item => item.webContents.id === session.windowId);
		if (win && !win.isDestroyed()) win.webContents.send(IPC_EVENTS.WINDOW_FOCUS_TAB, { tabId });
	};
	const stop = (id: number): void => {
		const helper = helpers.get(id);
		if (!helper) return;
		helpers.delete(id);
		clearTimeout(helper.readyTimer);
		for (const socket of helper.connections) socket.destroy();
		for (const socket of helper.requests.values()) socket?.destroy();
		helper.process.kill();
		rmSync(helper.directory, { recursive: true, force: true });
	};
	const fail = (id: number, helper: Helper, message: string): void => {
		if (helpers.get(id) !== helper || disposed) return;
		error = message;
		writeRuntimeLog({
			source: "child-process",
			message,
			details: { feature: "agent-notch", displayId: id, stderr: helper.stderr },
		});
		stop(id);
		broadcast();
	};
	const configuration = () => ({ ...settings, labels: options.labels() });
	const refreshLanguage = (): void => {
		for (const helper of helpers.values())
			if (helper.ready) send(helper, { hook_event_name: "WisaConfigure", configuration: configuration() });
	};
	const cancel = (requestId: string): void => {
		for (const helper of helpers.values()) {
			const socket = helper.requests.get(requestId);
			helper.requests.delete(requestId);
			socket?.destroy();
		}
	};
	const sendEvent = (event: Record<string, unknown>, reply?: (response: unknown) => void): void => {
		for (const helper of helpers.values()) {
			if (!helper.ready) continue;
			const id = event._request_id;
			if (!reply || typeof id !== "string") {
				send(helper, event);
				continue;
			}
			if (helper.requests.has(id)) continue;
			const socket = connect(helper.socket);
			helper.requests.set(id, socket);
			helper.connections.add(socket);
			let buffer = "";
			socket.on("connect", () => socket.write(`${JSON.stringify(event)}\n`));
			socket.on("error", () => socket.destroy());
			socket.on("close", () => helper.connections.delete(socket));
			socket.on("data", data => {
				buffer += data.toString("utf8");
				if (buffer.length > 65_536) {
					socket.destroy();
					return;
				}
				const newline = buffer.indexOf("\n");
				if (newline < 0) return;
				try {
					const response = JSON.parse(buffer.slice(0, newline)) as Record<string, unknown>;
					if (helper.requests.get(id) === socket && response._request_id === id) reply(response);
				} catch {
					/* Invalid replies never reach external agents. */
				}
				socket.destroy();
			});
		}
	};
	const send = (
		helper: Helper,
		event: Record<string, unknown>,
		pending?: { session: NotchPoolSession; request: NotchPoolRequest },
	): void => {
		const socket = connect(helper.socket);
		helper.connections.add(socket);
		if (pending) helper.requests.set(pending.request, socket);
		let buffer = "";
		socket.on("connect", () => {
			const line = `${JSON.stringify(event)}\n`;
			if (pending) socket.write(line);
			else socket.end(line);
		});
		socket.on("error", () => socket.destroy());
		socket.on("close", () => {
			helper.connections.delete(socket);
			// Keep the request marker until cancellation: a failed transport must not create a retry/approval loop.
		});
		if (!pending) return;
		socket.on("data", data => {
			buffer += data.toString("utf8");
			if (buffer.length > 65536) {
				socket.destroy();
				return;
			}
			const newline = buffer.indexOf("\n");
			if (newline < 0) return;
			try {
				const reply = JSON.parse(buffer.slice(0, newline)) as Record<string, unknown>;
				if (reply._request_id !== pending.request.request.id || helper.requests.get(pending.request) !== socket)
					return;
				if (reply.behavior === "ask") open(pending.session.tabId);
				else {
					const response = notchResponse(pending.request.request, reply);
					if (response) pending.request.respond(response);
				}
			} catch {
				/* Invalid native replies never reach Core. */
			}
			socket.destroy();
		});
	};
	const sync = (): void => {
		if (disposed) return;
		const sessions = settings.agents.includes("wisa") ? pool.notchSessions() : [];
		const pending = new Set(sessions.flatMap(session => session.requests));
		for (const helper of helpers.values()) {
			if (!helper.ready) continue;
			for (const [request, socket] of helper.requests)
				if (typeof request !== "string" && !pending.has(request)) {
					helper.requests.delete(request);
					socket?.destroy();
				}
			for (const tabId of helper.sessions.keys())
				if (!sessions.some(session => session.tabId === tabId)) {
					send(helper, { hook_event_name: "SessionEnd", session_id: tabId, _agent: "wisa" });
					helper.sessions.delete(tabId);
				}
			for (const session of sessions) {
				const base = { session_id: session.tabId, _agent: "wisa", _title: session.title, cwd: session.cwd };
				const snapshot = JSON.stringify([
					session.title,
					session.running,
					session.tools,
					session.preview,
					session.requests.map(item => item.request.id),
				]);
				if (helper.sessions.get(session.tabId) !== snapshot) {
					helper.sessions.set(session.tabId, snapshot);
					send(helper, {
						...base,
						hook_event_name: "WisaSnapshot",
						running: session.running,
						tool_name: session.tools.at(-1) ?? null,
						last_assistant_message: session.preview,
					});
				}
				for (const request of session.requests.slice(0, 1)) {
					if (helper.requests.has(request)) continue;
					const presentation = notchRequestPresentation(request.request);
					if (presentation)
						send(
							helper,
							{
								...base,
								...presentation,
								hook_event_name: "PermissionRequest",
								_request_id: request.request.id,
							},
							{ session, request },
						);
					else {
						// Unsupported forms/login/editor remain in their original Wisa UI; never synthesize an answer.
						send(helper, {
							...base,
							hook_event_name: "Notification",
							message: options.labels().waiting,
							notification_type: "permission_prompt",
						});
						helper.requests.set(request, null);
					}
				}
			}
		}
	};
	const reconcile = (): void => {
		if (disposed) return;
		if (!supported) return;
		if (!existsSync(binary)) {
			error = "Notch Island native helper is not installed.";
			for (const id of helpers.keys()) stop(id);
			broadcast();
			return;
		}
		error = null;
		const displays = settings.enabled
			? settings.displays === "primary"
				? [screen.getPrimaryDisplay()]
				: screen.getAllDisplays()
			: [];
		const desired = new Set(displays.map(display => display.id));
		for (const id of helpers.keys()) if (!desired.has(id)) stop(id);
		for (const display of displays) {
			if (helpers.has(display.id)) continue;
			let directory: string | undefined;
			try {
				const home = join(app.getPath("userData"), "notch-island-home");
				mkdirSync(home, { recursive: true, mode: 0o700 });
				chmodSync(home, 0o700);
				directory = mkdtempSync(join(tmpdir(), "wn-"));
				chmodSync(directory, 0o700);
				const socket = join(directory, "s");
				if (Buffer.byteLength(socket) >= 104) throw new Error("Native notch socket path exceeds macOS limit");
				const profile = createHash("sha256").update(app.getPath("userData")).digest("hex").slice(0, 24);
				const child = spawn(binary, [], {
					env: {
						PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
						HOME: home,
						TMPDIR: directory,
						NOTCH_ISLAND_SOCKET: socket,
						WISA_NOTCH: "1",
						WISA_NOTCH_DISPLAY_ID: String(display.id),
						WISA_NOTCH_SHOW_IDLE: settings.showWhenIdle ? "1" : "0",
						WISA_NOTCH_DEFAULTS: `org.wisa.notch.${profile}`,
						WISA_NOTCH_CONFIG: JSON.stringify(configuration()),
					},
					stdio: ["ignore", "pipe", "pipe"],
				});
				const helper: Helper = {
					process: child,
					directory,
					socket,
					ready: false,
					stderr: "",
					sessions: new Map(),
					requests: new Map(),
					connections: new Set(),
				};
				helpers.set(display.id, helper);
				helper.readyTimer = setTimeout(() => fail(display.id, helper, "Notch Island did not become ready."), 10000);
				helper.readyTimer.unref();
				child.stderr?.on("data", data => {
					helper.stderr = (helper.stderr + data.toString("utf8")).slice(-4096);
				});
				let output = "";
				child.stdout?.on("data", data => {
					output += data.toString("utf8");
					if (output.length > 65536) {
						fail(display.id, helper, "Invalid native notch output.");
						return;
					}
					let newline = output.indexOf("\n");
					while (newline >= 0) {
						const line = output.slice(0, newline);
						output = output.slice(newline + 1);
						try {
							const event = JSON.parse(line);
							if (helpers.get(display.id) !== helper) return;
							if (event.type === "ready") {
								helper.ready = true;
								clearTimeout(helper.readyTimer);
								sync();
								broadcast();
								options.onReady();
							} else if (event.type === "open" && typeof event.sessionId === "string")
								options.onOpen(event.sessionId);
							else if (event.type === "settings") options.onSettings();
							else if (event.type === "disable") options.onDisable();
							else if (event.type === "sounds" && typeof event.enabled === "boolean")
								options.onSounds(event.enabled);
						} catch {
							/* stdout is a protocol, not an executable command channel. */
						}
						newline = output.indexOf("\n");
					}
				});
				child.on("error", failure => fail(display.id, helper, `Notch Island launch failed: ${failure.message}`));
				child.on("exit", (code, signal) =>
					fail(display.id, helper, `Notch Island helper exited (${signal ?? `code ${code}`}).`),
				);
			} catch (failure) {
				if (directory) rmSync(directory, { recursive: true, force: true });
				error = `Notch Island launch failed: ${String(failure)}`;
				writeRuntimeLog({
					source: "child-process",
					message: error,
					details: { feature: "agent-notch", displayId: display.id },
				});
			}
		}
		sync();
		broadcast();
	};
	const unsubscribe = pool.subscribeNotch(sync);
	if (supported) {
		screen.on("display-added", reconcile);
		screen.on("display-removed", reconcile);
		screen.on("display-metrics-changed", reconcile);
	}
	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		unsubscribe();
		if (supported) {
			screen.off("display-added", reconcile);
			screen.off("display-removed", reconcile);
			screen.off("display-metrics-changed", reconcile);
		}
		app.off("will-quit", dispose);
		for (const id of helpers.keys()) stop(id);
	};
	app.once("will-quit", dispose);
	reconcile();
	return {
		getState,
		sendEvent,
		cancel,
		refreshLanguage,
		configure(value: unknown) {
			const next = normalizeAgentNotchSettings(value);
			if (next.approveInNotch !== settings.approveInNotch) {
				for (const helper of helpers.values())
					for (const [request, socket] of helper.requests) {
						if (typeof request === "string") continue;
						helper.requests.delete(request);
						socket?.destroy();
					}
			}
			settings = next;
			refreshLanguage();
			reconcile();
			return getState();
		},
		dispose,
	};
}
