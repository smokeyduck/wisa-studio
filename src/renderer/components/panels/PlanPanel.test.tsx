import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../lib/i18n";
import { streamingPlanContent } from "../../lib/plan-tool";
import { useSessionStore } from "../../stores/session";
import { useTabsStore } from "../../stores/tabs";
import { useToolsStore, type ToolEntry } from "../../stores/tools";
import { PlanPanel } from "./PlanPanel";

const { document, window, Event, HTMLElement, Element: DomElement, Node } = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { document, window, Event, HTMLElement, Element: DomElement, Node, IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(globalThis, { requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0) });
let root: Root | undefined;
let container: HTMLElement | undefined;
const entry = (streamingArgs: string): ToolEntry => ({ toolName: "write", args: {}, streamingArgs, status: "pending", partialResult: null, result: null, isError: false, startTime: Date.now(), endTime: null });

afterEach(async () => {
 if (root) await act(async () => root?.unmount());
 root = undefined; container?.remove(); useSessionStore.getState().reset(); useTabsStore.getState().reset(); useToolsStore.getState().reset();
});

describe("plan sidebar", () => {
 it("decodes progressive write content including incomplete escaped tails without unrelated files", () => {
  expect(streamingPlanContent(new Map([["x", entry('{"path":"propose","content":"# Plan\\nFirst')]]), null)).toBe("# Plan\nFirst");
  expect(streamingPlanContent(new Map([["x", entry('{"path":"propose","content":"A\\u12')]]), null)).toBe("A");
  expect(streamingPlanContent(new Map([["x", entry('{"path":"local://new-plan.md","content":"# Draft')]]), "local://old-plan.md")).toBe("# Draft");
  expect(streamingPlanContent(new Map([["x", entry('{"path":"other.md","content":"wrong')]]), "local://plan.md")).toBeNull();
 });
 it("renders live plan text without a modal, follows until scroll-away, resumes explicitly", async () => {
  useTabsStore.setState({ activeTabId: "plan-tab", tabs: [{ id: "plan-tab", cwd: "/project", status: "ready", unreadDone: false, kind: "agent" }] });
	const ompWindow = window as unknown as { omp: unknown };
	ompWindow.omp = { rpc: { getPlanMode: async () => ({ type: "response", command: "get_plan_mode", success: true, data: { enabled: true, planFilePath: "local://plan.md" } }) }, fs: { readPlan: async () => ({ ok: true, path: "/sessions/session/local/plan.md", content: "# Saved" }) }, events: { onTabBatch: () => () => {} } };
	useSessionStore.setState({ status: "ready", cwd: "/project", sessionId: "session", sessionFile: "/sessions/session.jsonl", planModeEnabled: true, isStreaming: true });
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container as unknown as Element);
  await act(async () => { root?.render(<I18nProvider><PlanPanel /></I18nProvider>); });
  const scroll = container.querySelector('[tabindex="0"]') as unknown as HTMLElement;
  Object.defineProperties(scroll, { scrollHeight: { configurable: true, value: 500 }, clientHeight: { configurable: true, value: 100 }, scrollTop: { configurable: true, writable: true, value: 0 } });
  await act(async () => { useToolsStore.setState({ activeTools: new Map([["write", entry('{"path":"local://plan.md","content":"# Growing\\nOne')]]) }); });
  expect(container.textContent).toContain("Growing"); expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(scroll.scrollTop).toBe(500);
  expect(container.textContent).toContain("Writing the plan");
  expect(container.querySelector("textarea")).toBeNull();
  await act(async () => { const wheel = new Event("wheel", { bubbles: true }); Object.assign(wheel, { deltaY: -10 }); scroll.dispatchEvent(wheel); scroll.scrollTop = 150; });
  await act(async () => { useToolsStore.setState({ activeTools: new Map([["write", entry('{"path":"local://plan.md","content":"# Growing\\nOne\\nTwo')]]) }); });
  expect(scroll.scrollTop).toBe(150); expect(container.textContent).toContain("Two");
  const latest = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Jump to latest"));
  expect(latest).toBeDefined(); await act(async () => { latest?.dispatchEvent(new Event("click", { bubbles: true })); }); expect(scroll.scrollTop).toBe(500);
 });
 it("queues a file invalidation received while the initial read is in flight", async () => {
  useTabsStore.setState({ activeTabId: "plan-tab", tabs: [{ id: "plan-tab", cwd: "D:/project", status: "ready", unreadDone: false, kind: "agent" }] });
  useSessionStore.setState({ status: "ready", cwd: "D:/project", sessionId: "session", planModeEnabled: true });
  const first = Promise.withResolvers<{ ok: true; path: string; content: string }>();
  const readPlan = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ ok: true, path: "D:/project/plan.md", content: "# Current plan" });
  let onBatch: (events: object[], tabId: string) => void = () => {};
  const ompWindow = window as unknown as { omp: unknown };
  ompWindow.omp = {
   rpc: { getPlanMode: async () => ({ success: true, data: { enabled: true, planFilePath: "D:/project/plan.md" } }) },
   fs: { readPlan }, events: { onTabBatch: (listener: typeof onBatch) => { onBatch = listener; return () => {}; } },
  };
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container as unknown as Element);
  await act(async () => { root?.render(<I18nProvider><PlanPanel /></I18nProvider>); });
  expect(readPlan).toHaveBeenCalledWith({ fsPath: "D:/project/plan.md", localRoot: null, tabId: "plan-tab" });
  await act(async () => {
   onBatch([{ type: "tool_execution_end", toolName: "write" }], "plan-tab");
   first.resolve({ ok: true, path: "D:/project/plan.md", content: "# Old plan" });
  });
  expect(container.textContent).toContain("Current plan");
  expect(container.textContent).not.toContain("Old plan");
 });
});
