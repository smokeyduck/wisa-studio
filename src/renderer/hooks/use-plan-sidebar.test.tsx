import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { usePlanSidebar } from "./use-plan-sidebar";
import { createTabRuntime } from "../stores/tab-runtime";
import { SessionRuntimeProvider, deleteSessionRuntime } from "../stores/session-runtime-context";
import { useUiStore } from "../stores/ui";
import { useTabsStore } from "../stores/tabs";
import type { SessionStore } from "../stores/session";
import type { PlanApprovalStore } from "../stores/plan-approval";
import type { StoreApi } from "zustand/vanilla";
const { document, window, Event, HTMLElement, Node } = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { document, window, Event, HTMLElement, Node, IS_REACT_ACT_ENVIRONMENT: true });
function Reveal() { usePlanSidebar(); return null; }
it("opens only the focused project's plan on transitions and honors close through completion", async () => {
 const a = createTabRuntime("plan-a"); const b = createTabRuntime("plan-b");
 const sa = a.stores.get("session") as StoreApi<SessionStore>; const sb = b.stores.get("session") as StoreApi<SessionStore>; const pb = b.stores.get("planApproval") as StoreApi<PlanApprovalStore>;
 sa.setState({ cwd: "/a", sessionId: "a", planModeEnabled: true, isStreaming: true }); sb.setState({ cwd: "/b", sessionId: "b", planModeEnabled: false });
 useTabsStore.setState({ activeTabId: "plan-a", tabs: [{ id: "plan-a", cwd: "/a", status: "ready", kind: "agent", unreadDone: false }, { id: "plan-b", cwd: "/b", status: "ready", kind: "agent", unreadDone: false }] });
 const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container as unknown as Element);
 try {
  await act(async () => root.render(<SessionRuntimeProvider runtime={a}><Reveal /></SessionRuntimeProvider>));
  expect(useUiStore.getState()).toMatchObject({ panelVisible: true, panelTab: "plan" });
  await act(async () => { useUiStore.getState().togglePanel(); sa.setState({ isStreaming: false }); });
  expect(useUiStore.getState().panelVisible).toBe(false);
  await act(async () => { useTabsStore.setState({ activeTabId: "plan-b" }); root.render(<SessionRuntimeProvider runtime={b}><Reveal /></SessionRuntimeProvider>); });
  expect(useUiStore.getState().panelVisible).toBe(false);
  await act(async () => sa.setState({ isStreaming: true })); expect(useUiStore.getState().panelVisible).toBe(false);
  await act(async () => sb.setState({ planModeEnabled: true })); expect(useUiStore.getState().panelVisible).toBe(true);
  await act(async () => useUiStore.getState().togglePanel());
  await act(async () => pb.getState().showProposal({ planFilePath: "/b/plan.md", planContent: "B only", options: [] }));
  expect(useUiStore.getState()).toMatchObject({ panelVisible: true, panelTab: "plan" });
 } finally { await act(async () => root.unmount()); container.remove(); deleteSessionRuntime("plan-a"); deleteSessionRuntime("plan-b"); useTabsStore.getState().reset(); useUiStore.setState({ panelVisible: false }); }
});
