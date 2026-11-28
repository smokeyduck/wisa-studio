import { parseHTML } from "linkedom";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomProviderView } from "../../../shared/ipc-types";
import type { ModelInfo, ProviderInfo, RpcResponse } from "../../../shared/rpc-types";
import { WISA_CONNECT_PAGE_URL } from "../../../shared/wisa";
import { I18nProvider } from "../../lib/i18n";
import { useExtensionUiStore } from "../../stores/extension-ui";
import { useModelStore } from "../../stores/model";
import { useSessionStore } from "../../stores/session";
import { useUiStore } from "../../stores/ui";
import { Modal } from "../common";
import { FirstRunOnboardingDialog, hasUsableModelProvider } from "./FirstRunOnboardingDialog";
import { TUTORIAL_COMPLETION_KEY } from "./FirstUseTutorial";
import { FIRST_USE_TOUR } from "./first-use-tour";

const { document, window, Event, HTMLElement, Node, MutationObserver } = parseHTML("<html><body></body></html>");
Object.assign(globalThis, {
	document,
	window,
	Event,
	HTMLElement,
	Node,
	MutationObserver,
	IS_REACT_ACT_ENVIRONMENT: true,
	requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0),
});
const elementPrototype = HTMLElement.prototype as unknown as Record<string, unknown>;
if (typeof elementPrototype.focus !== "function") elementPrototype.focus = () => {};

function provider(partial: Partial<ProviderInfo> & { id: string }): ProviderInfo {
	return { name: partial.id, authenticated: false, loginAvailable: true, disabled: false, modelCount: 0, ...partial };
}
const readyProvider = provider({ id: "gateway", authenticated: true, modelCount: 1 });
const model = { id: "model-id", provider: "gateway" } as ModelInfo;
function success(providers: ProviderInfo[], models: ModelInfo[] = []): RpcResponse {
	return { type: "response", command: "test", success: true, data: { providers, models } };
}
function install(providers: ProviderInfo[] = [], models: ModelInfo[] = [], completed = false) {
	const omp = {
		rpc: { getProviders: vi.fn(async () => success(providers, models)) },
		models: { listProviders: vi.fn(async (): Promise<CustomProviderView[]> => []) },
		prefs: { get: vi.fn(async () => completed), set: vi.fn(async () => undefined) },
		system: { openExternal: vi.fn(async () => undefined) },
	};
	const testWindow = window as unknown as { omp: typeof omp };
	testWindow.omp = omp;
	return omp;
}
let container: InstanceType<typeof HTMLElement> | null = null;
let root: Root | null = null;
async function flush(): Promise<void> {
	await act(async () => {
		const { promise, resolve } = Promise.withResolvers<void>();
		setTimeout(resolve, 0);
		await promise;
	});
}
async function mount(element: ReactElement = <FirstRunOnboardingDialog />): Promise<void> {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	await act(async () => {
		root?.render(<I18nProvider>{element}</I18nProvider>);
	});
	await flush();
}
function buttonNamed(text: string): HTMLButtonElement {
	const button = [...document.querySelectorAll("button")].find(candidate => candidate.textContent?.includes(text));
	if (!(button instanceof HTMLElement)) throw new Error(`Button not found: ${text}`);
	return button as HTMLButtonElement;
}
async function click(text: string): Promise<void> {
	await act(async () => buttonNamed(text).click());
	await flush();
}
afterEach(async () => {
	await act(async () => root?.unmount());
	container?.remove();
	container = null;
	root = null;
	useSessionStore.getState().reset();
	useModelStore.getState().reset();
	useUiStore.getState().closeProviders();
	useUiStore.getState().closeProviderConfig();
	useUiStore.getState().closeTutorial();
	useExtensionUiStore.getState().clearAll();
});

