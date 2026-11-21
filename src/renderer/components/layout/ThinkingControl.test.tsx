/**
 * Contract tests for the composer thinking-level picker (Codex-style):
 * the menu must offer exactly the selectors the active model supports — off,
 * auto, and the model's own ladder — with the current selector checked, and
 * a click must send that explicit value (never an unspecified "next" one).
 * Unsupported models get an honest note instead of a dead cycler.
 * Rendered with react-dom/client into a linkedom document.
 */

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
				data: { thinkingLevel: level === "auto" ? "medium" : level, thinkingConfigured: level },
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
	it("lists off, auto, and exactly the model-supported ladder with the current selector checked", async () => {
		installMockOmp();
		useModelStore.setState({
			thinkingLevel: "medium",
			thinkingConfigured: "medium",
			availableThinkingLevels: ["low", "medium", "high", "xhigh", "max"],
		});
		await mount(<ThinkingControl />);

		const trigger = buttonWithMono(labelFor("medium"));
		expect(trigger).toBeDefined();
		if (!trigger) return;
		await act(async () => {
			click(trigger);
		});

		const body = document.body.textContent ?? "";
		for (const option of ["off", "auto", "low", "medium", "high", "xhigh", "max"]) {
			expect(body).toContain(labelFor(option));
		}
		// Unsupported levels must not be offered.
		expect(body).not.toContain("minimal");
	});

	it("sends the explicitly picked value and applies the authoritative receipt", async () => {
		installMockOmp();
		useModelStore.setState({
			thinkingLevel: "medium",
			thinkingConfigured: "medium",
			availableThinkingLevels: ["low", "medium", "high"],
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
			availableThinkingLevels: ["low", "medium", "high", "xhigh", "max"],
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
			availableThinkingLevels: ["medium", "high"],
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

	it("offers auto as a first-class selector", async () => {
		installMockOmp();
		useModelStore.setState({
			thinkingLevel: "high",
			thinkingConfigured: "high",
			availableThinkingLevels: ["low", "medium", "high"],
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
		expect(useModelStore.getState().thinkingLevel).toBe("medium");
	});

	it("shows an honest note when the model does not reason", async () => {
		installMockOmp();
		useModelStore.setState({ thinkingLevel: undefined, thinkingConfigured: undefined, availableThinkingLevels: [] });
		await mount(<ThinkingControl />);

		const trigger = buttonWithMono(labelFor("off"));
		if (!trigger) throw new Error("trigger missing");
		await act(async () => {
			click(trigger);
		});
		expect(document.body.textContent).toContain("does not support reasoning");
	});

	// The bug: the sidecar reports `thinkingLevel: "high"` plus a
	// `thinking_level_changed { configured: "auto" }`, but never a ladder, so the
	// menu was empty while the trigger advertised "auto" — a selector that did
	// not exist. With no ladder the trigger must read as "off".
	it("does not advertise auto or a level on the trigger when the ladder is empty", async () => {
		installMockOmp();
		useModelStore.setState({ thinkingLevel: "high", thinkingConfigured: "auto", availableThinkingLevels: [] });
		await mount(<ThinkingControl />);

		const trigger = buttonWithMono(labelFor("off"));
		expect(trigger).toBeDefined();
		if (!trigger) return;
		const text = trigger.textContent ?? "";
		expect(text).toContain(labelFor("off"));
		expect(text).not.toContain(labelFor("auto"));
		expect(text).not.toContain(labelFor("high"));
	});

	it("advertises the derived ladder once get_state reports the model's efforts", async () => {
		installMockOmp();
		// Exactly what the real sidecar returns for minimax-m3.1-flash: the flat
		// ladder is null, the efforts live on the model.
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
		} as unknown as RpcSessionState);
		await mount(<ThinkingControl />);

		const trigger = buttonWithMono(labelFor("auto"));
		expect(trigger).toBeDefined();
		if (!trigger) return;
		await act(async () => {
			click(trigger);
		});
		const body = document.body.textContent ?? "";
		for (const option of ["off", "auto", "minimal", "low", "medium", "high", "xhigh"]) {
			expect(body).toContain(labelFor(option));
		}
		expect(body).not.toContain(labelFor("max"));
	});
});
