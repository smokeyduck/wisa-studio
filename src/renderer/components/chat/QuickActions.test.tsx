import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import { I18nProvider, translate } from "../../lib/i18n";
import * as motion from "../../lib/motion";
import { useMessagesStore } from "../../stores/messages";
import { type SessionStore, useSessionStore } from "../../stores/session";
import { SessionRuntimeProvider, sessionRuntimeStore } from "../../stores/session-runtime-context";
import { createTabRuntime } from "../../stores/tab-runtime";
import { useTabsStore } from "../../stores/tabs";
import { activeWorkspacePage, useUiStore } from "../../stores/ui";
import { useWorkspaceMode } from "../../stores/workspace-mode";
import { ModesPanel } from "../panels/ModesPanel";
import { ChatStream } from "./ChatStream";
import { WelcomeScenes } from "./WelcomeScenes";

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
	cancelAnimationFrame: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
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
	useUiStore.setState({
		modesOpen: false,
		modesTab: "goal",
		workspacePage: null,
		panelVisible: false,
		panelTab: "overview",
	});
	useWorkspaceMode.setState({ defaultWorkspace: null });
	vi.restoreAllMocks();
	vi.useRealTimers();
	Reflect.deleteProperty(window, "matchMedia");
	Reflect.deleteProperty(document, "hidden");
});
async function mount(element: React.ReactNode) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container as unknown as Element);
	await act(async () => {
		root?.render(<I18nProvider>{element}</I18nProvider>);
	});
}

const LANES = [
	{ lane: "code", cwd: "/project", kind: "agent", titleKey: "chat.empty.title", subtitleKey: "chat.empty.subtitle" },
	{
		lane: "chat",
		cwd: "/project",
		kind: "chat",
		titleKey: "chat.empty.title.chat",
		subtitleKey: "chat.empty.subtitle.chat",
	},
	{
		lane: "work",
		cwd: "/work",
		kind: "agent",
		titleKey: "chat.empty.title.work",
		subtitleKey: "chat.empty.subtitle.work",
	},
] as const;

describe("empty conversation canvas", () => {
	it.each(LANES)("shows only the welcome content in $lane", async ({ lane, cwd, kind, titleKey, subtitleKey }) => {
		useWorkspaceMode.setState({ defaultWorkspace: "/work" });
		const runtime = createTabRuntime(`empty-${lane}`);
		useTabsStore.setState({
			tabs: [{ id: runtime.tabId, cwd, status: "ready", kind, unreadDone: false }],
			activeTabId: runtime.tabId,
		});
		sessionRuntimeStore<SessionStore>(runtime.tabId, "session")?.setState({
			status: "ready",
			cwd,
			sessionId: `empty-${lane}`,
		});
		await mount(
			<SessionRuntimeProvider runtime={runtime}>
				<ChatStream />
			</SessionRuntimeProvider>,
		);
		const canvas = container?.querySelector(".omp-transcript-scroll .omp-empty-canvas");
		expect(canvas).not.toBeNull();
		expect(canvas?.querySelector("img")?.getAttribute("src")).toBeTruthy();
		expect(canvas?.querySelector("h1")?.textContent).toBe(translate(titleKey));
		expect(canvas?.querySelector("p")?.textContent).toBe(translate(subtitleKey));
		expect(
			canvas?.querySelectorAll("button, textarea, .omp-card, .omp-starter-card, .omp-starter-grid"),
		).toHaveLength(0);
		expect(container?.querySelectorAll('[role="dialog"]')).toHaveLength(0);
	});
});

