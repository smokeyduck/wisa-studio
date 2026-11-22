import { useEffect, useRef } from "react";
import { usePlanApprovalStore } from "../stores/plan-approval";
import { useSessionStore } from "../stores/session";
import { useTabsStore } from "../stores/tabs";
import { useUiStore } from "../stores/ui";

/** Reveal transitions, not tokens: closing wins until the next planning turn or proposal. */
export function usePlanSidebar(): void {
 const tabId = useTabsStore(state => state.activeTabId);
 const scope = useSessionStore(state => `${state.cwd}:${state.sessionId ?? state.sessionFile ?? "new"}`);
 const enabled = useSessionStore(state => state.planModeEnabled);
 const streaming = useSessionStore(state => state.isStreaming);
 const proposal = usePlanApprovalStore(state => state.pending);
 const previous = useRef<{ scope: string; enabled: boolean; streaming: boolean; proposal: typeof proposal } | null>(null);
 useEffect(() => {
  const key = `${tabId}:${scope}`;
  const before = previous.current;
  if ((enabled || proposal) && (!before || before.scope !== key || (!before.enabled && enabled) || (!before.streaming && streaming) || before.proposal !== proposal)) useUiStore.getState().setPanelTab("plan");
  previous.current = { scope: key, enabled, streaming, proposal };
 }, [tabId, scope, enabled, proposal, streaming]);
}
