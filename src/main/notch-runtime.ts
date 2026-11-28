import { homedir } from "node:os";
import { join } from "node:path";
import { app } from "electron";
import { AGENT_NOTCH_CHANNELS, type AgentNotchSettings, type AgentNotchState } from "../shared/agent-notch";
import { IPC_EVENTS } from "../shared/ipc-types";
import { startNativeNotch } from "./agent-notch";
import { normalizeAgentNotchSettings, notchRequestPresentation, notchResponse } from "./agent-notch-state";
import { mainT } from "./i18n";
import { NotchIntegrations } from "./notch-integrations";
import { createNotchPanel } from "./notch-panel";
import { writeRuntimeLog } from "./runtime-log";
import type { NotchPoolRequest, SidecarPool } from "./sidecar-pool";
import type { WindowManager } from "./window";

function panelLabels(): Record<string, string> {
	return {
		...Object.fromEntries(
			(
				[
					"title",
					"open",
					"allow",
					"always",
					"deny",
					"empty",
					"working",
					"done",
					"waiting",
					"failed",
					"activity",
					"close",
					"idle",
					"hideSession",
					"mute",
					"unmute",
					"send",
				] as const
			).map(key => [key, mainT(`notch.${key}`)]),
		),
		newSession: mainT("menu.newSession"),
		settings: mainT("menu.settings"),
	};
}

