import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentMessage, RpcCommand, RpcResponse } from "../../../shared/rpc-types";
import { I18nProvider, translate } from "../../lib/i18n";
import { type MessagesStore, useMessagesStore } from "../../stores/messages";
import { type SessionStore, useSessionStore } from "../../stores/session";
import {
	SessionRuntimeProvider,
	sessionRuntimeStore,
	setFocusedSessionRuntime,
} from "../../stores/session-runtime-context";
import { createTabRuntime } from "../../stores/tab-runtime";
import { useTabsStore } from "../../stores/tabs";
import { activeWorkspacePage, useUiStore } from "../../stores/ui";
import { useWorkspaceMode } from "../../stores/workspace-mode";
import { ModesPanel } from "../panels/ModesPanel";
import { ChatStream } from "./ChatStream";
import { ReadOnlyTranscriptContext } from "./transcript-mode";

const {
	document,
	window,
	Event,
	CustomEvent,
	HTMLElement,
	Element: DomElement,
	Node,
} = parseHTML("<html><body></body></html>");
Object.assign(globalThis, {
	document,
	window,
	Event,
	CustomEvent,
	HTMLElement,
	Element: DomElement,
	Node,
	IS_REACT_ACT_ENVIRONMENT: true,
	requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0),
	cancelAnimationFrame: clearTimeout,
});
Object.defineProperty(window, "getComputedStyle", { value: () => ({ overflow: "auto", overflowY: "auto" }) });
let root: Root | undefined;
let container: HTMLElement | undefined;
const bridge = window as unknown as { omp: unknown };
bridge.omp = { sidecar: { defaultWorkspace: async () => "/work" }, events: { onBatch: () => () => {} } };

afterEach(async () => {
	if (root) await act(async () => root?.unmount());
	root = undefined;
	container?.remove();
	useMessagesStore.getState().reset();
	useSessionStore.getState().reset();
	useTabsStore.getState().reset();
	useUiStore.setState({ modesOpen: false, workspacePage: null });
});
async function mount(element: React.ReactNode) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container as unknown as Element);
	await act(async () => {
		root?.render(<I18nProvider>{element}</I18nProvider>);
	});
}

/** Each starter card in the three empty-state lanes, with its localized title and prompt keys. */
const LANES = [
	{
		kind: "agent",
		cwd: "/project",
		cards: [
			["chat.starter.understand.title", "chat.starter.understand.prompt"],
			["chat.starter.fix.title", "chat.starter.fix.prompt"],
			["chat.starter.build.title", "chat.starter.build.prompt"],
			["chat.starter.review.title", "chat.starter.review.prompt"],
		],
	},
	{
		kind: "chat",
		cwd: "/project",
		cards: [
			["chat.starter.explain.title", "chat.starter.explain.prompt"],
			["chat.starter.draft.title", "chat.starter.draft.prompt"],
			["chat.starter.brainstorm.title", "chat.starter.brainstorm.prompt"],
			["chat.starter.translate.title", "chat.starter.translate.prompt"],
		],
	},
	{
		kind: "work",
		cwd: "/work",
		cards: [
			["chat.starter.write.title", "chat.starter.write.prompt"],
			["chat.starter.plan.title", "chat.starter.plan.prompt"],
			["chat.starter.research.title", "chat.starter.research.prompt"],
			["chat.starter.analyze.title", "chat.starter.analyze.prompt"],
		],
	},
] as const;

