/** Session controls toggle independently of plan mode and the existing inspector. */

import { parseHTML } from "linkedom";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import type { RpcResponse } from "../../../shared/rpc-types";
import { I18nProvider } from "../../lib/i18n";
import { useSessionStore } from "../../stores/session";
import { useUiStore } from "../../stores/ui";
import { ComposerModes } from "./ComposerModes";

const { document, window, Event, HTMLElement, Node } = parseHTML("<html><body></body></html>");

const globals = globalThis as Record<string, unknown>;
globals.document = document;
globals.window = window;
globals.Event = Event;
globals.HTMLElement = HTMLElement;
globals.Node = Node;
globals.IS_REACT_ACT_ENVIRONMENT = true;
globals.requestAnimationFrame = (callback: () => void) => setTimeout(callback, 0);

interface TestElement {
	textContent: string | null;
	remove: () => void;
	querySelector: (selector: string) => TestElement | null;
	querySelectorAll: (selector: string) => TestElement[];
	appendChild: (child: TestElement) => void;
	title: string;
	className: string;
	click: () => void;
	getAttribute: (name: string) => string | null;
}

function success(data: unknown): RpcResponse {
	return { type: "response", command: "test", success: true, data };
}

interface MockOmp {
	rpc: {
		setPlanMode: Mock<(enabled: boolean) => Promise<RpcResponse>>;
	};
	events: {
		onConfigUpdate: Mock<() => () => void>;
	};
}

/** ComposerModes needs no RPC on render; the mock preserves the window bridge contract. */
function installMockOmp(): MockOmp {
	const omp: MockOmp = {
		rpc: {
			setPlanMode: vi.fn(async enabled => success({ enabled })),
		},
		events: {
			onConfigUpdate: vi.fn(() => () => {}),
		},
	};
	(window as unknown as { omp: MockOmp }).omp = omp;
	return omp;
}

let container: TestElement;
let root: Root;

async function flush(): Promise<void> {
	await act(async () => {
		const { promise, resolve } = Promise.withResolvers<void>();
		setTimeout(resolve, 0);
		await promise;
	});
}

async function mount(element: ReactElement): Promise<void> {
	container = document.createElement("div") as unknown as TestElement;
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
	useSessionStore.getState().reset();
	useUiStore.setState({ modesOpen: false, modesTab: "vibe" });
	useUiStore.setState({ panelVisible: false, panelTab: "overview" });
});

function buttonByTitle(title: string): TestElement | null {
	const match = Array.from(document.body.querySelectorAll("button")).find(button => button.title === title);
	// linkedom's element type and the minimal test facade are structurally equivalent at runtime.
	return (match ?? null) as unknown as TestElement | null;
}

describe("ComposerModes controls", () => {
	it("surfaces active modes and toggles the sidebar without changing their state", async () => {
		installMockOmp();
		useSessionStore.setState({
			planModeEnabled: true,
			goal: { objective: "Ship the activity dock" },
			goalState: { status: "active" },
			loopMode: { enabled: true, state: "running", prompt: "keep going" },
			vibeModeEnabled: true,
		});
		useUiStore.setState({ panelVisible: true, panelTab: "files" });
		await mount(<ComposerModes />);
		const trigger = container.querySelector("[data-session-controls-trigger]");
		expect(trigger?.textContent).toContain("3");
		expect(trigger?.getAttribute("aria-expanded")).toBe("false");
		await act(async () => trigger?.click());
		expect(useUiStore.getState()).toMatchObject({ modesOpen: true, panelVisible: true, panelTab: "files" });
		await act(async () => trigger?.click());
		expect(useUiStore.getState()).toMatchObject({ modesOpen: false, panelVisible: true, panelTab: "files" });
		expect(useSessionStore.getState()).toMatchObject({
			planModeEnabled: true,
			vibeModeEnabled: true,
			loopMode: { enabled: true },
		});
	});

	it("turns active planning off directly without opening a menu or the sidebar", async () => {
		const omp = installMockOmp();
		useSessionStore.setState({ planModeEnabled: true });
		await mount(<ComposerModes />);
		await act(async () => buttonByTitle("Plan mode: agent drafts a plan before acting")?.click());
		expect(omp.rpc.setPlanMode).toHaveBeenCalledWith(false);
		expect(useSessionStore.getState().planModeEnabled).toBe(false);
		expect(useUiStore.getState().modesOpen).toBe(false);
		expect(document.querySelector('[role="menu"]')).toBeNull();
	});
});
