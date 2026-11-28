/**
 * Overview drawer against the live MCP snapshot: connection state and available
 * tools stay current, live work folds overflow away, and a tool-free chat tab
 * does not request Git or MCP state.
 */

import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BtwHistoryRecord, RpcResponse, SubagentSnapshot } from "../../../shared/rpc-types";
import { I18nProvider } from "../../lib/i18n";
import { useBtwStore } from "../../stores/btw";
import { useMcpStore } from "../../stores/mcp";
import { useSessionStore } from "../../stores/session";
import { useSubagentsStore } from "../../stores/subagents";
import { useTabsStore } from "../../stores/tabs";
import { useTodoStore } from "../../stores/todo";
import { useUiStore } from "../../stores/ui";
import { ExtensionSettingsPage } from "./ExtensionsPanel";
import { OverviewPanel } from "./OverviewPanel";

const { document, window, Event, HTMLElement, Element, Node } = parseHTML("<html><body></body></html>");
Object.assign(globalThis as Record<string, unknown>, {
	document,
	window,
	Event,
	HTMLElement,
	Element,
	Node,
	IS_REACT_ACT_ENVIRONMENT: true,
});

const ok = (command: string, data: unknown): RpcResponse => ({ type: "response", command, success: true, data });

const rpc = {
	getContextReport: vi.fn(async () => ok("get_context_report", { contextWindow: 0, model: "" })),
	getSettings: vi.fn(async () => ok("get_settings", { values: {} })),
	getGitStatus: vi.fn(async () =>
		ok("get_git_status", { isRepo: true, branch: "main", staged: 0, unstaged: 0, untracked: 0 }),
	),
	getGitChanges: vi.fn(async () => ok("get_git_changes", { isRepo: true, files: [] })),
	getMcpServers: vi.fn(async () =>
		ok("get_mcp_servers", {
			servers: [
				{
					name: "github",
					transport: "http",
					status: "connected",
					toolCount: 12,
					enabled: true,
					authed: true,
					lastError: "Old failure",
					authState: "required",
				},
				{
					name: "slack",
					transport: "http",
					status: "disconnected",
					toolCount: 0,
					enabled: true,
					authed: false,
					lastError: "401 Unauthorized",
				},
				{ name: "local", transport: "stdio", status: "disconnected", toolCount: 0, enabled: false, authed: false },
			],
		}),
	),
};
const configListeners = new Set<() => void>();
(window as unknown as Record<string, unknown>).omp = {
	rpc,
	events: {
		onConfigUpdate: (callback: () => void) => {
			configListeners.add(callback);
			return () => configListeners.delete(callback);
		},
	},
};

let container: InstanceType<typeof HTMLElement>;
let root: Root;

async function mount(kind: "agent" | "chat", settings = false): Promise<void> {
	useTabsStore.setState({
		tabs: [{ id: "t0", cwd: "/work", status: "ready", kind, unreadDone: false }],
		activeTabId: "t0",
		bundles: new Map(),
	});
	useSessionStore.setState({ status: "ready", cwd: "/Users/someone/work", sessionId: "s1" });
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container as unknown as Element);
	await act(async () => {
		root.render(
			<I18nProvider>
				<OverviewPanel />
				{settings && <ExtensionSettingsPage tabId="mcp" query="" />}
			</I18nProvider>,
		);
	});
	await act(async () => {
		await Promise.resolve();
		await Promise.resolve();
	});
}

const card = (name: string) => container.querySelector(`section[aria-label="${name}"]`);
const rows = (name: string) => [...(card(name)?.querySelectorAll("li") ?? [])].map(row => row.textContent);

function agent(id: string, index: number, status: string): SubagentSnapshot {
	return { id, index, agent: "explore", description: `task ${id}`, status, lastUpdate: 1 };
}

afterEach(async () => {
	await act(async () => root?.unmount());
	container?.remove();
	vi.clearAllMocks();
	rpc.getMcpServers.mockReset();
	useTabsStore.getState().reset();
	useSessionStore.getState().reset();
	useMcpStore.getState().reset();
	useSubagentsStore.getState().reset();
	useTodoStore.getState().reset();
	useBtwStore.getState().reset();
	useUiStore.setState({ panelTab: "overview", panelVisible: false, settingsOpen: false, settingsTab: "gui" });
	vi.useRealTimers();
});