describe("compact quick setup surfaces", () => {
	it.each(
		LANES.flatMap(lane =>
			lane.cards.map(([titleKey, promptKey], index) => ({
				lane: lane.kind,
				cwd: lane.cwd,
				index,
				titleKey,
				promptKey,
			})),
		),
	)(
		"$lane starter $index opens its modal with its own prompt, stages it for its tab, and closes",
		async ({ lane, cwd, index, promptKey }) => {
			useWorkspaceMode.setState({ defaultWorkspace: "/work" });
			setFocusedSessionRuntime("quick");
			useTabsStore.setState({
				tabs: [{ id: "quick", cwd, status: "ready", kind: lane === "chat" ? "chat" : "agent", unreadDone: false }],
				activeTabId: "quick",
			});
			useSessionStore.setState({ status: "ready", cwd, sessionId: "quick-session" });
			await mount(<ChatStream />);
			const card = document.querySelectorAll<HTMLButtonElement>(".omp-starter-card")[index];
			expect(card).toBeDefined();
			const staged: { text: string; tabId?: string }[] = [];
			const capture = (event: Event) => {
				staged.push((event as CustomEvent<{ text: string; tabId?: string }>).detail);
			};
			window.addEventListener("omp:fill-composer", capture);
			try {
				await act(async () => {
					card?.dispatchEvent(new Event("click", { bubbles: true }));
				});
				const dialogs = document.querySelectorAll('[role="dialog"]');
				expect(dialogs).toHaveLength(1);
				expect(document.querySelector("[data-workspace-page]")).toBeNull();
				const textarea = dialogs[0]?.querySelector("textarea") as unknown as { value: string } | null;
				expect(textarea?.value).toBe(translate(promptKey));
				const form = dialogs[0]?.querySelector("form");
				await act(async () => {
					form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
				});
				expect(staged).toEqual([{ text: translate(promptKey), tabId: "quick" }]);
				expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
			} finally {
				window.removeEventListener("omp:fill-composer", capture);
			}
		},
	);

	it("Cancel closes the starter modal and stages nothing into the composer", async () => {
		useTabsStore.setState({
			tabs: [{ id: "quick", cwd: "/project", status: "ready", kind: "agent", unreadDone: false }],
			activeTabId: "quick",
		});
		useSessionStore.setState({ status: "ready", cwd: "/project", sessionId: "quick-session" });
		await mount(<ChatStream />);
		const staged: unknown[] = [];
		const capture = (event: Event) => {
			staged.push((event as CustomEvent).detail);
		};
		window.addEventListener("omp:fill-composer", capture);
		try {
			await act(async () => {
				document
					.querySelector<HTMLButtonElement>(".omp-starter-card")
					?.dispatchEvent(new Event("click", { bubbles: true }));
			});
			const cancel = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
				button => button.textContent?.trim() === translate("common.cancel"),
			);
			await act(async () => {
				cancel?.dispatchEvent(new Event("click", { bubbles: true }));
			});
			expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
			expect(staged).toEqual([]);
		} finally {
			window.removeEventListener("omp:fill-composer", capture);
		}
	});

	it.each(["vibe", "goal", "loop"] as const)("keeps %s quick setup centered, not a workspace page", async tab => {
		useUiStore.getState().openModes(tab);
		expect(activeWorkspacePage(useUiStore.getState())).toBeNull();
		await mount(<ModesPanel open onClose={() => {}} initialTab={tab} />);
		expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
		expect(document.querySelector(".omp-dialog-size-md")).not.toBeNull();
	});
});