describe("welcome scene lifecycle", () => {
	function environment(reduced = false) {
		// GSAP retains the timeout-backed RAF shim; keep cancellation on the same timer API.
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
		const kills: Mock<() => void>[] = [];
		vi.spyOn(motion, "tweenStyle").mockImplementation((style, pose, _seconds, onComplete) => {
			Object.assign(style, pose);
			onComplete?.();
			const kill = vi.fn();
			kills.push(kill);
			return kill;
		});
		const listeners = new Set<() => void>();
		const media = {
			matches: reduced,
			addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
			removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
		};
		Object.defineProperty(window, "matchMedia", { configurable: true, value: () => media });
		Object.defineProperty(document, "hidden", { configurable: true, value: false });
		return {
			kills,
			listeners,
			reduce(value: boolean) {
				media.matches = value;
				for (const listener of listeners) listener();
			},
			hide(value: boolean) {
				Object.defineProperty(document, "hidden", { configurable: true, value });
				document.dispatchEvent(new Event("visibilitychange"));
			},
		};
	}

	async function advance(ms: number) {
		await act(async () => {
			vi.advanceTimersByTime(ms);
		});
	}

	it.each(["code", "work"] as const)(
		"cycles welcome text and artwork every ten seconds in %s without moving the logo",
		async mode => {
			environment();
			await mount(<WelcomeScenes mode={mode} />);
			const stage = container?.querySelector(".omp-welcome-stage");
			const logo = container?.querySelector("img");
			expect(stage?.getAttribute("data-scene")).toBe("constellation");
			const visibleCopy = () => container?.querySelector('[data-welcome-copy][aria-hidden="false"]');
			const initialTitle = translate(mode === "work" ? "chat.empty.title.work" : "chat.empty.title");
			expect(visibleCopy()?.querySelector("h1")?.textContent).toBe(initialTitle);
			await advance(9999);
			expect(stage?.getAttribute("data-scene")).toBe("constellation");
			await advance(1);
			expect(stage?.getAttribute("data-scene")).toBe("blueprint");
			expect(visibleCopy()?.querySelector("h1")?.textContent).toBe(translate(`chat.empty.title.${mode}.blueprint`));
			expect(visibleCopy()?.querySelector("p")?.textContent).toBe(
				translate(`chat.empty.subtitle.${mode}.blueprint`),
			);
			await advance(10_000);
			expect(stage?.getAttribute("data-scene")).toBe("folio");
			expect(visibleCopy()?.querySelector("h1")?.textContent).toBe(translate(`chat.empty.title.${mode}.folio`));
			expect(visibleCopy()?.querySelector("p")?.textContent).toBe(translate(`chat.empty.subtitle.${mode}.folio`));
			await advance(10_000);
			expect(stage?.getAttribute("data-scene")).toBe("constellation");
			expect(container?.querySelector("img")).toBe(logo);
			expect(visibleCopy()?.querySelector("h1")?.textContent).toBe(initialTitle);
			expect(stage?.getAttribute("aria-hidden")).toBe("true");
			expect(container?.querySelector("[aria-live]")).toBeNull();
		},
	);

	it("keeps the Chat greeting static", async () => {
		environment();
		await mount(<WelcomeScenes mode="chat" />);
		await advance(30_000);
		expect(container?.querySelector("h1")?.textContent).toBe(translate("chat.empty.title.chat"));
		expect(container?.querySelectorAll("[data-welcome-copy]")).toHaveLength(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("stays static without timers under reduced motion, including live preference changes", async () => {
		const env = environment(true);
		await mount(<WelcomeScenes mode="work" />);
		expect(vi.getTimerCount()).toBe(0);
		expect(motion.tweenStyle).not.toHaveBeenCalled();
		await act(async () => env.reduce(false));
		expect(vi.getTimerCount()).toBe(1);
		await advance(10_000);
		await act(async () => env.reduce(true));
		expect(vi.getTimerCount()).toBe(0);
		expect(container?.querySelector(".omp-welcome-stage")?.getAttribute("data-scene")).toBe("constellation");
		expect(container?.querySelector('[data-welcome-copy][aria-hidden="false"] h1')?.textContent).toBe(
			translate("chat.empty.title.work"),
		);
		expect(env.kills.every(kill => kill.mock.calls.length === 1)).toBe(true);
	});

	it("pauses hidden tabs and resets the loop on mode change, cleaning up on unmount", async () => {
		const env = environment();
		await mount(<WelcomeScenes mode="code" />);
		await advance(10_000);
		env.hide(true);
		expect(vi.getTimerCount()).toBe(0);
		await advance(30_000);
		expect(container?.querySelector(".omp-welcome-stage")?.getAttribute("data-scene")).toBe("blueprint");
		env.hide(false);
		await advance(5000);
		await act(async () =>
			root?.render(
				<I18nProvider>
					<WelcomeScenes mode="work" />
				</I18nProvider>,
			),
		);
		expect(container?.querySelector("h1")?.textContent).toBe(translate("chat.empty.title.work"));
		expect(container?.querySelector(".omp-welcome-stage")?.getAttribute("data-scene")).toBe("constellation");
		await advance(5000);
		expect(container?.querySelector(".omp-welcome-stage")?.getAttribute("data-scene")).toBe("constellation");
		await act(async () => root?.unmount());
		root = undefined;
		expect(vi.getTimerCount()).toBe(0);
		expect(env.listeners.size).toBe(0);
		expect(env.kills.every(kill => kill.mock.calls.length === 1)).toBe(true);
	});
});

describe("compact quick setup surfaces", () => {
	it.each(["vibe", "goal", "loop"] as const)(
		"opens %s in a non-modal session sidebar without replacing the inspector",
		async tab => {
			useUiStore.setState({ panelVisible: true, panelTab: "terminal" });
			useUiStore.getState().openModes(tab);
			expect(activeWorkspacePage(useUiStore.getState())).toBeNull();
			await mount(<ModesPanel open onClose={() => {}} initialTab={tab} />);
			expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
			expect(document.querySelector("aside")?.getAttribute("aria-label")).toBe(translate("modesPanel.title"));
			expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
				translate(`modesPanel.tabs.${tab}`),
			);
			expect(useUiStore.getState()).toMatchObject({ panelVisible: true, panelTab: "terminal" });
		},
	);
});
