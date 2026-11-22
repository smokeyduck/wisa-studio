import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider, translate } from "../../lib/i18n";
import { useMessagesStore } from "../../stores/messages";
import { useSessionStore } from "../../stores/session";
import { setFocusedSessionRuntime } from "../../stores/session-runtime-context";
import { useTabsStore } from "../../stores/tabs";
import { activeWorkspacePage, useUiStore } from "../../stores/ui";
import { useWorkspaceMode } from "../../stores/workspace-mode";
import { ModesPanel } from "../panels/ModesPanel";
import { ChatStream } from "./ChatStream";

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
