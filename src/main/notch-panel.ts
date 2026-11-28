import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { BrowserWindow, type Display, globalShortcut, type IpcMainEvent, ipcMain, screen, shell } from "electron";
import type { AgentNotchSettings } from "../shared/agent-notch";
import {
	NOTCH_PANEL_CHANNELS,
	type NotchPanelState,
	type PanelRequest,
	type PanelSession,
	parsePanelEvent,
	validPanelAnswer,
} from "../shared/notch-panel";

export function createNotchPanel(options: {
	settings: AgentNotchSettings;
	onOpen: (id: string) => void;
	onDisable: () => void;
	labels: Record<string, string>;
}): {
	send(event: Record<string, unknown>, reply?: (response: unknown) => void): void;
	cancel(requestId: string): void;
	configure(settings: AgentNotchSettings): void;
	dispose(): void;
} {
	let settings = structuredClone(options.settings);
	let disposed = false;
	const windows = new Map<number, { window: BrowserWindow; expanded: boolean }>();
	const sessions = new Map<string, PanelSession>();
	const pending = new Map<string, { request: PanelRequest; reply?: (response: unknown) => void }>();
	const answered = new Map<string, string>();
	const activity: string[] = [];
	const shortcuts = new Set<string>();
	const snapshot = (expanded: boolean): NotchPanelState => ({
		settings,
		labels: options.labels,
		expanded,
		sessions: [...sessions.values()],
		requests: [...pending.values()].map(item => item.request),
		activity,
	});
	function layout(display: Display, entry: { window: BrowserWindow; expanded: boolean }): void {
		const area = display.workArea;
		const width = Math.min(entry.expanded ? settings.width : 300, area.width);
		const height = Math.min(entry.expanded ? 620 : 42, area.height);
		entry.window.setBounds({ x: Math.round(area.x + (area.width - width) / 2), y: area.y, width, height });
	}
	function publish(): void {
		const visible =
			settings.enabled &&
			(settings.showWhenIdle ||
				[...sessions.values()].some(session => session.running || session.waiting) ||
				pending.size > 0);
		for (const [id, entry] of windows) {
			if (entry.window.isDestroyed()) continue;
			const display = screen.getAllDisplays().find(item => item.id === id);
			if (display) layout(display, entry);
			entry.window.webContents.send(NOTCH_PANEL_CHANNELS.state, snapshot(entry.expanded));
			if (visible) entry.window.showInactive();
			else entry.window.hide();
		}
	}
	function refreshShortcuts(): void {
		for (const key of shortcuts) globalShortcut.unregister(key);
		shortcuts.clear();
		if (!settings.enabled || !settings.shortcuts || !settings.approveInNotch || !pending.size) return;
		for (const [key, behavior] of [
			["CommandOrControl+Alt+Y", "allow"],
			["CommandOrControl+Alt+N", "deny"],
		] as const) {
			// A conflict is left untouched; only registrations owned by this panel are removed.
			if (globalShortcut.isRegistered(key)) continue;
			if (
				globalShortcut.register(key, () => {
					const item = pending.values().next().value;
					if (item && !item.request.questions && item.request.supported)
						respond(item.request.id, item.request.identity, behavior);
				})
			)
				shortcuts.add(key);
		}
	}
	function respond(id: string, identity: string, behavior: string, answers?: unknown): void {
		const item = pending.get(id);
		if (
			!settings.enabled ||
			!settings.approveInNotch ||
			!item ||
			item.request.identity !== identity ||
			!item.request.supported ||
			!item.reply
		)
			return;
		if (item.request.questions) {
			if (behavior !== "answer" || !validPanelAnswer(item.request, answers)) return;
		} else if (behavior !== "allow" && behavior !== "deny" && !(behavior === "always" && item.request.always)) return;
		pending.delete(id);
		answered.set(id, item.request.sessionId);
		const session = sessions.get(item.request.sessionId);
		if (session) {
			session.waiting = false;
			session.running = behavior !== "deny";
		}
		refreshShortcuts();
		publish();
		item.reply({ _request_id: id, behavior, ...(behavior === "answer" ? { answers } : {}) });
	}
	function own(event: IpcMainEvent): { window: BrowserWindow; expanded: boolean } | undefined {
		if (disposed || event.senderFrame !== event.sender.mainFrame) return;
		return [...windows.values()].find(entry => entry.window.webContents === event.sender);
	}
	function get(event: IpcMainEvent): void {
		const entry = own(event);
		if (entry) event.sender.send(NOTCH_PANEL_CHANNELS.state, snapshot(entry.expanded));
	}
	function action(event: IpcMainEvent, value: unknown): void {
		const entry = own(event);
		if (!entry || !value || typeof value !== "object" || Array.isArray(value)) return;
		const input = value as Record<string, unknown>;
		if (input.type === "expand" || input.type === "collapse") {
			entry.expanded = input.type === "expand";
			publish();
		} else if (input.type === "disable") options.onDisable();
		else if (input.type === "open" && typeof input.sessionId === "string" && sessions.has(input.sessionId))
			options.onOpen(input.sessionId);
		else if (
			input.type === "respond" &&
			typeof input.requestId === "string" &&
			typeof input.identity === "string" &&
			typeof input.behavior === "string"
		)
			respond(input.requestId, input.identity, input.behavior, input.answers);
	}
	function reconcile(): void {
		if (disposed) return;
		const displays = settings.displays === "primary" ? [screen.getPrimaryDisplay()] : screen.getAllDisplays();
		for (const [id, entry] of windows)
			if (!displays.some(display => display.id === id)) {
				windows.delete(id);
				entry.window.destroy();
			}
		for (const display of displays) {
			if (windows.has(display.id)) continue;
			const window = new BrowserWindow({
				width: 300,
				height: 42,
				frame: false,
				transparent: true,
				resizable: false,
				maximizable: false,
				minimizable: false,
				fullscreenable: false,
				skipTaskbar: true,
				alwaysOnTop: true,
				show: false,
				hasShadow: false,
				title: options.labels.title ?? "Wisa",
				webPreferences: {
					preload: join(__dirname, "../preload/notch-panel.cjs"),
					sandbox: true,
					contextIsolation: true,
					nodeIntegration: false,
				},
			});
			const entry = { window, expanded: settings.openForApprovals && pending.size > 0 };
			windows.set(display.id, entry);
			window.setAlwaysOnTop(true, "floating");
			window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
			window.webContents.on("will-navigate", event => event.preventDefault());
			window.webContents.on("will-attach-webview", event => event.preventDefault());
			window.webContents.on("did-finish-load", publish);
			window.on("closed", () => windows.delete(display.id));
			if (process.env.ELECTRON_RENDERER_URL) {
				const url = new URL("notch-panel/index.html", `${process.env.ELECTRON_RENDERER_URL.replace(/\/$/, "")}/`);
				void window.loadURL(url.toString());
			} else void window.loadFile(join(__dirname, "../renderer/notch-panel/index.html"));
		}
		publish();
	}
	ipcMain.on(NOTCH_PANEL_CHANNELS.get, get);
	ipcMain.on(NOTCH_PANEL_CHANNELS.action, action);
	screen.on("display-added", reconcile);
	screen.on("display-removed", reconcile);
	screen.on("display-metrics-changed", reconcile);
	reconcile();
	return {
		send(value, reply) {
			if (disposed) return;
			const event = parsePanelEvent(value);
			if (!event || !settings.enabled || (event.kind !== "SessionEnd" && !settings.agents.includes(event.agent)))
				return;
			if (event.kind === "SessionEnd") {
				sessions.delete(event.sessionId);
				for (const [id, item] of pending) if (item.request.sessionId === event.sessionId) pending.delete(id);
				for (const [id, sessionId] of answered) if (sessionId === event.sessionId) answered.delete(id);
			} else {
				const session = sessions.get(event.sessionId) ?? {
					id: event.sessionId,
					agent: event.agent,
					title: event.title || event.agent,
					cwd: event.cwd,
					running: false,
					failed: false,
					waiting: false,
					tool: "",
					preview: "",
				};
				if (event.title) session.title = event.title;
				if (event.cwd) session.cwd = event.cwd;
				if (event.kind === "WisaSnapshot") {
					session.running = event.running;
					session.tool = event.tool;
					session.preview = event.preview;
					session.failed = false;
					session.waiting = false;
				}
				if (["UserPromptSubmit", "PreToolUse", "PostToolUse"].includes(event.kind)) {
					session.running = true;
					session.failed = false;
					session.waiting = false;
				}
				if (event.kind === "PreToolUse" || event.kind === "PostToolUse") session.tool = event.tool;
				if (event.kind === "Stop" || event.kind === "StopFailure") {
					session.running = false;
					session.failed = event.kind === "StopFailure";
					session.waiting = false;
					if (event.preview) session.preview = event.preview;
				}
				if (event.kind === "Notification" || event.kind === "PermissionRequest") {
					session.waiting = true;
					session.running = false;
					if (event.detail) session.preview = event.detail;
				}
				sessions.set(session.id, session);
				if (event.kind === "PermissionRequest" && !pending.has(event.requestId) && !answered.has(event.requestId)) {
					pending.set(event.requestId, {
						request: {
							id: event.requestId,
							identity: randomUUID(),
							sessionId: event.sessionId,
							tool: event.tool,
							detail: event.detail,
							questions: event.questions,
							always: event.always,
							supported: event.supported && !!reply,
						},
						reply,
					});
					if (settings.openForApprovals) for (const entry of windows.values()) entry.expanded = true;
				}
			}
			activity.unshift(
				`${event.title || event.agent} · ${event.tool || event.kind}${event.detail ? ` — ${event.detail.slice(0, 240)}` : ""}`,
			);
			activity.splice(30);
			if (settings.sounds && ["PermissionRequest", "Stop", "StopFailure"].includes(event.kind)) shell.beep();
			refreshShortcuts();
			publish();
		},
		cancel(requestId) {
			const item = pending.get(requestId);
			const session = item && sessions.get(item.request.sessionId);
			if (session) session.waiting = false;
			pending.delete(requestId);
			refreshShortcuts();
			publish();
		},
		configure(value) {
			settings = structuredClone(value);
			if (!settings.approveInNotch || !settings.enabled) pending.clear();
			if (!settings.enabled) {
				sessions.clear();
				answered.clear();
				activity.length = 0;
			}
			for (const [id, session] of sessions)
				if (!settings.agents.includes(session.agent)) {
					sessions.delete(id);
					for (const [requestId, item] of pending) if (item.request.sessionId === id) pending.delete(requestId);
				}
			refreshShortcuts();
			reconcile();
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			ipcMain.removeListener(NOTCH_PANEL_CHANNELS.get, get);
			ipcMain.removeListener(NOTCH_PANEL_CHANNELS.action, action);
			screen.removeListener("display-added", reconcile);
			screen.removeListener("display-removed", reconcile);
			screen.removeListener("display-metrics-changed", reconcile);
			for (const key of shortcuts) globalShortcut.unregister(key);
			shortcuts.clear();
			pending.clear();
			answered.clear();
			sessions.clear();
			for (const entry of windows.values()) entry.window.destroy();
			windows.clear();
		},
	};
}
