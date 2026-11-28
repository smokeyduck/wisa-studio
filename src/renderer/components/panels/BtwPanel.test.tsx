/** Side questions use the real store/wire contract, with local clipboard staging. */

import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BtwHistoryRecord, ModelInfo, RpcCommand, RpcResponse } from "../../../shared/rpc-types";
import { I18nProvider, translate } from "../../lib/i18n";
import { useBtwStore } from "../../stores/btw";
import { useModelStore } from "../../stores/model";
import { BtwPanel } from "./BtwPanel";

const { document, window, Event, HTMLElement, Node } = parseHTML("<html><body></body></html>");

const globals = globalThis as Record<string, unknown>;
globals.document = document;
globals.window = window;
globals.Event = Event;
globals.HTMLElement = HTMLElement;
globals.Node = Node;
globals.IS_REACT_ACT_ENVIRONMENT = true;
globals.requestAnimationFrame = (callback: () => void) => setTimeout(callback, 0);
globals.cancelAnimationFrame = clearTimeout;
Object.assign(window, { matchMedia: () => ({ matches: true }) });

const elementPrototype = HTMLElement.prototype as unknown as Record<string, unknown>;
if (typeof elementPrototype.scrollIntoView !== "function") elementPrototype.scrollIntoView = () => {};
if (typeof elementPrototype.focus !== "function") elementPrototype.focus = () => {};

interface TestElement {
	textContent: string | null;
	value?: string;
	disabled?: boolean;
	dispatchEvent: (event: unknown) => void;
	getAttribute: (name: string) => string | null;
	remove: () => void;
}

function record(overrides: Partial<BtwHistoryRecord> = {}): BtwHistoryRecord {
	return {
		id: "topic-1",
		leafId: "leaf-1",
		question: "why?",
		answer: "",
		status: "running",
		createdAt: 1,
		updatedAt: 1,
		...overrides,
	};
}

function ok(command: string, data?: unknown): RpcResponse {
	return { type: "response", command, success: true, data };
}

const command = vi.fn(async (cmd: RpcCommand): Promise<RpcResponse> => {
	if (cmd.type === "get_btw_history") return ok("get_btw_history", { records: [] });
	if (cmd.type === "btw") {
		return ok("btw", {
			record: record({
				id: cmd.recordId ?? "new-topic",
				question: cmd.question,
				answer: "ok",
				status: "complete",
			}),
		});
	}
	if (cmd.type === "btw_cancel") return ok("btw_cancel", { cancelled: true });
	if (cmd.type === "btw_branch") return ok("btw_branch", { cancelled: false });
	if (cmd.type === "btw_inject") return ok("btw_inject", { sent: true });
	return { type: "response", command: cmd.type, success: false, error: "unsupported" };
});

Object.assign(window as unknown as Record<string, unknown>, { omp: { rpc: { command } } });

let container: TestElement | null = null;
let root: Root | null = null;

async function flush(): Promise<void> {
	await act(async () => {
		const { promise, resolve } = Promise.withResolvers<void>();
		setTimeout(resolve, 0);
		await promise;
	});
}

async function dispatch(target: TestElement, event: InstanceType<typeof Event>): Promise<void> {
	Object.defineProperty(event, "eventPhase", { value: 0, writable: true, configurable: true });
	await act(async () => {
		target.dispatchEvent(event);
	});
}

async function click(element: TestElement | undefined): Promise<void> {
	if (!element) throw new Error("click: element not found");
	await dispatch(element, new Event("click", { bubbles: true, cancelable: true }));
	await flush();
}

/** Set a controlled input's value and drive its React onChange contract. */
async function typeInto(element: TestElement, value: string): Promise<void> {
	const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value");
	if (descriptor?.set) {
		descriptor.set.call(element, value);
	} else {
		element.value = value;
	}
	const props = Object.getOwnPropertyNames(element).find(key => key.startsWith("__reactProps$"));
	const handler = props
		? (element as unknown as Record<string, { onChange?: (event: object) => void }>)[props]?.onChange
		: undefined;
	if (handler) {
		await act(async () => handler({ target: element, currentTarget: element }));
		return;
	}
	await dispatch(element, new Event("input", { bubbles: true, cancelable: true }));
}

