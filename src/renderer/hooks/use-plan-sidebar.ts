import { useEffect, useRef } from "react";
import { livePlanWritePath } from "../lib/plan-tool";
import { usePlanApprovalStore } from "../stores/plan-approval";
import { useSessionStore } from "../stores/session";
import { useSessionRuntime } from "../stores/session-runtime-context";
import { useTabsStore } from "../stores/tabs";
import { useToolsStore } from "../stores/tools";
import { useUiStore } from "../stores/ui";

/** Reveal transitions, not tokens: closing wins until the next planning turn or proposal. */
export function usePlanSidebar(): void {
	const tabId = useTabsStore(state => state.activeTabId);
	const runtime = useSessionRuntime();
	const scope = useSessionStore(state => `${state.cwd}:${state.sessionId || state.sessionFile || "new"}`);
	const enabled = useSessionStore(state => state.planModeEnabled);
	const streaming = useSessionStore(state => state.isStreaming);
	const switching = useSessionStore(state => state.switchPending);
	const proposal = usePlanApprovalStore(state => state.pending);
	const writing = useToolsStore(state => enabled && livePlanWritePath(state.activeTools, null) !== null);
	const seen = useRef<Map<string, { scope: string; enabled: boolean; running: boolean; proposal: typeof proposal }> | null>(null);
	useEffect(() => {
		if (!tabId || switching || (runtime && runtime.tabId !== tabId)) return;
		const states = (seen.current ??= new Map());
		const liveTabs = useTabsStore.getState().tabs;
		for (const id of states.keys()) {
			if (id !== tabId && !liveTabs.some(tab => tab.id === id)) states.delete(id);
		}
		const previous = states.get(tabId);
		const before = previous?.scope === scope ? previous : undefined;
		// Tool deltas can arrive through a parked tab's light stream before the
		// renderer observes agent_start. Either edge is the same planning run.
		const running = enabled && (streaming || writing);
		if ((enabled && (!before?.enabled || (running && !before.running))) || (proposal && before?.proposal !== proposal)) {
			useUiStore.getState().setPanelTab("plan");
		}
		states.set(tabId, { scope, enabled, running, proposal });
	}, [tabId, scope, enabled, proposal, runtime, streaming, switching, writing]);
}
