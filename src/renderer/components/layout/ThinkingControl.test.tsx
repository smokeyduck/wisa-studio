/** The menu renders only verified selectors and applies authoritative sidecar receipts. */

import { parseHTML } from "linkedom";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import type { RpcResponse, RpcSessionState } from "../../../shared/rpc-types";
import { I18nProvider, translate } from "../../lib/i18n";
import { useModelStore } from "../../stores/model";
import { useSessionStore } from "../../stores/session";
import { useTabsStore } from "../../stores/tabs";
import { ThinkingControl } from "./ThinkingControl";

const { document, window, Event, HTMLElement, Node } = parseHTML("<html><body></body></html>");

const globals = globalThis as Record<string, unknown>;
globals.document = document;
globals.window = window;
globals.Event = Event;
globals.HTMLElement = HTMLElement;
globals.Node = Node;
globals.IS_REACT_ACT_ENVIRONMENT = true;
globals.requestAnimationFrame = (callback: () => void) => setTimeout(callback, 0);

const elementPrototype = HTMLElement.prototype as unknown as Record<string, unknown>;
if (typeof elementPrototype.scrollIntoView !== "function") elementPrototype.scrollIntoView = () => {};
elementPrototype.getBoundingClientRect = () => ({
	bottom: 0,
	height: 0,
	left: 0,
	right: 0,
	top: 0,
	width: 0,
	x: 0,
	y: 0,
	toJSON: () => ({}),
});
Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });

interface TestElement {
	textContent: string | null;
	remove: () => void;
	appendChild: (child: TestElement) => void;
	dispatchEvent: (event: object) => boolean;
}

let setThinkingLevelMock: Mock<(level: string) => Promise<RpcResponse>>;