/**
 * Press Enter in the controlled textarea. It drives React's own onKeyDown prop:
 * a synthetic DOM keydown makes React's input polyfill re-read the value tracker
 * against a detached instance under linkedom.
 */
async function pressEnter(element: TestElement, init: { shiftKey?: boolean } = {}): Promise<void> {
	const props = Object.getOwnPropertyNames(element).find(key => key.startsWith("__reactProps$"));
	const handler = props
		? (element as unknown as Record<string, { onKeyDown?: (event: object) => void }>)[props]?.onKeyDown
		: undefined;
	if (!handler) throw new Error("pressEnter: no onKeyDown handler");
	let prevented = false;
	await act(async () => {
		handler({
			key: "Enter",
			shiftKey: init.shiftKey ?? false,
			metaKey: false,
			ctrlKey: false,
			nativeEvent: { isComposing: false },
			preventDefault: () => {
				prevented = true;
			},
		});
	});
	expect(prevented).toBe(true);
}

function buttonWithText(text: string): TestElement | undefined {
	return (Array.from(document.querySelectorAll("button")) as unknown as TestElement[]).find(button =>
		button.textContent?.includes(text),
	);
}

function topicRows(): TestElement[] {
	return Array.from(document.querySelectorAll("button[aria-pressed]")) as unknown as TestElement[];
}

async function pasteImages(files: File[] = [{ type: "image/png" } as File]): Promise<void> {
	const element = textarea();
	const props = Object.getOwnPropertyNames(element).find(key => key.startsWith("__reactProps$"));
	const handler = props
		? (element as unknown as Record<string, { onPaste?: (event: object) => void }>)[props]?.onPaste
		: undefined;
	if (!handler) throw new Error("pasteImages: no onPaste handler");
	await act(async () => handler({ clipboardData: { files }, preventDefault: vi.fn() }));
	await flush();
}

function enableImages(): void {
	useModelStore.setState({
		model: { id: "vision", provider: "test", api: "openai-completions", input: ["text", "image"] } as ModelInfo,
	});
	vi.stubGlobal(
		"FileReader",
		class {
			result = "data:image/png;base64,cGljdHVyZQ==";
			onload: (() => void) | null = null;
			readAsDataURL() {
				queueMicrotask(() => this.onload?.());
			}
		},
	);
}

function textarea(): TestElement {
	const element = document.querySelector("textarea") as unknown as TestElement | null;
	if (!element) throw new Error("textarea not found");
	return element;
}

async function mount(): Promise<void> {
	container = document.createElement("div") as unknown as TestElement;
	document.body.appendChild(container as never);
	root = createRoot(container as unknown as Element);
	await act(async () => {
		root?.render(
			<I18nProvider>
				<BtwPanel />
			</I18nProvider>,
		);
	});
	await flush();
}

beforeEach(() => {
	command.mockClear();
});

afterEach(async () => {
	await act(async () => {
		root?.unmount();
	});
	container?.remove();
	container = null;
	root = null;
	useBtwStore.getState().reset();
	useModelStore.getState().reset();
	vi.unstubAllGlobals();
});

