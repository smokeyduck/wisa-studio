import { useEffect } from "react";
import { useMcpStore } from "../stores/mcp";
import { useSessionStore } from "../stores/session";
import { useRuntimeTabId } from "../stores/session-runtime-context";
import { useTabsStore } from "../stores/tabs";
import { useActiveTabRouteReady } from "./use-active-tab-route";

/** Shared live snapshot for Overview and Settings, scoped to the owning task. */
export function useMcpServers(enabled = true) {
	const state = useMcpStore();
	const status = useSessionStore(s => s.status);
	const sessionId = useSessionStore(s => s.sessionId);
	const cwd = useSessionStore(s => s.cwd);
	const runtimeTabId = useRuntimeTabId();
	const activeTabId = useTabsStore(s => s.activeTabId);
	const tabId = runtimeTabId ?? activeTabId;
	const routeReady = useActiveTabRouteReady();
	const ready = status === "ready" && routeReady;
	const sessionKey = `${tabId}:${cwd}:${sessionId ?? "new"}`;
	const { watch, refresh, reset } = state;

	useEffect(() => {
		if (!enabled) return;
		if (!ready) {
			reset();
			return;
		}
		const stop = watch(sessionKey);
		const events = window.omp.events;
		const onChange = () => void refresh();
		const stopConfig = events.onTabConfigUpdate
			? events.onTabConfigUpdate((_, origin) => {
					if (origin === tabId) onChange();
				})
			: events.onConfigUpdate(onChange);
		const stopCommands = events.onTabCommandsUpdate?.((_, origin) => {
			if (origin === tabId) onChange();
		});
		const stopBatch = events.onTabBatch?.((batch, origin) => {
			if (origin === tabId && batch.some(event => event.type === "tool_execution_end" || event.type === "agent_end"))
				onChange();
		});
		return () => {
			stop();
			stopConfig();
			stopCommands?.();
			stopBatch?.();
		};
	}, [enabled, ready, sessionKey, tabId, watch, refresh, reset]);

	return {
		data: enabled && ready && state.sessionKey === sessionKey ? state.data : null,
		error: enabled && ready && state.sessionKey === sessionKey ? state.error : null,
		loading: state.loading,
		ready,
		refresh,
	};
}
