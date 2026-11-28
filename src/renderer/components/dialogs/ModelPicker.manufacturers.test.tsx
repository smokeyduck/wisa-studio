/**
 * Manufacturer-first index for gateway models: contiguous maker rows, searchable
 * headers, and selection retaining the original provider and model id.
 * Same linkedom harness as ModelPicker.test.tsx (no jsdom, no mock.module).
 */

import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import { createSessionRpcClient } from "../../../shared/rpc-client";
import type { ModelInfo, RpcResponse } from "../../../shared/rpc-types";
import { I18nProvider } from "../../lib/i18n";
import { useModelStore } from "../../stores/model";
import { useSessionStore } from "../../stores/session";
import { useUiStore } from "../../stores/ui";
import { ModelPicker } from "./ModelPicker";

const { document, window, Event, HTMLElement, Element, Node } = parseHTML("<html><body></body></html>");

const WISA_MODELS: ModelInfo[] = [
	{ provider: "wisa", id: "grok-4.7", name: "Grok 4.7" },
	{ provider: "wisa", id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
	{ provider: "wisa", id: "glm-5.3", name: "GLM 5.3" },
	{ provider: "wisa", id: "kimi-k3", name: "Kimi K3" },
	{ provider: "wisa", id: "glm-5.3-flash", name: "GLM 5.3 Flash" },
	{ provider: "wisa", id: "minimax-m3.1-flash", name: "MiniMax M3.1 Flash" },
	{ provider: "wisa", id: "nemotron-3-nano-omni-30b-a3b-reasoning", name: "Nemotron 3 Nano Omni" },
	{ provider: "wisa", id: "nemotron-3-ultra-550b-a55b", name: "Nemotron 3 Ultra" },
	{ provider: "wisa", id: "nemotron-3.5-super-vl-120b-a12b", name: "Nemotron 3.5 Super VL" },
	{ provider: "wisa", id: "step-5-preview", name: "Step 5 Preview" },
	{ provider: "wisa", id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash" },
];

/** Expected top-level maker groups, keyed by their visible header. */
const EXPECTED_MAKERS: Record<string, string[]> = {
	xAI: ["grok-4.7"],
	DeepSeek: ["deepseek-v4-pro", "deepseek-v4.1-flash"],
	"Z.ai": ["glm-5.3", "glm-5.3-flash"],
	Moonshot: ["kimi-k3"],
	MiniMax: ["minimax-m3.1-flash"],
	NVIDIA: ["nemotron-3-nano-omni-30b-a3b-reasoning", "nemotron-3-ultra-550b-a55b", "nemotron-3.5-super-vl-120b-a12b"],
	StepFun: ["step-5-preview"],
};

const command: Mock<(request: { type: string }) => Promise<RpcResponse>> = vi.fn(async request =>
	request.type === "get_login_providers"
		? { type: "response", command: request.type, success: true, data: { providers: [] } }
		: {
				type: "response",
				command: request.type,
				success: true,
				data: { models: WISA_MODELS, providers: [], discoveryStates: [], generation: 1 },
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
elementPrototype.getClientRects = () => [];
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
globals.requestAnimationFrame = (callback: () => void) => setTimeout(callback, 0);
globals.cancelAnimationFrame = (handle: number) => clearTimeout(handle);
Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });

let container: InstanceType<typeof HTMLElement>;
let root: Root;

async function openPicker(): Promise<void> {
	useSessionStore.setState({ status: "ready" });
	useUiStore.getState().openModelPicker();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	await act(async () => {
		root.render(
			<I18nProvider>
				<ModelPicker />
			</I18nProvider>,
		);
	});
	await act(async () => {
		await Promise.resolve();
	});
	await act(async () => {
		await Promise.resolve();
	});
}

function panel(): Element | null {
	return document.getElementById("omp-model-picker");
}

/** Model id of a rendered row: the name span carries the id as its title when a name is shown. */
function rowId(option: Element): string {
	return option.querySelector("span[title]")?.getAttribute("title") ?? option.textContent?.trim() ?? "";
}

/**
 * The search field as a DOM input. linkedom's element type is not the DOM
 * `HTMLInputElement` the React types expect; this is the one place it is bridged.
 */
function searchField(): HTMLInputElement {
	const input = panel()?.querySelector("input");
	if (!input) throw new Error("search input is not rendered");
	const field = input as unknown as HTMLInputElement;
	return field;
}

/** Dispatch inside act(); linkedom's Event has a getter-only eventPhase React writes to. */
async function dispatch(target: Element, event: object): Promise<void> {
	Object.defineProperty(event, "eventPhase", { value: 0, writable: true, configurable: true });
	await act(async () => {
		target.dispatchEvent(event as never);
	});
}

/**
 * Types into the search field by calling the rendered input's React onChange.
 * linkedom events never reach React's text-input handler (its value tracker
 * never sees a change), so the native-event route cannot drive this input here.
 * The handler is the same one React binds, so the filter and state path under test are real.
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

async function pressKey(key: string): Promise<void> {
	const event = new Event("keydown", { bubbles: true, cancelable: true });
	Object.defineProperty(event, "key", { value: key, configurable: true });
	await dispatch(searchField() as unknown as Element, event);
}

async function clickRow(id: string): Promise<void> {
	const option = Array.from(panel()?.querySelectorAll("[role='option']") ?? []).find(row => rowId(row) === id);
	if (!option) throw new Error(`no rendered row for ${id}`);
	await dispatch(option, new Event("click", { bubbles: true, cancelable: true }));
	await act(async () => {
		await Promise.resolve();
	});
}

function setModelCalls(): unknown[] {
	return command.mock.calls.map(([request]) => request).filter(request => request.type === "set_model");
}

afterEach(async () => {
	await act(async () => root?.unmount());
	container?.remove();
	useUiStore.getState().closeModelPicker();
	useModelStore.getState().reset();
	command.mockClear();
});

describe("ModelPicker manufacturer-first groups", () => {
	it("shows maker sections immediately without a Wisa wrapper", async () => {
		useModelStore.setState({ model: { provider: "wisa", id: "grok-4.7" }, availableModels: WISA_MODELS });
		await openPicker();

		const groups = Array.from(panel()?.querySelectorAll("section[role='group']") ?? []);
		const makers = groups.map(group => group.getAttribute("aria-label"));
		expect(makers).toEqual(expect.arrayContaining(Object.keys(EXPECTED_MAKERS)));
		expect(new Set(makers).size).toBe(makers.length);
		expect(makers).not.toContain("Wisa");
		expect(groups.every(group => group.querySelector("[role='option']"))).toBe(true);
	});

	it("orders makers by priority and models by finite INT, with unscored models last", async () => {
		const models: ModelInfo[] = [
			{ provider: "wisa", id: "gpt-low", name: "A low", int: 5 },
			{ provider: "wisa", id: "gemini-test", name: "Google model", int: 100 },
			{ provider: "wisa", id: "claude-test", name: "Anthropic model", int: 100 },
			{ provider: "wisa", id: "gpt-high", name: "Z high", int: 90 },
			{ provider: "direct", id: "gpt-high", name: "Z high", int: 90 },
			{ provider: "wisa", id: "gpt-tie-z", name: "Z tie", int: 50 },
			{ provider: "wisa", id: "gpt-tie-a", name: "A tie", int: 50 },
			{ provider: "wisa", id: "gpt-zero", name: "Zero", int: 0 },
			{ provider: "wisa", id: "gpt-unknown", name: "A unknown" },
			{ provider: "wisa", id: "gpt-invalid", name: "B invalid", int: NaN },
			{ provider: "wisa", id: "gpt-infinite", name: "C infinite", int: Infinity },
		];
		useModelStore.setState({ availableModels: models, catalogRefreshPending: true });
		await openPicker();
		const groups = Array.from(panel()?.querySelectorAll("section[role='group']") ?? []);
		expect(groups.map(group => group.getAttribute("aria-label"))).toEqual(["OpenAI", "Anthropic", "Google"]);
		expect(Array.from(groups[0].querySelectorAll("[role='option']")).map(rowId)).toEqual([
			"gpt-high",
			"gpt-high",
			"gpt-tie-a",
			"gpt-tie-z",
			"gpt-low",
			"gpt-zero",
			"gpt-unknown",
			"gpt-invalid",
			"gpt-infinite",
		]);
		await pressKey("Home");
		await pressKey("Enter");
		expect(setModelCalls()).toEqual([
			expect.objectContaining({ type: "set_model", provider: "direct", modelId: "gpt-high" }),
		]);
	});

	it("puts each maker's rows inside that maker's group", async () => {
		useModelStore.setState({ model: { provider: "wisa", id: "grok-4.7" }, availableModels: WISA_MODELS });
		await openPicker();

		const groups = Array.from(panel()?.querySelectorAll("section[role='group']") ?? []);
		for (const [maker, ids] of Object.entries(EXPECTED_MAKERS)) {
			const group = groups.find(section => section.getAttribute("aria-label") === maker);
			expect(group, maker).toBeDefined();
			const rows = Array.from(group?.querySelectorAll("[role='option']") ?? []).map(rowId);
			expect(rows.sort(), maker).toEqual([...ids].sort());
		}
	});

	it("keeps each maker's rows contiguous in the displayed list", async () => {
		useModelStore.setState({ model: { provider: "wisa", id: "grok-4.7" }, availableModels: WISA_MODELS });
		await openPicker();

		const rowMakers = Array.from(panel()?.querySelectorAll("[role='option']") ?? []).map(
			row => row.closest("section[role='group']")?.getAttribute("aria-label") ?? "",
		);
		// A maker appears in exactly one run: no label repeats after another starts.
		const runs = rowMakers.filter((maker, index) => maker !== rowMakers[index - 1]);
		expect(new Set(runs).size).toBe(runs.length);
	});

	it("finds Nemotron rows by the NVIDIA manufacturer name", async () => {
		useModelStore.setState({ model: { provider: "wisa", id: "grok-4.7" }, availableModels: WISA_MODELS });
		await openPicker();

		await typeQuery("NVIDIA");

		const found = Array.from(panel()?.querySelectorAll("[role='option']") ?? []).map(rowId);
		expect(found.sort()).toEqual([...EXPECTED_MAKERS.NVIDIA].sort());
	});

	it("clicking a row selects the wisa model by its actual id", async () => {
		useModelStore.setState({ model: { provider: "wisa", id: "grok-4.7" }, availableModels: WISA_MODELS });
		await openPicker();

		await clickRow("nemotron-3-ultra-550b-a55b");

		expect(setModelCalls()).toEqual([
			expect.objectContaining({ type: "set_model", provider: "wisa", modelId: "nemotron-3-ultra-550b-a55b" }),
		]);
	});

	it("keyboard Enter selects the row at the displayed position", async () => {
		useModelStore.setState({ model: { provider: "wisa", id: "grok-4.7" }, availableModels: WISA_MODELS });
		await openPicker();

		const displayed = Array.from(panel()?.querySelectorAll("[role='option']") ?? []).map(rowId);
		const expected = displayed[2];
		expect(expected).toBeDefined();

		await pressKey("Home");
		await pressKey("ArrowDown");
		await pressKey("ArrowDown");
		await pressKey("Enter");
		await act(async () => {
			await Promise.resolve();
		});

		expect(setModelCalls()).toEqual([
			expect.objectContaining({ type: "set_model", provider: "wisa", modelId: expected }),
		]);
	});
});
