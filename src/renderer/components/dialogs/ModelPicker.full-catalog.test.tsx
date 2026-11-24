/**
 * Full-catalog contract for the manufacturer-first picker. One real catalog
 * covers every maker the picker has to name: the Wisa gateway's bare ids, a
 * native Anthropic model, and a duplicate id served by another provider.
 * Ownership, search aliases and routing (mouse and keyboard) are asserted
 * against the rendered DOM; the RPC bridge is a real client over a stubbed
 * transport, as in the other picker tests.
 */

import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { createSessionRpcClient } from "../../../shared/rpc-client";
import type { ModelInfo, RpcResponse } from "../../../shared/rpc-types";
import { I18nProvider } from "../../lib/i18n";
import { useModelStore } from "../../stores/model";
import { useSessionStore } from "../../stores/session";
import { useUiStore } from "../../stores/ui";
import { ModelPicker } from "./ModelPicker";

const { document, window, Event, HTMLElement, Element, Node } = parseHTML("<html><body></body></html>");

/** Every model is named, so the row's title carries its raw id. */
function named(provider: string, id: string, name: string): ModelInfo {
	return { provider, id, name, int: 40 };
}

const WISA_IDS = [
	"grok-4.7",
	"deepseek-v4-pro",
	"glm-5.3",
	"kimi-k3",
	"glm-5.3-flash",
	"minimax-m3.1-flash",
	"nemotron-3-nano-omni-30b-a3b-reasoning",
	"nemotron-3-ultra-550b-a55b",
	"nemotron-3.5-super-vl-120b-a12b",
	"step-5-preview",
	"deepseek-v4.1-flash",
	"auto",
	"codex-auto-review",
	"grok-4.3",
	"grok-4.5",
	"grok-4.6",
	"grok-4.7-build-fast",
	"qwen3.8-flash",
	"qwen3.8-max",
	"kimi-k3.1-pro-standard",
	"grok-composer-2.5-fast-standard",
	"kimi-k3.1-pro-free",
	"deepseek-v4.1-flash-1017-standard",
	"capcut-tts",
];

const CATALOG: ModelInfo[] = [
	...WISA_IDS.map(id => named("wisa", id, `Name ${id}`)),
	named("anthropic", "claude-sonnet-5", "Claude Sonnet 5"),
	// Same id as a Wisa row, served by another provider: routing must keep xai.
	named("xai", "grok-4.7", "Grok 4.7 (xAI direct)"),
];

/**
 * Expected maker per row, keyed `provider/id`. This is the approved contract:
 * manufacturer-first groups, Auto stays under the Wisa gateway, codex maps to
 * OpenAI, Qwen keeps its canonical label, CapCut is its own maker.
 */
const EXPECTED_MAKER: Record<string, string> = {
	"wisa/grok-4.7": "xAI",
	"wisa/deepseek-v4-pro": "DeepSeek",
	"wisa/glm-5.3": "Z.ai",
	"wisa/kimi-k3": "Moonshot",
	"wisa/glm-5.3-flash": "Z.ai",
	"wisa/minimax-m3.1-flash": "MiniMax",
	"wisa/nemotron-3-nano-omni-30b-a3b-reasoning": "NVIDIA",
	"wisa/nemotron-3-ultra-550b-a55b": "NVIDIA",
	"wisa/nemotron-3.5-super-vl-120b-a12b": "NVIDIA",
	"wisa/step-5-preview": "StepFun",
	"wisa/deepseek-v4.1-flash": "DeepSeek",
	"wisa/auto": "Wisa",
	"wisa/codex-auto-review": "OpenAI",
	"wisa/grok-4.3": "xAI",
	"wisa/grok-4.5": "xAI",
	"wisa/grok-4.6": "xAI",
	"wisa/grok-4.7-build-fast": "xAI",
	"wisa/qwen3.8-flash": "Qwen",
	"wisa/qwen3.8-max": "Qwen",
	"wisa/kimi-k3.1-pro-standard": "Moonshot",
	"wisa/grok-composer-2.5-fast-standard": "xAI",
	"wisa/kimi-k3.1-pro-free": "Moonshot",
	"wisa/deepseek-v4.1-flash-1017-standard": "DeepSeek",
	"wisa/capcut-tts": "CapCut",
	"anthropic/claude-sonnet-5": "Anthropic",
	"xai/grok-4.7": "xAI",
};

const MAKERS = [...new Set(Object.values(EXPECTED_MAKER))].sort();