describe("BtwPanel", () => {
	it("keeps all topics in the centered history picker, then closes it on selection", async () => {
		const newer = record({
			id: "newer",
			question: "newer question",
			answer: "newer answer",
			status: "complete",
			createdAt: 2,
		});
		const older = record({
			id: "older",
			question: "older question",
			answer: "older answer",
			status: "complete",
			createdAt: 1,
			followUps: [{ question: "older follow-up", answer: "more", status: "complete", createdAt: 3, updatedAt: 3 }],
		});
		const extra = Array.from({ length: 4 }, (_, index) =>
			record({ id: `extra-${index}`, question: `extra question ${index}`, status: "complete" }),
		);
		command.mockImplementationOnce(async () => ok("get_btw_history", { records: [newer, older, ...extra] }));

		await mount();

		expect(document.body.textContent).toContain("newer question");
		expect(document.body.textContent).not.toContain("older question");
		expect(topicRows()).toHaveLength(0);
		await click(buttonWithText(translate("btw.history")));
		expect(document.querySelector('[role="dialog"]')).not.toBeNull();
		expect(document.body.textContent).toContain("older question");
		expect(document.body.textContent).toContain("newer answer");

		const rows = topicRows();
		expect(rows).toHaveLength(6);
		expect(rows[0]?.getAttribute("aria-pressed")).toBe("true");

		await click(buttonWithText("older question"));
		expect(document.body.textContent).toContain("older answer");
		expect(document.body.textContent).toContain("older follow-up");
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});

	it("sends a follow-up with the selected record id and a new question without one", async () => {
		const topic = record({ id: "topic-1", question: "why?", answer: "because", status: "complete" });
		command.mockImplementationOnce(async () => ok("get_btw_history", { records: [topic] }));

		await mount();
		await typeInto(textarea(), "more context");
		await pressEnter(textarea());

		expect(command).toHaveBeenCalledWith({ type: "btw", question: "more context", recordId: "topic-1" }, 120_000);

		await click(buttonWithText(translate("btw.newQuestion")));
		await typeInto(textarea(), "fresh question");
		await pressEnter(textarea());

		expect(command).toHaveBeenCalledWith({ type: "btw", question: "fresh question" }, 120_000);
	});

	it("offers Stop while the selected answer runs and cancels that topic", async () => {
		command.mockImplementationOnce(async () => ok("get_btw_history", { records: [record()] }));

		await mount();
		await click(buttonWithText(translate("btw.cancel")));

		expect(command.mock.calls.map(([cmd]) => cmd)).toContainEqual({ type: "btw_cancel", recordId: "topic-1" });
	});

	it("branches a completed side conversation into the main chat", async () => {
		await mount();
		await typeInto(textarea(), "branch me");
		await pressEnter(textarea());
		await act(async () => {
			useBtwStore.getState().applyFrame({
				type: "btw_record",
				record: record({ id: "new-topic", question: "branch me", answer: "ok", status: "complete" }),
			});
		});

		const branch = buttonWithText(translate("btw.branch"));
		expect(branch).toBeDefined();
		expect(branch?.disabled).toBe(false);

		await click(branch);
		expect(command.mock.calls.map(([cmd]) => cmd)).toContainEqual({ type: "btw_branch" });
	});

	it("appends streamed deltas to the selected running answer", async () => {
		command.mockImplementationOnce(async () => ok("get_btw_history", { records: [record()] }));

		await mount();
		await act(async () => {
			useBtwStore.getState().applyFrame({ type: "btw_delta", recordId: "topic-1", delta: "streaming text" });
		});

		expect(document.body.textContent).toContain("streaming text");
	});

	it("sets a drafted steering prompt apart and sends it to the main session", async () => {
		const answer = "Try this: <inject>Fix the failing build first.</inject> Then rerun.";
		command.mockImplementationOnce(async () =>
			ok("get_btw_history", { records: [record({ answer, status: "complete", inject: "ready" })] }),
		);

		await mount();
		const block = document.querySelector("[data-btw-inject]") as unknown as TestElement | null;
		expect(block?.textContent).toContain("Fix the failing build first.");
		expect(document.body.textContent).not.toContain("<inject>");

		await click(buttonWithText(translate("btw.injectSend")));
		expect(command.mock.calls.map(([cmd]) => cmd)).toContainEqual({ type: "btw_inject", recordId: "topic-1" });

		await act(async () => {
			useBtwStore.getState().applyFrame({
				type: "btw_record",
				record: record({ answer, status: "complete", inject: "sent" }),
			});
		});
		expect(document.body.textContent).toContain(translate("btw.injectSent"));
		expect(buttonWithText(translate("btw.injectSend"))).toBeUndefined();
	});

	it("leaves an answer asked without the setting as plain text", async () => {
		const answer = "Mentioning <inject>this</inject> in prose.";
		command.mockImplementationOnce(async () =>
			ok("get_btw_history", { records: [record({ answer, status: "complete" })] }),
		);

		await mount();
		expect(document.querySelector("[data-btw-inject]")).toBeNull();
		expect(buttonWithText(translate("btw.injectSend"))).toBeUndefined();
	});

	it("stages clipboard images locally, removes individual previews, then sends text and remaining images", async () => {
		enableImages();
		await mount();
		await pasteImages([{ type: "image/png" } as File, { type: "image/png" } as File]);
		expect(document.querySelectorAll("[data-btw-attachments] img")).toHaveLength(2);
		expect(command.mock.calls.map(([cmd]) => cmd.type)).not.toContain("btw");
		const remove = document.querySelector("[data-btw-attachments] button") as unknown as TestElement;
		await click(remove);
		expect(document.querySelectorAll("[data-btw-attachments] img")).toHaveLength(1);
		await typeInto(textarea(), "What is shown?");
		await pressEnter(textarea());
		expect(command).toHaveBeenCalledWith(
			{
				type: "btw",
				question: "What is shown?",
				images: [{ type: "image", mimeType: "image/png", data: "cGljdHVyZQ==" }],
			},
			120_000,
		);
		expect(document.querySelector("[data-btw-attachments]")).toBeNull();
	});

	it("sends an image-only question with the translated short prompt", async () => {
		enableImages();
		await mount();
		await pasteImages();
		await pressEnter(textarea());
		expect(command).toHaveBeenCalledWith(
			{
				type: "btw",
				question: translate("btw.imageQuestion"),
				images: [{ type: "image", mimeType: "image/png", data: "cGljdHVyZQ==" }],
			},
			120_000,
		);
	});

	it("reports unsupported vision instead of silently discarding or sending an image", async () => {
		useModelStore.setState({
			model: { id: "text", provider: "test", api: "openai-completions", input: ["text"] } as ModelInfo,
		});
		await mount();
		await pasteImages();
		expect(document.querySelector('[role="alert"]')?.textContent).toContain(translate("btw.imagesUnsupported"));
		expect(document.querySelector("[data-btw-attachments]")).toBeNull();
		expect(command.mock.calls.map(([cmd]) => cmd.type)).not.toContain("btw");
	});

	it("retains the image draft when sending fails", async () => {
		enableImages();
		await mount();
		await pasteImages();
		command.mockImplementationOnce(async () => ({
			type: "response",
			command: "btw",
			success: false,
			error: "offline",
		}));
		await pressEnter(textarea());
		expect(document.querySelector('[role="alert"]')?.textContent).toContain("offline");
		expect(document.querySelectorAll("[data-btw-attachments] img")).toHaveLength(1);
	});

	it("allows undeclared model capabilities to reach Core rather than rejecting custom models", async () => {
		enableImages();
		useModelStore.setState({ model: null });
		await mount();
		await pasteImages();
		await pressEnter(textarea());
		expect(command.mock.calls.map(([cmd]) => cmd.type)).toContain("btw");
	});

	it("shows persisted images from the selected history turn", async () => {
		command.mockImplementationOnce(async () =>
			ok("get_btw_history", {
				records: [
					record({ status: "complete", images: [{ type: "image", mimeType: "image/png", data: "cGljdHVyZQ==" }] }),
				],
			}),
		);
		await mount();
		expect(document.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,cGljdHVyZQ==");
	});

	it("does not restore images from a pending read after starting a new question", async () => {
		enableImages();
		let finish: (() => void) | undefined;
		vi.stubGlobal(
			"FileReader",
			class {
				result = "data:image/png;base64,cGljdHVyZQ==";
				onload: (() => void) | null = null;
				readAsDataURL() {
					finish = () => this.onload?.();
				}
			},
		);
		await mount();
		await pasteImages();
		await pressEnter(textarea());
		expect(command.mock.calls.map(([cmd]) => cmd.type)).not.toContain("btw");
		await click(buttonWithText(translate("btw.newQuestion")));
		await act(async () => finish?.());
		expect(document.querySelector("[data-btw-attachments]")).toBeNull();
	});

	it("shows the empty state when the session has no topics", async () => {
		await mount();

		expect(document.body.textContent).toContain(translate("btw.empty"));
		expect(document.body.textContent).toContain(translate("btw.emptyHint"));
	});
});