function installMockOmp(): void {
	setThinkingLevelMock = vi.fn(
		async level =>
			({
				type: "response",
				command: "set_thinking_level",
				success: true,
				data: { thinkingLevel: level === "auto" || level === "inherit" ? undefined : level, thinkingConfigured: level },
			}) as RpcResponse,
	);
	const ompWindow = window as unknown as { omp: { rpc: { setThinkingLevel: typeof setThinkingLevelMock } } };
	ompWindow.omp = { rpc: { setThinkingLevel: setThinkingLevelMock } };
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

function click(element: TestElement): void {
	element.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
}

function buttonWithMono(text: string): TestElement | undefined {
	const buttons = Array.from(document.querySelectorAll("button")) as unknown as TestElement[];
	return buttons.find(button => button.textContent?.includes(text));
}

/** The control renders localized level names, not the raw wire enum. */
function labelFor(level: string): string {
	return translate(`input.thinking.name.${level}`);
}

afterEach(async () => {
	if (root) {
		await act(async () => {
			root.unmount();
		});
	}
	container?.remove();
	// The menu portals to document.body — sweep any leftovers between tests.
	document.body.innerHTML = "";
	useModelStore.getState().reset();
	useSessionStore.getState().reset();
	useTabsStore.getState().reset();
});

describe("ThinkingControl", () => {
	it("checks the declared High default without offering a generic default or unsupported Off", async () => {
		installMockOmp();
		useModelStore.getState().setFromState({
			model: {
				provider: "fixture",
				id: "fixed",
				reasoning: true,
				thinking: { defaultLevel: "high", requiresEffort: true },
			},
			thinkingConfigured: "inherit",
			thinkingLevels: ["off", "inherit", "low", "high"],
		} as RpcSessionState);
		await mount(<ThinkingControl />);

		const trigger = buttonWithMono(labelFor("high"));
		if (!trigger) throw new Error("High default not rendered");
		await act(async () => {
			click(trigger);
		});

		const choices = Array.from(document.querySelectorAll('[role="menuitemradio"]'));
		const checked = choices.find(choice => choice.getAttribute("aria-checked") === "true");
		expect(checked?.textContent).toContain(labelFor("high"));
		expect(choices).toHaveLength(2);
		expect(choices.some(choice => choice.textContent?.includes(labelFor("low")))).toBe(true);
	});

	it("sends the explicitly picked value and applies the authoritative receipt", async () => {
		installMockOmp();
		useModelStore.setState({
			thinkingLevel: "medium",
			thinkingConfigured: "medium",
			availableThinkingSelectors: ["off", "low", "medium", "high"],
		});
		await mount(<ThinkingControl />);

		const trigger = buttonWithMono(labelFor("medium"));
		if (!trigger) throw new Error("trigger missing");
		await act(async () => {
			click(trigger);
		});
		const high = buttonWithMono(labelFor("high"));
		expect(high).toBeDefined();
		if (!high) return;
		await act(async () => {
			click(high);
		});
		await flush();

		expect(setThinkingLevelMock).toHaveBeenCalledWith("high");
		expect(useModelStore.getState().thinkingConfigured).toBe("high");
		expect(useModelStore.getState().thinkingLevel).toBe("high");
	});

	it("shows the effective clamped level returned by the sidecar", async () => {
		installMockOmp();
		setThinkingLevelMock.mockResolvedValue({
			type: "response",
			command: "set_thinking_level",
			success: true,
			data: { thinkingLevel: "high", thinkingConfigured: "high" },
		});
		useModelStore.setState({
			thinkingLevel: "medium",
			thinkingConfigured: "medium",
			availableThinkingSelectors: ["off", "low", "medium", "high", "xhigh", "max"],
		});
		await mount(<ThinkingControl />);

		const trigger = buttonWithMono(labelFor("medium"));
		if (!trigger) throw new Error("trigger missing");
		await act(async () => click(trigger));
		const max = buttonWithMono(labelFor("max"));
		if (!max) throw new Error("max option missing");
		await act(async () => click(max));
		await flush();

		expect(setThinkingLevelMock).toHaveBeenCalledWith("max");
		expect(useModelStore.getState().thinkingConfigured).toBe("high");
		expect(useModelStore.getState().thinkingLevel).toBe("high");
	});

	it("does not apply a late receipt to a different tab", async () => {
		installMockOmp();
		const receipt = Promise.withResolvers<RpcResponse>();
		setThinkingLevelMock.mockReturnValue(receipt.promise);
		useTabsStore.setState({
			tabs: [
				{ id: "t0", cwd: "/one", status: "ready", kind: "agent", unreadDone: false },
				{ id: "t1", cwd: "/two", status: "ready", kind: "agent", unreadDone: false },
			],
			activeTabId: "t0",
			bundles: new Map(),
		});
		useSessionStore.setState({ sessionId: "session-one" });
		useModelStore.setState({
			thinkingLevel: "medium",
			thinkingConfigured: "medium",
			availableThinkingSelectors: ["off", "medium", "high"],
		});
		await mount(<ThinkingControl />);

		const trigger = buttonWithMono(labelFor("medium"));
		if (!trigger) throw new Error("trigger missing");
		await act(async () => click(trigger));
		const high = buttonWithMono(labelFor("high"));
		if (!high) throw new Error("high option missing");
		await act(async () => click(high));

		await act(async () => {
			useTabsStore.setState({ activeTabId: "t1" });
			useSessionStore.setState({ sessionId: "session-two" });
			useModelStore.setState({ thinkingLevel: "low", thinkingConfigured: "low" });
			receipt.resolve({
				type: "response",
				command: "set_thinking_level",
				success: true,
				data: { thinkingLevel: "high", thinkingConfigured: "high" },
			});
		});
		await flush();

		expect(useModelStore.getState().thinkingConfigured).toBe("low");
		expect(useModelStore.getState().thinkingLevel).toBe("low");
	});

	it("offers confirmed native Auto and keeps its receipt separate from the effective effort", async () => {
		installMockOmp();
		useModelStore.setState({
			thinkingLevel: "high",
			thinkingConfigured: "high",
			availableThinkingSelectors: ["off", "auto", "low", "medium", "high"],
		});
		await mount(<ThinkingControl />);

		const trigger = buttonWithMono(labelFor("high"));
		if (!trigger) throw new Error("trigger missing");
		await act(async () => {
			click(trigger);
		});
		const auto = buttonWithMono(labelFor("auto"));
		expect(auto).toBeDefined();
		if (!auto) return;
		await act(async () => {
			click(auto);
		});
		await flush();

		expect(setThinkingLevelMock).toHaveBeenCalledWith("auto");
		expect(useModelStore.getState().thinkingConfigured).toBe("auto");
		expect(useModelStore.getState().thinkingLevel).toBeUndefined();
	});

	it("shows an honest note when the model has no verified controls", async () => {
		installMockOmp();
		useModelStore.setState({ thinkingLevel: undefined, thinkingConfigured: undefined, availableThinkingSelectors: [] });
		await mount(<ThinkingControl />);

		const trigger = buttonWithMono(translate("input.thinking.label"));
		if (!trigger) throw new Error("trigger missing");
		await act(async () => {
			click(trigger);
		});
		expect(document.body.textContent).toContain(translate("input.thinking.unsupported"));
	});

	it("does not advertise stale Auto or a stale effort when no controls are verified", async () => {
		installMockOmp();
		useModelStore.setState({ thinkingLevel: "high", thinkingConfigured: "auto", availableThinkingSelectors: [] });
		await mount(<ThinkingControl />);

		const trigger = buttonWithMono(translate("input.thinking.label"));
		expect(trigger).toBeDefined();
		if (!trigger) return;
		const text = trigger.textContent ?? "";
		expect(text).not.toContain(labelFor("auto"));
		expect(text).not.toContain(labelFor("high"));
	});

	it("does not show legacy classifier Auto despite a verified fixed effort ladder", async () => {
		installMockOmp();
		// Old sidecars report classifier Auto in the selector list for every ladder.
		useModelStore.getState().setFromState({
			model: {
				provider: "minimax",
				id: "minimax-m3.1-flash",
				reasoning: true,
				thinking: { mode: "effort", efforts: ["minimal", "low", "medium", "high", "xhigh"] },
			},
			thinkingLevel: "high",
			thinkingConfigured: "auto",
			availableThinkingLevels: null,
			thinkingLevels: ["off", "auto", "minimal", "low", "medium", "high", "xhigh"],
		} as unknown as RpcSessionState);
		await mount(<ThinkingControl />);

		const trigger = buttonWithMono(labelFor("high"));
		expect(trigger).toBeDefined();
		if (!trigger) return;
		await act(async () => {
			click(trigger);
		});
		const body = document.body.textContent ?? "";
		for (const option of ["off", "minimal", "low", "medium", "high", "xhigh"]) {
			expect(body).toContain(labelFor(option));
		}
		expect(buttonWithMono(labelFor("max"))).toBeUndefined();
		expect(buttonWithMono(labelFor("auto"))).toBeUndefined();
	});
});
