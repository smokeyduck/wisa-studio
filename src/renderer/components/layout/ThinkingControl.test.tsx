/** The slider previews verified selectors and commits authoritative sidecar receipts. */

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
globals.cancelAnimationFrame = (frame: number) => clearTimeout(frame);

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
Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });

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
				data: {
					thinkingLevel: level === "auto" || level === "inherit" ? undefined : level,
					thinkingConfigured: level,
				},
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

function slider(): HTMLInputElement {
	const input = document.querySelector('input[type="range"]');
	if (!input) throw new Error("reasoning slider missing");
	return input as unknown as HTMLInputElement;
}

function inputLevel(index: number): void {
	const input = slider();
	input.value = String(index);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function release(): void {
	slider().dispatchEvent(new Event("pointerup", { bubbles: true }));
}

function key(target: HTMLInputElement, type: "keydown" | "keyup", value: string): void {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(event, "key", { value });
	if (value === "Escape") {
		document.dispatchEvent(event);
		return;
	}
	// linkedom lacks native input tracking; dispatch the same React handler directly.
	const propsKey = Object.keys(target).find(name => name.startsWith("__reactProps$"));
	if (!propsKey) throw new Error("slider React props missing");
	const props = (target as unknown as Record<string, Record<string, (event: object) => void>>)[propsKey];
	props[type === "keydown" ? "onKeyDown" : "onKeyUp"]({
		key: value,
		nativeEvent: event,
		preventDefault: () => event.preventDefault(),
	});
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
	it("uses only the verified ladder and starts at the declared High default", async () => {
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

		expect(slider().getAttribute("max")).toBe("1");
		expect(slider().value).toBe("1");
		expect(slider().getAttribute("aria-valuetext")).toBe(labelFor("high"));
		expect(document.body.textContent).toContain(labelFor("low"));
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
		await act(async () => inputLevel(3));
		expect(setThinkingLevelMock).not.toHaveBeenCalled();
		expect(slider().getAttribute("aria-valuetext")).toBe(labelFor("high"));
		expect(document.body.textContent).toContain(translate("input.thinking.level.high"));
		await act(async () => release());
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
		await act(async () => inputLevel(5));
		await act(async () => release());
		await flush();
		expect(slider().getAttribute("aria-valuetext")).toBe(labelFor("high"));
		expect(document.querySelector('[aria-haspopup="dialog"]')?.getAttribute("aria-expanded")).toBe("true");

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
		await act(async () => inputLevel(2));
		await act(async () => release());

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
		await act(async () => inputLevel(1));
		expect(slider().getAttribute("aria-valuetext")).toBe(labelFor("auto"));
		await act(async () => release());
		await flush();

		expect(setThinkingLevelMock).toHaveBeenCalledWith("auto");
		expect(useModelStore.getState().thinkingConfigured).toBe("auto");
		expect(useModelStore.getState().thinkingLevel).toBeUndefined();
	});

	it("shows an honest note when the model has no verified controls", async () => {
		installMockOmp();
		useModelStore.setState({
			thinkingLevel: undefined,
			thinkingConfigured: undefined,
			availableThinkingSelectors: [],
		});
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
		expect(slider().getAttribute("max")).toBe("5");
		await act(async () => inputLevel(0));
		expect(slider().getAttribute("aria-valuetext")).toBe(labelFor("off"));
		await act(async () => inputLevel(5));
		expect(slider().getAttribute("aria-valuetext")).toBe(labelFor("xhigh"));
	});

	it("previews repeated keyboard changes and commits once on key release", async () => {
		installMockOmp();
		useModelStore.setState({
			thinkingLevel: "low",
			thinkingConfigured: "low",
			availableThinkingSelectors: ["low", "medium", "high"],
		});
		await mount(<ThinkingControl />);
		const trigger = buttonWithMono(labelFor("low"));
		if (!trigger) throw new Error("trigger missing");
		await act(async () => click(trigger));
		await act(async () => {
			key(slider(), "keydown", "ArrowRight");
			inputLevel(1);
			inputLevel(2);
		});
		expect(setThinkingLevelMock).not.toHaveBeenCalled();
		await act(async () => key(slider(), "keyup", "ArrowRight"));
		expect(setThinkingLevelMock).toHaveBeenCalledTimes(1);
		expect(setThinkingLevelMock).toHaveBeenCalledWith("high");
	});

	it("cancels a preview on Escape without submitting it", async () => {
		installMockOmp();
		useModelStore.setState({
			thinkingLevel: "low",
			thinkingConfigured: "low",
			availableThinkingSelectors: ["low", "high"],
		});
		await mount(<ThinkingControl />);
		const trigger = buttonWithMono(labelFor("low"));
		if (!trigger) throw new Error("trigger missing");
		await act(async () => click(trigger));
		await act(async () => inputLevel(1));
		await act(async () => key(slider(), "keydown", "Escape"));
		expect(setThinkingLevelMock).not.toHaveBeenCalled();
		expect(document.querySelector('[aria-haspopup="dialog"]')?.getAttribute("aria-expanded")).toBe("false");
	});

	it("disables a single verified level without inventing additional choices", async () => {
		installMockOmp();
		useModelStore.setState({
			thinkingLevel: "high",
			thinkingConfigured: "high",
			availableThinkingSelectors: ["high"],
		});
		await mount(<ThinkingControl />);
		const trigger = buttonWithMono(labelFor("high"));
		if (!trigger) throw new Error("trigger missing");
		await act(async () => click(trigger));
		expect(slider().hasAttribute("disabled")).toBe(true);
		expect(slider().getAttribute("aria-valuetext")).toBe(labelFor("high"));
		expect(setThinkingLevelMock).not.toHaveBeenCalled();
	});

	it("discards a drag if the model changes before release", async () => {
		installMockOmp();
		useModelStore.setState({
			model: { provider: "fixture", id: "one" },
			thinkingLevel: "low",
			thinkingConfigured: "low",
			availableThinkingSelectors: ["low", "high"],
		});
		await mount(<ThinkingControl />);
		const trigger = buttonWithMono(labelFor("low"));
		if (!trigger) throw new Error("trigger missing");
		await act(async () => click(trigger));
		await act(async () => inputLevel(1));
		await act(async () => useModelStore.setState({ model: { provider: "fixture", id: "two" } }));
		await act(async () => release());
		expect(setThinkingLevelMock).not.toHaveBeenCalled();
	});

	it("discards the pending preview on outside press", async () => {
		installMockOmp();
		useModelStore.setState({
			thinkingLevel: "low",
			thinkingConfigured: "low",
			availableThinkingSelectors: ["low", "high"],
		});
		await mount(<ThinkingControl />);
		const trigger = buttonWithMono(labelFor("low"));
		if (!trigger) throw new Error("trigger missing");
		await act(async () => click(trigger));
		await act(async () => inputLevel(1));
		await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
		expect(setThinkingLevelMock).not.toHaveBeenCalled();
		expect(document.querySelector('[aria-haspopup="dialog"]')?.getAttribute("aria-expanded")).toBe("false");
	});

	it("locks the slider until the authoritative receipt and then allows another adjustment", async () => {
		installMockOmp();
		const receipt = Promise.withResolvers<RpcResponse>();
		setThinkingLevelMock.mockReturnValueOnce(receipt.promise);
		useModelStore.setState({
			thinkingLevel: "low",
			thinkingConfigured: "low",
			availableThinkingSelectors: ["low", "high"],
		});
		await mount(<ThinkingControl />);
		const trigger = buttonWithMono(labelFor("low"));
		if (!trigger) throw new Error("trigger missing");
		await act(async () => click(trigger));
		await act(async () => inputLevel(1));
		await act(async () => release());
		expect(slider().hasAttribute("disabled")).toBe(true);
		await act(async () => release());
		expect(setThinkingLevelMock).toHaveBeenCalledTimes(1);
		await act(async () =>
			receipt.resolve({
				type: "response",
				command: "set_thinking_level",
				success: true,
				data: { thinkingLevel: "high", thinkingConfigured: "high" },
			}),
		);
		expect(slider().hasAttribute("disabled")).toBe(false);
		await act(async () => inputLevel(0));
		await act(async () => release());
		expect(setThinkingLevelMock).toHaveBeenCalledTimes(2);
		expect(setThinkingLevelMock).toHaveBeenLastCalledWith("low");
	});
});