describe("hasUsableModelProvider", () => {
	it("matches a live model to an enabled authenticated provider, not catalogue counts", () => {
		expect(hasUsableModelProvider([readyProvider], [], [])).toBe(false);
		expect(hasUsableModelProvider([readyProvider], [], [{ ...model, provider: "other" }])).toBe(false);
		expect(hasUsableModelProvider([{ ...readyProvider, disabled: true }], [], [model])).toBe(false);
		expect(hasUsableModelProvider([{ ...readyProvider, authenticated: false }], [], [model])).toBe(false);
		expect(hasUsableModelProvider([readyProvider], [], [model])).toBe(true);
	});
	it("allows an explicitly keyless provider but not a configured URL or saved key alone", () => {
		const config: CustomProviderView = {
			id: "gateway",
			api: "openai-completions",
			baseUrl: "http://localhost:11434/v1",
			hasApiKey: false,
			models: [{ id: model.id }],
			builtin: false,
			auth: "none",
		};
		const unauthenticated = { ...readyProvider, authenticated: false };
		expect(hasUsableModelProvider([unauthenticated], [config], [model])).toBe(true);
		expect(hasUsableModelProvider([unauthenticated], [config], [])).toBe(false);
		expect(
			hasUsableModelProvider([unauthenticated], [{ ...config, auth: undefined, hasApiKey: true }], [model]),
		).toBe(false);
	});
});