const command: Mock<(request: { type: string }) => Promise<RpcResponse>> = vi.fn(async request =>
	request.type === "get_login_providers"
		? { type: "response", command: request.type, success: true, data: { providers: [] } }
		: request.type === "set_model"
			? { type: "response", command: request.type, success: true, data: {} }
			: {
					type: "response",
					command: request.type,
					success: true,
					data: { models: CATALOG, providers: [], discoveryStates: [], generation: 1 },
				},
);

// Real tab RPC client over a stubbed transport, as in ModelPicker.test.tsx.
Object.assign(window, { omp: { rpc: createSessionRpcClient(command) } });

const globals = globalThis as Record<string, unknown>;
globals.document = document;
globals.window = window;
globals.Event = Event;
globals.HTMLElement = HTMLElement;
globals.Element = Element;
globals.Node = Node;
globals.IS_REACT_ACT_ENVIRONMENT = true;

const elementPrototype = HTMLElement.prototype as unknown as Record<string, unknown>;
if (typeof elementPrototype.focus !== "function") elementPrototype.focus = () => {};
if (typeof elementPrototype.scrollIntoView !== "function") elementPrototype.scrollIntoView = () => {};
elementPrototype.getClientRects = () => [{ width: 368, height: 20 }];
elementPrototype.getBoundingClientRect = () => ({
	x: 0,
	y: 0,
	top: 0,
	left: 0,
	bottom: 20,
	right: 368,
	width: 368,
	height: 20,
	toJSON: () => ({}),
});
globals.requestAnimationFrame = (callback: () => void) => setTimeout(callback, 0);
globals.cancelAnimationFrame = (handle: number) => clearTimeout(handle);
Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });

const initialSessionStatus = useSessionStore.getState().status;
let container: InstanceType<typeof HTMLElement> | undefined;
let root: Root | undefined;

async function openPicker(): Promise<void> {
	container = document.createElement("div") as unknown as InstanceType<typeof HTMLElement>;
	document.body.appendChild(container as never);
	root = createRoot(container as never);
	await act(async () => {
		useUiStore.getState().openModelPicker();
		root?.render(
			<I18nProvider>
				<ModelPicker />
			</I18nProvider>,
		);
	});
	await act(async () => {
		await Promise.resolve();
	});
}

function panel(): Element {
	const found = document.getElementById("omp-model-picker");
	if (!found) throw new Error("model picker panel is not rendered");
	return found;
}

/** Top-level maker groups: one per manufacturer, in render order. */
function makerGroups(): Element[] {
	return Array.from(panel().querySelectorAll("section[role='group']"));
}

/** `provider/id` for every rendered row, paired with the maker that owns it. */
function renderedOwnership(): Array<{ key: string; maker: string }> {
	return makerGroups().flatMap(group =>
		Array.from(group.querySelectorAll("[role='option']")).map(row => ({
			key: `${providerOf(row)}/${idOf(row)}`,
			maker: group.getAttribute("aria-label") ?? "",
		})),
	);
}

/** Which provider a row belongs to, read from the provider label the row shows. */
function providerOf(row: Element): string {
	const provider = row.querySelector("[data-model-provider]")?.textContent;
	if (!provider) throw new Error(`row shows no provider namespace: ${row.textContent}`);
	return provider;
}

/** The raw model id a row carries; the name span holds it as its title. */
function idOf(row: Element): string {
	const title = row.querySelector("span[title]")?.getAttribute("title");
	if (!title) throw new Error(`row has no id title: ${row.textContent}`);
	return title;
}

function searchField(): HTMLInputElement {
	const input = panel().querySelector("input");
	if (!input) throw new Error("search input is not rendered");
	return input as unknown as HTMLInputElement;
}

/**
 * Types into the search field by calling the rendered input's React onChange.
 * linkedom events never reach React's text-input handler, so the native-event
 * route cannot drive this input; the bound handler is the same one React uses.
 */
async function typeQuery(value: string): Promise<void> {
	const field = searchField();
	const reactProps = Object.keys(field).find(key => key.startsWith("__reactProps"));
	const props = reactProps
		? (field as unknown as Record<string, { onChange: (event: unknown) => void }>)[reactProps]
		: undefined;
	if (!props) throw new Error("React props are not attached to the search input");
	field.value = value;
	await act(async () => {
		props.onChange({ target: field, currentTarget: field, type: "change" });
	});
}

/** Finds the one rendered row for `provider/id`. */
function rowFor(key: string): Element {
	const [provider, ...rest] = key.split("/");
	const id = rest.join("/");
	const matches = Array.from(panel().querySelectorAll("[role='option']")).filter(
		row => providerOf(row) === provider && idOf(row) === id,
	);
	if (matches.length !== 1) throw new Error(`expected one row for ${key}, found ${matches.length}`);
	const [row] = matches;
	if (!row) throw new Error(`no row for ${key}`);
	return row;
}

