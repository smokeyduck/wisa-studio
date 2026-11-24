/** Transcript subagent block, scoped dialog, and stream-time polling. */
import { parseHTML } from "linkedom";
import { act, type ReactElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import type { AgentProgress, RpcCommand, RpcResponse, SubagentSnapshot } from "../../../../shared/rpc-types";
import { I18nProvider } from "../../../lib/i18n";
import { resetTabRoute } from "../../../lib/tab-routing";
import { type SessionStore, useSessionStore } from "../../../stores/session";
import {
	deleteSessionRuntime,
	SessionRuntimeProvider,
	sessionRuntimeStore,
	setFocusedSessionRuntime,
} from "../../../stores/session-runtime-context";
import { useSettingsStore } from "../../../stores/settings";
import { type SubagentsStore, useSubagentsStore } from "../../../stores/subagents";
import { useTabsStore } from "../../../stores/tabs";
import { createTabRuntime } from "../../../stores/tab-runtime";

const { document, window, Event, HTMLElement, Node } = parseHTML("<html><body></body></html>");
const globals = globalThis as Record<string, unknown>;
globals.document = document;
globals.window = window;
globals.Event = Event;
globals.HTMLElement = HTMLElement;
globals.Node = Node;
globals.IS_REACT_ACT_ENVIRONMENT = true;
globals.requestAnimationFrame = (callback: () => void) => setTimeout(callback, 0);

// Deferred until after the globals above: react-dom computes DOM support
// flags at evaluation time.
const { createRoot } = await import("react-dom/client");
const { SubagentTranscriptBlock } = await import("./AgentsDockCard");
const { WorkspaceDock } = await import("./WorkspaceDock");

const getSubagents: Mock = vi.fn(async () => ({
	type: "response",
	command: "get_subagents",
	success: true,
	data: { subagents: [] },
}));
const commandForTab = vi.fn(async (tabId: string, command: RpcCommand): Promise<RpcResponse> => ({
	type: "response",
	command: command.type,
	success: true,
	data: { messages: [{ role: "assistant", content: `Transcript from ${tabId}` }] },
}));
const ompWindow = window as unknown as { omp: { rpc: { getSubagents: Mock; commandForTab?: typeof commandForTab } } };
ompWindow.omp = { rpc: { getSubagents } };

function snap(overrides: Partial<SubagentSnapshot>): SubagentSnapshot {
	return { id: "a1", index: 1, agent: "scout", status: "running", lastUpdate: Date.now(), ...overrides };
}

function progress(overrides: Partial<AgentProgress>): AgentProgress {
	return {
		index: 1,
		id: "a1",
		agent: "scout",
		agentSource: "bundled",
		status: "running",
		task: "audit",
		recentTools: [],
		recentOutput: [],
		toolCount: 0,
		requests: 1,
		tokens: 12_345,
		cost: 0.4321,
		durationMs: 60_000,
		...overrides,
	};
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
	deleteSessionRuntime("tab-foreground");
	deleteSessionRuntime("tab-background");
	setFocusedSessionRuntime(null);
	commandForTab.mockClear();
	delete ompWindow.omp.rpc.commandForTab;
});

function containerText(): string {
	return container.textContent ?? "";
}