describe("OverviewPanel", () => {
	it("shows live connections instead of stale errors and omits the removed Changes card", async () => {
		await mount("agent");
		expect(card("Changes")).toBeNull();
		expect(rpc.getGitChanges).not.toHaveBeenCalled();
		expect(rows("MCP servers")).toEqual(["github12 toolsConnected", "slackError", "localOff"]);
	});

	it("keeps all MCP rows and error details available when the list overflows", async () => {
		const servers = Array.from({ length: 24 }, (_, index) => ({
			name: `server-${index}`,
			transport: "http",
			status: index === 23 ? "disconnected" : "connected",
			toolCount: index + 1,
			enabled: true,
			authed: true,
			...(index === 23 ? { lastError: "Please enable workspace research for server-23" } : {}),
		}));
		rpc.getMcpServers.mockResolvedValueOnce(ok("get_mcp_servers", { servers }));
		await mount("agent");
		expect(rows("MCP servers")).toHaveLength(24);
		expect(rows("MCP servers")[23]).toBe("server-23Error");
		expect(card("MCP servers")?.querySelectorAll("li")[23]?.getAttribute("title")).toBe(
			"Please enable workspace research for server-23",
		);
	});

	it("keeps Overview and Settings synchronized through disconnects, read failures, and recovery", async () => {
		vi.useFakeTimers();
		await mount("agent", true);
		expect(rpc.getMcpServers).toHaveBeenCalledTimes(1);
		const configured = card("Configured servers");
		expect(configured?.textContent).toContain("12 tools");
		rpc.getMcpServers.mockResolvedValue(
			ok("get_mcp_servers", {
				servers: [
					{
						name: "github",
						transport: "http",
						status: "disconnected",
						toolCount: 283,
						enabled: true,
						authed: true,
					},
				],
			}),
		);
		await act(async () => {
			for (const listener of configListeners) listener();
		});
		expect(rows("MCP servers")).toEqual(["githubDisconnected"]);
		expect(configured?.textContent).toContain("0 tools");
		expect(configured?.textContent).not.toContain("283 tools");
		rpc.getMcpServers.mockRejectedValue(new Error("Read failed"));
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1000);
		});
		expect(card("MCP servers")?.textContent).toContain("Could not load MCP servers");
		expect(configured?.textContent).not.toContain("Connected");
		rpc.getMcpServers.mockReset();
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1000);
		});
		expect(rows("MCP servers")[0]).toBe("github12 toolsConnected");
		expect(configured?.textContent).toContain("12 tools");
	});

	it("opens separate Settings targets for Plugins and MCP", async () => {
		await mount("agent");
		const managePlugins = [...(card("Plugins")?.querySelectorAll("button") ?? [])].find(
			button => button.textContent === "Manage Plugins",
		);
		const manageMcp = [...(card("MCP servers")?.querySelectorAll("button") ?? [])].find(
			button => button.textContent === "Manage MCP",
		);
		expect(managePlugins).toBeDefined();
		expect(manageMcp).toBeDefined();
		await act(async () => managePlugins?.click());
		expect(useUiStore.getState()).toMatchObject({ settingsOpen: true, settingsTab: "resources:catalog" });
		await act(async () => manageMcp?.click());
		expect(useUiStore.getState()).toMatchObject({ settingsOpen: true, settingsTab: "mcp" });
	});

	it("leaves the git and MCP cards out of a tool-free chat tab without reading them", async () => {
		await mount("chat");

		const titles = [...container.querySelectorAll("section")].map(section => section.getAttribute("aria-label"));
		expect(titles).toEqual(["Context", "Workspace", "Running"]);
		expect(rpc.getGitChanges).not.toHaveBeenCalled();
		expect(rpc.getGitStatus).not.toHaveBeenCalled();
		expect(rpc.getMcpServers).not.toHaveBeenCalled();
	});

	it("counts live work, folds extra subagents away, and opens a running side question", async () => {
		useSubagentsStore.setState({
			subagents: new Map(
				["a", "b", "c", "d"]
					.map((id, index) => agent(id, index, "running"))
					.concat(agent("done", 9, "completed"))
					.map(snapshot => [snapshot.id, snapshot]),
			),
		});
		useTodoStore.getState().setPhases([
			{
				name: "Build",
				tasks: [
					{ content: "Write the store", status: "completed" },
					{ content: "Render the cards", status: "in_progress" },
					{ content: "Ship it", status: "pending" },
				],
			},
		]);
		const running: BtwHistoryRecord = {
			id: "q1",
			leafId: null,
			question: "why is the sky blue?",
			answer: "",
			status: "running",
			createdAt: 1,
			updatedAt: 1,
		};
		useBtwStore.setState({ records: [running] });
		await mount("chat");

		const text = card("Running")?.textContent ?? "";
		expect(text).toContain("4 subagents running");
		expect(text).toContain("+1 more");
		expect(text).not.toContain("task done");
		expect(text).toContain("Todos 1/3 done");
		expect(text).toContain("Render the cards");

		const question = [...(card("Running")?.querySelectorAll("button") ?? [])].find(b =>
			b.textContent?.includes("why is the sky blue?"),
		);
		await act(async () => question?.click());
		expect(useUiStore.getState()).toMatchObject({ panelTab: "btw", panelVisible: true });
		expect(useBtwStore.getState().selectedId).toBe("q1");
	});
});