async function clickRow(key: string): Promise<void> {
	const row = rowFor(key);
	await act(async () => {
		row.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
	});
	await act(async () => {
		await Promise.resolve();
	});
}

function keyDown(key: string): Event {
	return Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key });
}

/** Moves the active row to `key` with Home + ArrowDown, then presses Enter. */
async function pickWithKeyboard(key: string): Promise<void> {
	const index = Number(rowFor(key).getAttribute("data-option-index"));
	const input = searchField();
	await act(async () => {
		input.dispatchEvent(keyDown("Home"));
	});
	for (let step = 0; step < index; step++) {
		await act(async () => {
			input.dispatchEvent(keyDown("ArrowDown"));
		});
	}
	await act(async () => {
		input.dispatchEvent(keyDown("Enter"));
	});
	await act(async () => {
		await Promise.resolve();
	});
}

function setModelCalls(): Array<{ provider: string; modelId: string }> {
	return command.mock.calls
		.map(([request]) => request as { type: string; provider?: string; modelId?: string })
		.filter(request => request.type === "set_model")
		.map(request => ({ provider: request.provider ?? "", modelId: request.modelId ?? "" }));
}

beforeEach(() => {
	useModelStore.setState({ model: { provider: "wisa", id: "auto" }, availableModels: CATALOG });
	useSessionStore.setState({ status: "ready" });
});

afterEach(async () => {
	await act(async () => root?.unmount());
	container?.remove();
	useUiStore.getState().closeModelPicker();
	useModelStore.getState().reset();
	useSessionStore.setState({ status: initialSessionStatus });
	command.mockClear();
});

describe("ModelPicker full catalog", () => {
	it("owns every row under exactly one manufacturer group, manufacturer-first", async () => {
		await openPicker();

		const groupNames = makerGroups().map(group => group.getAttribute("aria-label") ?? "");
		expect([...groupNames].sort()).toEqual(MAKERS);
		expect(new Set(groupNames).size).toBe(groupNames.length);

		const ownership = renderedOwnership();
		expect(ownership.map(entry => entry.key).sort()).toEqual(Object.keys(EXPECTED_MAKER).sort());
		for (const { key, maker } of ownership) expect(maker).toBe(EXPECTED_MAKER[key]);
	});

	it("uses manufacturer artwork even when the connection is Wisa", async () => {
		await openPicker();

		const marks = Object.fromEntries(
			makerGroups().map(group => [
				group.getAttribute("aria-label"),
				group.querySelector("svg[data-brand]")?.getAttribute("data-brand"),
			]),
		);
		expect(marks).toEqual({
			Anthropic: "anthropic",
			CapCut: "capcut",
			DeepSeek: "deepseek",
			MiniMax: "minimax",
			Moonshot: "moonshot",
			NVIDIA: "nvidia",
			OpenAI: "openai",
			Qwen: "qwen",
			StepFun: "stepfun",
			Wisa: "generic",
			xAI: "xai",
			"Z.ai": "zai",
		});
	});

	it("keeps every maker group expanded without a click", async () => {
		await openPicker();
		for (const group of makerGroups()) {
			expect(group.querySelectorAll("[role='option']").length).toBeGreaterThan(0);
		}
	});

	it("searches by manufacturer label, case-insensitively", async () => {
		await openPicker();

		await typeQuery("NVIDIA");
		expect(
			renderedOwnership()
				.map(entry => entry.key)
				.sort(),
		).toEqual(
			Object.keys(EXPECTED_MAKER)
				.filter(key => EXPECTED_MAKER[key] === "NVIDIA")
				.sort(),
		);

		await typeQuery("qwen");
		expect(
			renderedOwnership()
				.map(entry => entry.key)
				.sort(),
		).toEqual(["wisa/qwen3.8-flash", "wisa/qwen3.8-max"]);
	});

	it("routes a duplicate id by mouse to the provider the row shows", async () => {
		await openPicker();

		await clickRow("xai/grok-4.7");
		expect(setModelCalls()).toEqual([{ provider: "xai", modelId: "grok-4.7" }]);
	});

	it("routes the Wisa row of the duplicate id to wisa by mouse", async () => {
		await openPicker();

		await clickRow("wisa/grok-4.7");
		expect(setModelCalls()).toEqual([{ provider: "wisa", modelId: "grok-4.7" }]);
	});

	it("routes a duplicate id by keyboard to the provider the row shows", async () => {
		await openPicker();
		await typeQuery("grok-4.7");

		await pickWithKeyboard("xai/grok-4.7");
		expect(setModelCalls()).toEqual([{ provider: "xai", modelId: "grok-4.7" }]);
	});
});