describe("FirstRunOnboardingDialog tutorial", () => {
	it("opens education only after readiness and stored completion are resolved", async () => {
		install([readyProvider], [model]);
		await mount();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		await act(async () => useSessionStore.getState().setStatus("ready", "/tmp/project"));
		await flush();
		expect(document.querySelector("[data-tour-card]")).not.toBeNull();
	});
	it("does not overlap settings when a late check succeeds", async () => {
		const omp = install();
		const pending = Promise.withResolvers<RpcResponse>();
		omp.rpc.getProviders.mockReturnValue(pending.promise);
		useSessionStore.getState().setStatus("ready", "/tmp/project");
		await mount(
			<>
				<FirstRunOnboardingDialog />
				<Modal open onClose={() => {}} title="Settings">
					Current settings
				</Modal>
			</>,
		);
		await act(async () => pending.resolve(success([readyProvider], [model])));
		await flush();
		expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
		expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Current settings");
	});
	it("reacts to connection and model updates in this launch, waiting for provider page closure", async () => {
		const omp = install();
		useSessionStore.getState().setStatus("ready", "/tmp/project");
		await mount();
		await click("Other providers");
		omp.rpc.getProviders.mockResolvedValue(success([readyProvider], [model]));
		await act(async () => useModelStore.setState({ availableModels: [model], catalogGeneration: 1 }));
		await flush();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		await act(async () => useUiStore.getState().closeProviders());
		await flush();
		expect(document.querySelector("[data-tour-card]")).not.toBeNull();
	});
	it.each([
		success([readyProvider]),
		success([{ ...readyProvider, authenticated: false }], [model]),
		{ type: "response", command: "test", success: false, error: "offline" } as RpcResponse,
	])("does not teach on missing models, unauthenticated catalogue or failed reads", async response => {
		const omp = install();
		omp.rpc.getProviders.mockResolvedValue(response);
		useSessionStore.getState().setStatus("ready", "/tmp/project");
		await mount();
		expect(document.querySelector("[data-tour-card]")).toBeNull();
		expect(omp.prefs.set).not.toHaveBeenCalled();
	});
	it("recovers from a transient failed check on a later catalog update", async () => {
		const omp = install();
		omp.rpc.getProviders.mockRejectedValueOnce(new Error("offline"));
		useSessionStore.getState().setStatus("ready", "/tmp/project");
		await mount();
		omp.rpc.getProviders.mockResolvedValue(success([readyProvider], [model]));
		await act(async () => useModelStore.setState({ catalogGeneration: 1 }));
		await flush();
		expect(document.querySelector("[data-tour-card]")).not.toBeNull();
	});
	it("does not open for users who already completed or skipped", async () => {
		install([readyProvider], [model], true);
		useSessionStore.getState().setStatus("ready", "/tmp/project");
		await mount();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});
	it.each(["skip", "finish"])("persists completion only on explicit %s", async action => {
		const omp = install([readyProvider], [model]);
		useSessionStore.getState().setStatus("ready", "/tmp/project");
		await mount();
		expect(omp.prefs.set).not.toHaveBeenCalled();
		if (action === "finish") {
			for (let i = 1; i < FIRST_USE_TOUR.length; i++) await click("Next");
			await click("Start using Wisa");
		} else await click("Skip tutorial");
		expect(omp.prefs.set).toHaveBeenCalledWith(TUTORIAL_COMPLETION_KEY, true);
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});
	it("closing or cancelled browser sign-in never records tutorial completion", async () => {
		const omp = install();
		useSessionStore.getState().setStatus("ready", "/tmp/project");
		await mount();
		await click("Sign in to WISA");
		expect(omp.system.openExternal).toHaveBeenCalledWith(WISA_CONNECT_PAGE_URL);
		expect(omp.prefs.set).not.toHaveBeenCalled();
		expect(document.querySelector("[data-tour-card]")).toBeNull();
	});
	it("Escape dismisses education without persisting completion", async () => {
		const omp = install([readyProvider], [model]);
		useSessionStore.getState().setStatus("ready", "/tmp/project");
		await mount();
		const event = new Event("keydown", { bubbles: true });
		Object.assign(event, { key: "Escape" });
		await act(async () => window.dispatchEvent(event));
		await flush();
		expect(omp.prefs.set).not.toHaveBeenCalled();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});
	it("withdraws stale readiness when a later config read fails", async () => {
		const omp = install([readyProvider], [model]);
		useSessionStore.getState().setStatus("ready", "/tmp/project");
		await mount();
		expect(document.querySelector("[data-tour-card]")).not.toBeNull();
		omp.models.listProviders.mockRejectedValue(new Error("configuration unavailable"));
		await act(async () => useModelStore.setState({ catalogGeneration: 1 }));
		await flush();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(omp.prefs.set).not.toHaveBeenCalled();
	});
	it("keeps a failed completion save visible and retryable", async () => {
		const omp = install([readyProvider], [model]);
		omp.prefs.set.mockRejectedValueOnce(new Error("disk unavailable"));
		useSessionStore.getState().setStatus("ready", "/tmp/project");
		await mount();
		await click("Skip tutorial");
		expect(document.querySelector('[role="alert"]')?.textContent).toContain("Could not save tutorial completion");
		expect(document.querySelector('[role="dialog"]')).not.toBeNull();
		await click("Skip tutorial");
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});
	it("replays after completion, jumps by topic and restores the previous view without changing preferences", async () => {
		const omp = install([readyProvider], [model], true);
		useSessionStore.getState().setStatus("ready", "/tmp/project");
		useUiStore.getState().openSettings("gui");
		useUiStore.setState({ settingsQuery: "wallpaper", sidebarVisible: false });
		await mount();
		await act(async () => useUiStore.getState().openTutorial());
		await flush();
		expect(Boolean(container?.inert)).toBe(true);
		await click("Tour contents");
		await click("Set up TypeSafe routing explicitly");
		expect(document.querySelector("[data-tour-card]")?.getAttribute("data-tour-card")).toBe("typesafe");
		expect(useUiStore.getState().modelRolesOpen).toBe(true);
		const close = document.querySelector<HTMLButtonElement>('[aria-label="Close guide"]');
		await act(async () => close?.click());
		await flush();
		expect(document.querySelector("[data-tour-card]")).toBeNull();
		expect(useUiStore.getState()).toMatchObject({
			settingsOpen: true,
			settingsTab: "gui",
			settingsQuery: "wallpaper",
			sidebarVisible: false,
			modelRolesOpen: false,
		});
		expect(Boolean(container?.inert)).toBe(false);
		expect(omp.prefs.set).not.toHaveBeenCalled();
		await act(async () => useUiStore.getState().closeSettings());
	});
	it("yields to an approval request and resumes the same topic after it is answered", async () => {
		const omp = install([readyProvider], [model]);
		useSessionStore.getState().setStatus("ready", "/tmp/project");
		await mount();
		await click("Next");
		await act(async () =>
			useExtensionUiStore.getState().pushRequest({
				type: "extension_ui_request",
				id: "approval",
				method: "confirm",
				title: "Approve tool",
				message: "Read this file?",
			}),
		);
		await flush();
		expect(document.querySelector("[data-tour-card]")).toBeNull();
		expect(Boolean(container?.inert)).toBe(false);
		await act(async () => useExtensionUiStore.getState().removeRequest("approval"));
		await flush();
		expect(document.querySelector("[data-tour-card]")?.getAttribute("data-tour-card")).toBe("workspace");
		expect(omp.prefs.set).not.toHaveBeenCalled();
	});
});
