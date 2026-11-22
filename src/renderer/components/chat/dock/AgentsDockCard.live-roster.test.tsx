/**
 * AgentsDockCard live roster: the dock lists only agents doing current work.
 * Idle, parked and finished rows drop out regardless of age or `live` flag;
 * running and pending rows stay; a terminal frame removes its row at once;
 * a fresh get_subagents poll that omits a live row releases it. The store
 * keeps every row as history.
 */
import { parseHTML } from "linkedom";
import { act, type ReactElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import type { SubagentSnapshot } from "../../../../shared/rpc-types";
import { I18nProvider } from "../../../lib/i18n";
import { resetTabRoute } from "../../../lib/tab-routing";
import { useSessionStore } from "../../../stores/session";
import { useSettingsStore } from "../../../stores/settings";
import { useSubagentsStore } from "../../../stores/subagents";
import { useTabsStore } from "../../../stores/tabs";
import { useUiStore } from "../../../stores/ui";

const { document, window, Event, HTMLElement, Node } = parseHTML("<html><body></body></html>");
const globals = globalThis as Record<string, unknown>;
globals.document = document;
globals.window = window;
globals.Event = Event;
globals.HTMLElement = HTMLElement;
globals.Node = Node;
globals.IS_REACT_ACT_ENVIRONMENT = true;
globals.requestAnimationFrame = (callback: () => void) => setTimeout(callback, 0);

// Dynamic imports on purpose: react-dom and the component read DOM globals at
// evaluation time, so they must load after the linkedom globals above.
const { createRoot } = await import("react-dom/client");
const { AgentsDockCard } = await import("./AgentsDockCard");

const getSubagents: Mock = vi.fn(async () => ({
	type: "response",
	command: "get_subagents",
	success: true,
	data: { subagents: [] },
}));
const ompWindow = window as unknown as { omp: { rpc: { getSubagents: Mock } } };
ompWindow.omp = { rpc: { getSubagents } };

const HOUR_MS = 3_600_000;

function snap(overrides: Partial<SubagentSnapshot>): SubagentSnapshot {
	return { id: "a1", index: 1, agent: "scout", status: "running", lastUpdate: Date.now(), ...overrides };
}

let container: HTMLElement;
let root: Root;

async function flush(): Promise<void> {
	await act(async () => {
		const { promise, resolve } = Promise.withResolvers<void>();
		setTimeout(resolve, 0);
		await promise;
	});
}

function activateTab(): void {
	useTabsStore.setState({
		tabs: [{ id: "t1", cwd: "/w", status: "ready", kind: "agent", unreadDone: false }],
		activeTabId: "t1",
		bundles: new Map(),
	});
	useSessionStore.setState({ sessionId: "s1" });
	resetTabRoute();
}

async function mount(element: ReactElement): Promise<void> {
	activateTab();
	container = document.createElement("div") as unknown as HTMLElement;
	document.body.appendChild(container as never);
	root = createRoot(container as unknown as Element);
	await act(async () => {
		root.render(<I18nProvider>{element}</I18nProvider>);
	});
	await flush();
}

afterEach(async () => {
	if (root) {
		await act(async () => {
			root.unmount();
		});
	}
	container?.remove();
	getSubagents.mockClear();
	useSubagentsStore.getState().reset();
	useSettingsStore.getState().reset();
	useSessionStore.setState({ isStreaming: false });
	useTabsStore.getState().reset();
	resetTabRoute();
	useUiStore.setState({ dockCollapsed: {}, dockFocus: null });
});

function treeItems(): Element[] {
	return [...container.querySelectorAll('[role="treeitem"]')];
}

function countText(): string {
	return container.querySelector('section[aria-label="Agents"]')?.textContent ?? "";
}

/** Earlier task call, over: completed, failed, and a run the sidecar marked not live. */
function earlierBatch(): SubagentSnapshot[] {
	return [
		snap({ id: "old1", index: 1, status: "completed", agent: "earlier", parentToolCallId: "call_1" }),
		snap({ id: "old2", index: 2, status: "failed", agent: "earlier", parentToolCallId: "call_1" }),
		snap({
			id: "old3",
			index: 3,
			status: "running",
			live: false,
			agent: "earlier",
			parentToolCallId: "call_1",
			lastUpdate: Date.now() - 37 * HOUR_MS,
		}),
	];
}

describe("AgentsDockCard live roster", () => {
	it("lists only the two running agents among six idle/parked rows and the earlier batch", async () => {
		const ancient = Date.now() - 37 * HOUR_MS;
		useSubagentsStore.getState().setSnapshots([
			...earlierBatch(),
			// Old reusable workers: idle or parked, live undefined / false / true. None is doing work.
			snap({ id: "i1", index: 4, status: "idle", parentToolCallId: "call_2", lastUpdate: ancient }),
			snap({ id: "i2", index: 5, status: "idle", live: false, parentToolCallId: "call_2", lastUpdate: ancient }),
			snap({ id: "i3", index: 6, status: "idle", live: true, parentToolCallId: "call_2", lastUpdate: ancient }),
			snap({ id: "p1", index: 7, status: "parked", parentToolCallId: "call_2", lastUpdate: ancient }),
			snap({ id: "p2", index: 8, status: "parked", live: false, parentToolCallId: "call_2", lastUpdate: ancient }),
			snap({ id: "p3", index: 9, status: "parked", live: true, parentToolCallId: "call_2", lastUpdate: ancient }),
			// Current work: running for a long time, but still running.
			snap({
				id: "a1",
				index: 10,
				agent: "builder",
				status: "running",
				parentToolCallId: "call_3",
				progress: { durationMs: 37 * HOUR_MS } as never,
				lastUpdate: Date.now(),
			}),
			snap({ id: "a2", index: 11, agent: "tester", status: "running", live: true, parentToolCallId: "call_3" }),
		]);
		await mount(<AgentsDockCard />);

		expect(treeItems()).toHaveLength(2);
		expect(countText()).toContain("2/2");
		expect(countText()).not.toContain("earlier");
		expect(countText()).toContain("builder");
		expect(countText()).toContain("tester");
		// Store keeps every row as history; only the dock hides them.
		expect(useSubagentsStore.getState().subagents.size).toBe(11);
	});

	it("removes a row at once when its terminal lifecycle frame arrives in the same batch", async () => {
		useSubagentsStore
			.getState()
			.setSnapshots([
				snap({ id: "a1", index: 1, agent: "builder", parentToolCallId: "call_2" }),
				snap({ id: "a2", index: 2, agent: "tester", parentToolCallId: "call_2" }),
			]);
		await mount(<AgentsDockCard />);
		expect(treeItems()).toHaveLength(2);

		await act(async () => {
			useSubagentsStore.getState().applyFrame({
				type: "subagent_lifecycle",
				payload: { id: "a1", index: 1, agent: "builder", status: "completed", parentToolCallId: "call_2" },
			} as never);
		});
		await flush();

		expect(treeItems()).toHaveLength(1);
		expect(countText()).toContain("1/1");
		expect(countText()).not.toContain("builder");
		expect(useSubagentsStore.getState().subagents.get("a1")?.status).toBe("completed");
	});

	it("hides the card once the last running agent finishes", async () => {
		useSubagentsStore.getState().setSnapshots([snap({ id: "a1", index: 1, parentToolCallId: "call_2" })]);
		await mount(<AgentsDockCard />);
		expect(treeItems()).toHaveLength(1);

		await act(async () => {
			useSubagentsStore.getState().applyFrame({
				type: "subagent_lifecycle",
				payload: { id: "a1", index: 1, agent: "scout", status: "completed", parentToolCallId: "call_2" },
			} as never);
		});
		await flush();

		expect(container.querySelector('section[aria-label="Agents"]')).toBeNull();
	});

	it("keeps a finished parent as context for its running child, without counting it", async () => {
		useSubagentsStore
			.getState()
			.setSnapshots([
				...earlierBatch(),
				snap({ id: "p1", index: 4, agent: "planner", status: "completed", parentToolCallId: "call_2" }),
				snap({ id: "c1", index: 5, agent: "worker", parentSubagentId: "p1", parentToolCallId: "call_2" }),
			]);
		await mount(<AgentsDockCard />);

		expect(treeItems()).toHaveLength(2);
		expect(countText()).toContain("1/1");
		expect(countText()).toContain("planner");
		expect(countText()).toContain("worker");
		expect(countText()).not.toContain("earlier");
	});

	it("releases a live row that a fresh get_subagents poll omits, and keeps finished history", async () => {
		useSubagentsStore
			.getState()
			.setSnapshots([
				snap({ id: "old1", index: 1, status: "completed", agent: "earlier", parentToolCallId: "call_1" }),
				snap({ id: "a1", index: 2, agent: "builder", parentToolCallId: "call_2" }),
			]);
		await mount(<AgentsDockCard />);
		expect(treeItems()).toHaveLength(1);

		getSubagents.mockResolvedValueOnce({
			type: "response",
			command: "get_subagents",
			success: true,
			data: { subagents: [] },
		});
		await act(async () => {
			await useSubagentsStore.getState().refresh();
		});
		await flush();

		expect(container.querySelector('section[aria-label="Agents"]')).toBeNull();
		expect(useSubagentsStore.getState().subagents.has("old1")).toBe(true);
	});
});