/** Coordinates two real renderers; neither owns agent credentials or installation. */
export function startAgentNotch(options: {
	pool: SidecarPool;
	windowManager: WindowManager;
	readPreference: () => unknown;
	writePreference: (settings: AgentNotchSettings) => void;
}) {
	const { pool, windowManager } = options;
	let settings = normalizeAgentNotchSettings(options.readPreference());
	let native: ReturnType<typeof startNativeNotch> | undefined;
	let portable: ReturnType<typeof createNotchPanel> | undefined;
	let disposed = false;
	let error: string | null = null;
	let customActive = false;
	const effectiveSettings = (): AgentNotchSettings => ({ ...settings, enabled: settings.enabled && !customActive });
	const labels = panelLabels();
	const sessions = new Map<string, Record<string, unknown>>();
	const pending = new Map<string, { event: Record<string, unknown>; respond: (reply: unknown) => void }>();
	const wisaSessions = new Map<string, string>();
	const wisaRequests = new Map<NotchPoolRequest, string>();
	const getState = (): AgentNotchState => ({
		...(native?.getState() ?? { available: error === null, error }),
		settings: structuredClone(settings),
	});
	const broadcast = (): void => {
		for (const window of windowManager.getAllWindows())
			if (!window.isDestroyed()) window.webContents.send(AGENT_NOTCH_CHANNELS.changed, getState());
	};
	const open = (id: string): void => {
		const owner = pool.notchSessions().find(session => session.tabId === id);
		const window = owner
			? windowManager.getAllWindows().find(item => item.webContents.id === owner.windowId)
			: windowManager.getTargetWindow();
		if (!window || !windowManager.focusWindowById(window.webContents.id)) return;
		if (owner) window.webContents.send(IPC_EVENTS.WINDOW_FOCUS_TAB, { tabId: id });
	};
	const openSettings = (): void => {
		const window = windowManager.getTargetWindow();
		if (!window || !windowManager.focusWindowById(window.webContents.id)) return;
		window.webContents.send(IPC_EVENTS.MENU_ACTION, { action: "open-settings", settingsTab: "notch" });
	};
	const cancel = (id: string): void => {
		pending.delete(id);
		native?.cancel(id);
		portable?.cancel(id);
	};
	const dispatch = (event: Record<string, unknown>, reply?: (response: unknown) => void): void => {
		if (customActive) return;
		native?.sendEvent(event, reply);
		portable?.send(event, reply);
	};
	const replayExternal = (): void => {
		for (const event of sessions.values()) dispatch(event);
		for (const { event, respond } of pending.values()) dispatch(event, respond);
	};
	const integrations = new NotchIntegrations({
		directory: join(app.getPath("userData"), "notch-integrations"),
		home: homedir(),
		enabledAgents: () => (settings.enabled && !customActive ? settings.agents : []),
		onCancel: cancel,
		onEvent(event, respond) {
			if (
				disposed ||
				!settings.enabled ||
				customActive ||
				!settings.agents.includes(event._agent as AgentNotchSettings["agents"][number])
			) {
				respond?.({});
				return;
			}
			const id = event.session_id;
			if (typeof id !== "string") {
				respond?.({});
				return;
			}
			if (event.hook_event_name === "SessionEnd") {
				sessions.delete(id);
				for (const [requestId, entry] of pending) if (entry.event.session_id === id) cancel(requestId);
			} else {
				const previous = sessions.get(id);
				const running =
					event.hook_event_name === "Stop" || event.hook_event_name === "StopFailure"
						? false
						: event.hook_event_name === "SessionStart"
							? false
							: event.hook_event_name === "UserPromptSubmit" ||
									event.hook_event_name === "PreToolUse" ||
									event.hook_event_name === "PostToolUse"
								? true
								: previous?.running === true;
				sessions.set(id, { ...previous, ...event, hook_event_name: "WisaSnapshot", running });
			}
			if (respond && typeof event._request_id === "string") {
				const requestId = event._request_id;
				if (!settings.approveInNotch) {
					respond({});
					dispatch({
						...event,
						hook_event_name: "Notification",
						notification_type: "permission_prompt",
						message: labels.waiting,
					});
					return;
				}
				const answer = (reply: unknown): void => {
					if (pending.get(requestId)?.respond !== answer) return;
					respond(reply);
					cancel(requestId);
				};
				pending.set(requestId, { event, respond: answer });
				dispatch(event, answer);
			} else dispatch(event);
		},
	});
	function syncWisa(): void {
		if (!portable || disposed || !settings.enabled || customActive) return;
		const current = settings.agents.includes("wisa") ? pool.notchSessions() : [];
		const active = new Set(current.flatMap(session => session.requests));
		for (const [request, id] of wisaRequests)
			if (!active.has(request)) {
				portable.cancel(id);
				wisaRequests.delete(request);
			}
		for (const id of wisaSessions.keys())
			if (!current.some(session => session.tabId === id)) {
				portable.send({ hook_event_name: "SessionEnd", session_id: id, _agent: "wisa" });
				wisaSessions.delete(id);
			}
		for (const session of current) {
			const base = { session_id: session.tabId, _agent: "wisa", _title: session.title, cwd: session.cwd };
			const snapshot = {
				...base,
				hook_event_name: "WisaSnapshot",
				running: session.running,
				tool_name: session.tools.at(-1) ?? null,
				last_assistant_message: session.preview,
			};
			const key = JSON.stringify(snapshot);
			if (wisaSessions.get(session.tabId) !== key) {
				wisaSessions.set(session.tabId, key);
				portable.send(snapshot);
			}
			for (const request of session.requests.slice(0, 1)) {
				if (wisaRequests.has(request)) continue;
				const presentation = notchRequestPresentation(request.request);
				wisaRequests.set(request, request.request.id);
				if (!presentation) {
					portable.send({ ...base, hook_event_name: "Notification", message: mainT("notch.waiting") });
					continue;
				}
				portable.send(
					{ ...base, ...presentation, hook_event_name: "PermissionRequest", _request_id: request.request.id },
					reply => {
						if (!wisaRequests.has(request)) return;
						const response = notchResponse(request.request, reply);
						if (response) request.respond(response);
					},
				);
			}
		}
	}
	function configure(value: unknown): AgentNotchState {
		const next = normalizeAgentNotchSettings(value);
		const previous = settings;
		options.writePreference(next);
		settings = next;
		for (const [id, entry] of pending)
			if (
				!next.enabled ||
				!next.agents.includes(entry.event._agent as AgentNotchSettings["agents"][number]) ||
				!next.approveInNotch
			) {
				entry.respond({});
				cancel(id);
			}
		for (const [id, event] of sessions)
			if (!next.agents.includes(event._agent as AgentNotchSettings["agents"][number])) {
				sessions.delete(id);
				dispatch({ ...event, hook_event_name: "SessionEnd" });
			}
		native?.configure(effectiveSettings());
		portable?.configure(effectiveSettings());
		if (!next.enabled) {
			wisaSessions.clear();
			wisaRequests.clear();
		} else if (next.approveInNotch !== previous.approveInNotch) {
			for (const id of wisaRequests.values()) portable?.cancel(id);
			wisaRequests.clear();
		}
		if (portable && !previous.enabled && next.enabled) replayExternal();
		syncWisa();
		broadcast();
		return getState();
	}
	try {
		if (process.platform === "darwin")
			native = startNativeNotch({
				...options,
				readPreference: effectiveSettings,
				labels: () => labels,
				onReady: replayExternal,
				onOpen: open,
				onSettings: openSettings,
				onDisable: () => configure({ ...settings, enabled: false }),
				onSounds: sounds => configure({ ...settings, sounds }),
			});
		else
			portable = createNotchPanel({
				settings: effectiveSettings(),
				labels,
				onOpen: open,
				onDisable: () => configure({ ...settings, enabled: false }),
			});
	} catch (cause) {
		error = cause instanceof Error ? cause.message : String(cause);
		writeRuntimeLog({ source: "child-process", message: error, details: { feature: "agent-notch" } });
	}
	const unsubscribe = pool.subscribeNotch(syncWisa);
	syncWisa();
	void integrations.start().catch(cause => {
		if (disposed) return;
		writeRuntimeLog({ source: "child-process", message: String(cause), details: { feature: "notch-integrations" } });
	});
	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		unsubscribe();
		integrations.dispose();
		native?.dispose();
		portable?.dispose();
		pending.clear();
		sessions.clear();
		app.off("will-quit", dispose);
	};
	app.once("will-quit", dispose);
	return {
		getState,
		configure,
		integrations,
		setCustomActive(active: boolean): void {
			if (customActive === active) return;
			customActive = active;
			if (active) {
				for (const [id, entry] of pending) {
					entry.respond({});
					cancel(id);
				}
				wisaSessions.clear();
				wisaRequests.clear();
			}
			native?.configure(effectiveSettings());
			portable?.configure(effectiveSettings());
			if (!active) replayExternal();
			syncWisa();
			broadcast();
		},
		dispose,
		refreshLanguage(): void {
			Object.assign(labels, panelLabels());
			native?.refreshLanguage();
			portable?.configure(effectiveSettings());
		},
	};
}