describe("SubagentTranscriptBlock", () => {
	it("renders nothing when the session has no agents or display.pinnedAgents is off", async () => {
		await mount(<SubagentTranscriptBlock dialogHost={null} />);
		expect(containerText()).toBe("");
		await act(async () => {
			useSettingsStore.setState({ pinnedAgents: "off" });
			useSubagentsStore.getState().setSnapshots([snap({ agent: "Hidden worker" })]);
		});
		expect(containerText()).toBe("");
	});

	it("leaves only active cards in the transcript without deleting sidebar history", async () => {
		const running = snap({ agent: "scout", progress: progress({ resolvedModel: "openai-codex/gpt-5.6-sol:max" }) });
		const done = snap({ id: "a2", index: 2, agent: "reviewer", status: "completed" });
		const failed = snap({ id: "a3", index: 3, agent: "builder", status: "failed" });
		const stale = snap({ id: "a4", index: 4, agent: "stale worker", live: false });
		useSubagentsStore.getState().setSnapshots([running, done, failed, stale]);
		await mount(<SubagentTranscriptBlock dialogHost={null} />);
		expect(container.querySelectorAll('[aria-haspopup="dialog"]')).toHaveLength(1);
		expect(containerText()).toContain("openai-codex/gpt-5.6-sol:max");
		expect(containerText()).toContain("12.3k tokens");
		expect(containerText()).toContain("$0.4321");
		await act(async () => {
			useSubagentsStore.getState().setSnapshots([{ ...running, status: "completed" }, done, failed, stale]);
		});
		expect(containerText()).toBe("");
		expect(useSubagentsStore.getState().subagents.get(running.id)?.status).toBe("completed");
		expect(useSubagentsStore.getState().subagents.get(failed.id)?.status).toBe("failed");
	});

	it("loads the clicked row’s transcript from its owning tab and centers it in that chat host", async () => {
		const active = createTabRuntime("tab-foreground");
		const background = createTabRuntime("tab-background");
		setFocusedSessionRuntime(active.tabId);
		sessionRuntimeStore<SubagentsStore>(active.tabId, "subagents")?.getState().setSnapshots([snap({ agent: "Foreground" })]);
		sessionRuntimeStore<SubagentsStore>(background.tabId, "subagents")?.getState().setSnapshots([snap({ agent: "Background" })]);
		ompWindow.omp.rpc.commandForTab = commandForTab;
		const host = document.createElement("div") as unknown as HTMLDivElement;
		document.body.appendChild(host as never);
		try {
			await mount(<SessionRuntimeProvider runtime={background}><SubagentTranscriptBlock dialogHost={host} /></SessionRuntimeProvider>);
			expect(containerText()).toContain("Background");
			expect(containerText()).not.toContain("Foreground");
			const row = container.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]');
			if (!row) throw new Error("missing agent row");
			await act(async () => row.click());
			expect(host.querySelector('[role="dialog"]')?.textContent).toContain("Transcript from tab-background");
			expect(commandForTab).toHaveBeenCalledWith("tab-background", expect.objectContaining({ type: "get_subagent_messages" }), undefined);
			const close = host.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
			if (!close) throw new Error("missing transcript dialog close button");
			await act(async () => close.click());
			expect(host.querySelector('[role="dialog"]')).toBeNull();
			await act(async () => row.click());
			expect(host.querySelector('[role="dialog"]')).not.toBeNull();
			await act(async () => {
				sessionRuntimeStore<SessionStore>(background.tabId, "session")?.setState({ sessionId: "replacement" });
			});
			expect(host.querySelector('[role="dialog"]')).toBeNull();
		} finally {
			host.remove();
		}
	});

	it("renders each active subagent as a separate card, including beyond five agents", async () => {
		useSubagentsStore
			.getState()
			.setSnapshots(Array.from({ length: 8 }, (_, index) => snap({ id: `row-${index}`, index: index + 1 })));
		await mount(<SubagentTranscriptBlock dialogHost={null} />);
		const buttons = [...container.querySelectorAll('[aria-haspopup="dialog"]')];
		expect(buttons).toHaveLength(8);
		expect(buttons.every(button => button.parentElement?.parentElement === container)).toBe(true);
	});

	it("polls get_subagents while streaming independently of the transcript block and stops when the turn ends", async () => {
		// Real timers + a short injected cadence: vi.useFakeTimers/advanceTimers
		// are vitest-only, and this file must also pass under `bun test`.
		const sleep = (ms: number) => {
			const { promise, resolve } = Promise.withResolvers<void>();
			setTimeout(resolve, ms);
			return promise;
		};
		// A frame-less park must still reach the sidebar and drawer with the block off.
		useSettingsStore.setState({ pinnedAgents: "off" });
		useSubagentsStore.getState().setSnapshots([snap({ id: "a1", status: "running" })]);
		activateTab();
		useSessionStore.setState({ isStreaming: true });
		container = document.createElement("div") as unknown as HTMLElement;
		document.body.appendChild(container as never);
		root = createRoot(container as unknown as Element);
		await act(async () => {
			root.render(
				<I18nProvider>
					<WorkspaceDock pollMs={25} />
				</I18nProvider>,
			);
		});
		expect(container.querySelector('section[aria-label="Agents"]')).toBeNull();
		expect(getSubagents).not.toHaveBeenCalled();

		await act(async () => {
			await sleep(60);
		});
		expect(getSubagents.mock.calls.length).toBeGreaterThanOrEqual(1);

		// Turn ends → interval cleared, no further polls.
		await act(async () => {
			useSessionStore.setState({ isStreaming: false });
		});
		const callsAtStop = getSubagents.mock.calls.length;
		await act(async () => {
			await sleep(60);
		});
		expect(getSubagents.mock.calls.length).toBe(callsAtStop);
	});
});