describe("older transcript history", () => {
	it("requests one boundary per click at most three times, without replacing the live transcript", async () => {
		const runtime = createTabRuntime("older-history");
		const session = sessionRuntimeStore<SessionStore>(runtime.tabId, "session")!;
		const messages = sessionRuntimeStore<MessagesStore>(runtime.tabId, "messages")!;
		const late = Promise.withResolvers<RpcResponse>();
		const commandForTab = vi.fn(async (_tabId: string, command: RpcCommand): Promise<RpcResponse> => {
			if (command.type !== "get_transcript_page" || !command.archive) throw new Error("Unexpected archive command");
			if (command.archive.boundaryId === "second-boundary") return late.promise;
			const depth = command.archive.depth;
			return {
				type: "response",
				command: command.type,
				success: true,
				data: {
					messages: [{ role: "user", entryId: `older-${depth}`, content: `Old ${depth}`, timestamp: depth }],
					totalMessages: 1,
					hasOlder: true,
				},
			};
		});
		const savedBridge = bridge.omp;
		bridge.omp = {
			...(savedBridge as object),
			rpc: {
				commandForTab: (tabId: string, command: RpcCommand) =>
					command.type === "get_queue"
						? Promise.resolve({
								type: "response",
								command: command.type,
								success: true,
								data: { steering: [], followUp: [] },
							})
						: commandForTab(tabId, command),
			},
		};
		useTabsStore.setState({
			tabs: [{ id: runtime.tabId, cwd: "/project", status: "ready", kind: "agent", unreadDone: false }],
			activeTabId: runtime.tabId,
		});
		session.setState({ status: "ready", sessionId: "session-with-archive" });
		const live: AgentMessage[] = [
			{
				role: "compactionSummary",
				entryId: "handoff-boundary",
				summary: "Handoff",
				method: "handoff",
				tokensBefore: 10,
				timestamp: 5,
			},
			{ role: "user", entryId: "live-user", content: "Latest", timestamp: 6 },
		];
		messages.setState({ messages: live });
		const action = (key: string) =>
			[...document.querySelectorAll<HTMLButtonElement>("button")].find(
				button => button.textContent?.trim() === translate(key),
			);
		const click = async (key: string) => {
			const button = action(key);
			expect(button).toBeDefined();
			await act(async () => {
				button?.dispatchEvent(new Event("click", { bubbles: true }));
			});
		};
		try {
			await mount(
				<SessionRuntimeProvider runtime={runtime}>
					<ChatStream />
				</SessionRuntimeProvider>,
			);
			expect(commandForTab).not.toHaveBeenCalled();
			await click("chat.olderHistory.open");
			await click("chat.olderHistory.more");
			await click("chat.olderHistory.more");
			expect(action("chat.olderHistory.more")?.getAttribute("aria-disabled")).toBe("true");
			await click("chat.olderHistory.more");
			expect(
				commandForTab.mock.calls.map(
					([, command]) => command.type === "get_transcript_page" && command.archive?.depth,
				),
			).toEqual([0, 1, 2]);
			expect(messages.getState().messages).toBe(live);

			await act(async () => {
				messages.setState({ messages: [{ ...live[0], entryId: "second-boundary", method: "soft" }, live[1]] });
			});
			await click("chat.olderHistory.open");
			expect(commandForTab).toHaveBeenCalledTimes(4);
			await act(async () => {
				session.setState({ switchPending: { fromId: "session-with-archive", toId: "different" } });
				late.resolve({
					type: "response",
					command: "get_transcript_page",
					success: true,
					data: {
						messages: [{ role: "user", content: "Stale archive", timestamp: 1 }],
						totalMessages: 1,
						hasOlder: false,
					},
				});
			});
			expect(action("chat.olderHistory.open")).toBeUndefined();
			expect(document.body.textContent).not.toContain("Stale archive");
		} finally {
			bridge.omp = savedBridge;
		}
	});

	it("has no archive control in a read-only subagent transcript", async () => {
		const runtime = createTabRuntime("readonly-history");
		useTabsStore.setState({
			tabs: [{ id: runtime.tabId, cwd: "/project", status: "ready", kind: "agent", unreadDone: false }],
			activeTabId: runtime.tabId,
		});
		sessionRuntimeStore<SessionStore>(runtime.tabId, "session")?.setState({
			status: "ready",
			sessionId: "agent-archive",
		});
		sessionRuntimeStore<MessagesStore>(runtime.tabId, "messages")?.setState({
			messages: [
				{
					role: "compactionSummary",
					entryId: "readonly-boundary",
					summary: "Subagent compaction",
					tokensBefore: 10,
					timestamp: 5,
				},
			],
		});
		await mount(
			<SessionRuntimeProvider runtime={runtime}>
				<ReadOnlyTranscriptContext.Provider value={{ authorLabel: "Parent" }}>
					<ChatStream />
				</ReadOnlyTranscriptContext.Provider>
			</SessionRuntimeProvider>,
		);
		expect(document.body.textContent).not.toContain(translate("chat.olderHistory.open"));
	});
});
