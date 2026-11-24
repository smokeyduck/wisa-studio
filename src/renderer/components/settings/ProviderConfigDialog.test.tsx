import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, test, vi } from "vitest";
import type { CustomProviderInput, CustomProviderView } from "../../../shared/ipc-types";
import type {
	DiscoveredModel,
	DiscoverProviderModelsParams,
	ProvidersResult,
	RpcResponse,
} from "../../../shared/rpc-types";
import { I18nProvider, translate } from "../../lib/i18n";
import { useModelStore } from "../../stores/model";
import { useUiStore } from "../../stores/ui";
import { defaultProviderDiscovery, ProviderConfigDialog, providerRequiresManualModels } from "./ProviderConfigDialog";
import { mergeFetchedModels } from "./providers/ModelFetchPanel";

describe("custom provider discovery defaults", () => {
	test("keeps /v1/models discovery opt-in for new providers", () => {
		expect(defaultProviderDiscovery()).toBeUndefined();
	});

	test("allows a discovery-only provider without a hand-written model row", () => {
		expect(providerRequiresManualModels("openai-models-list")).toBe(false);
		expect(providerRequiresManualModels(undefined)).toBe(true);
	});
});

const { document, window, Event, HTMLElement, Element, Node } = parseHTML("<html><body></body></html>");
const globals = globalThis as Record<string, unknown>;
Object.assign(globals, { document, window, Event, HTMLElement, Element, Node, IS_REACT_ACT_ENVIRONMENT: true });
globals.requestAnimationFrame = (callback: () => void) => setTimeout(callback, 0);
// linkedom has no layout: the form scrolls its first error into view.
(HTMLElement.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};

const emptyCatalog: ProvidersResult = {
	providers: [],
	models: [],
	discoveryStates: [],
	refreshPending: false,
	generation: 1,
};
const upsertProvider = vi.fn(async (_input: CustomProviderInput) => {});
const deleteProvider = vi.fn(async (_id: string) => {});
const listProviders = vi.fn(async (): Promise<CustomProviderView[]> => []);
const getAvailableModels = vi.fn(
	async (): Promise<RpcResponse> => ({
		type: "response",
		command: "get_available_models",
		success: true,
		data: { models: [] },
	}),
);
const getProviders = vi.fn(
	async (): Promise<RpcResponse> => ({
		type: "response",
		command: "get_providers",
		success: true,
		data: emptyCatalog,
	}),
);
const discoverProviderModels = vi.fn(
	async (_params: DiscoverProviderModelsParams): Promise<RpcResponse> => ({
		type: "response",
		command: "discover_provider_models",
		success: true,
		data: { models: [] },
	}),
);
function discovered(id: string, patch: Partial<DiscoveredModel> = {}): DiscoveredModel {
	return { id, name: id, reasoning: false, input: ["text"], contextWindow: null, maxTokens: null, ...patch };
}
function endpointLists(models: DiscoveredModel[]): void {
	discoverProviderModels.mockResolvedValueOnce({
		type: "response",
		command: "discover_provider_models",
		success: true,
		data: { models },
	});
}
Object.assign(window as unknown as Record<string, unknown>, {
	omp: {
		models: { listProviders, upsertProvider, deleteProvider },
		rpc: { getProviders, getAvailableModels, discoverProviderModels },
	},
});

function mockProvider(): CustomProviderView {
	return {
		id: "mock",
		api: "openai-completions",
		baseUrl: "http://127.0.0.1:9/v1",
		hasApiKey: false,
		auth: "none",
		models: [{ id: "mock-1", name: "Mock One" }],
		builtin: false,
	};
}

const roots: Root[] = [];

async function mountDialog(): Promise<void> {
	const root = createRoot(document.body as unknown as Element);
	roots.push(root);
	const Mounted = () => {
		const open = useUiStore(s => s.providerConfigOpen);
		const edit = useUiStore(s => s.providerConfigEdit);
		const close = useUiStore(s => s.closeProviderConfig);
		return <ProviderConfigDialog open={open} editProvider={edit} onClose={close} />;
	};
	await act(async () => {
		root.render(
			<I18nProvider>
				<Mounted />
			</I18nProvider>,
		);
	});
}

function text(): string {
	return document.body.textContent ?? "";
}

function button(label: string): HTMLButtonElement {
	const found = Array.from(document.body.querySelectorAll("button")).findLast(
		candidate => (candidate.textContent ?? "").trim() === label || candidate.getAttribute("aria-label") === label,
	);
	if (!found) throw new Error(`no button "${label}"`);
	return found as HTMLButtonElement;
}

async function click(label: string): Promise<void> {
	await act(async () => {
		button(label).click();
		await new Promise(resolve => setTimeout(resolve, 0));
	});
}

/** Drive a controlled field through React's own onChange (linkedom fires no input events). */
async function change(selector: string, value: string): Promise<void> {
	const element = document.body.querySelector(selector);
	if (!element) throw new Error(`no field ${selector}`);
	const record = element as unknown as Record<string, unknown>;
	const propsKey = Object.getOwnPropertyNames(record).find(key => key.startsWith("__reactProps$"));
	const props = propsKey ? (record[propsKey] as { onChange?: (event: object) => void }) : undefined;
	if (element.tagName === "SELECT") {
		await act(async () => props?.onChange?.({ target: { value }, currentTarget: { value } }));
	} else {
		(element as unknown as { value: string }).value = value;
		await act(async () => props?.onChange?.({ target: element, currentTarget: element }));
	}
}

async function fillLocalServer(): Promise<void> {
	await change(`input[placeholder="${translate("providerCfg.form.idPlaceholder")}"]`, "local-llm");
	await change(`input[placeholder="${translate("providerCfg.form.baseUrlPlaceholder")}"]`, "http://127.0.0.1:9/v1");
	await change(`input[placeholder="${translate("providerCfg.form.modelIdPlaceholder")}"]`, "m1");
}

afterEach(async () => {
	for (const root of roots) {
		await act(async () => root.unmount());
	}
	roots.length = 0;
	while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
	useUiStore.getState().closeProviderConfig();
	useUiStore.getState().closeProviders();
	useModelStore.getState().reset();
	upsertProvider.mockClear();
	getProviders.mockClear();
	getAvailableModels.mockReset();
	getAvailableModels.mockResolvedValue({
		type: "response",
		command: "get_available_models",
		success: true,
		data: { models: [] },
	});
	discoverProviderModels.mockClear();
	deleteProvider.mockClear();
	listProviders.mockReset();
	listProviders.mockResolvedValue([]);
});

describe("ProviderConfigDialog", () => {
	it("refuses a keyless provider with models until its auth mode says no key is needed", async () => {
		// Saved as-is, the agent rejects all of models.yml and every custom
		// provider leaves the model picker — the one in use included.
		useUiStore.getState().openProviderConfig("new");
		await mountDialog();
		await fillLocalServer();

		await click(translate("providerCfg.form.add"));
		expect(upsertProvider).not.toHaveBeenCalled();
		expect(text()).toContain(translate("providerCfg.form.apiKeyRequired"));

		const authSelect = Array.from(document.body.querySelectorAll("select")).find(select =>
			Array.from(select.querySelectorAll("option")).some(option => option.getAttribute("value") === "none"),
		);
		if (!authSelect) throw new Error("no auth select");
		const record = authSelect as unknown as Record<string, unknown>;
		const propsKey = Object.getOwnPropertyNames(record).find(key => key.startsWith("__reactProps$"));
		const props = propsKey ? (record[propsKey] as { onChange: (event: object) => void }) : undefined;
		await act(async () => props?.onChange({ target: { value: "none" } }));

		await click(translate("providerCfg.form.add"));
		expect(upsertProvider).toHaveBeenCalledOnce();
		expect(getProviders).toHaveBeenCalledWith(true);
		expect(upsertProvider.mock.calls[0]?.[0]).toMatchObject({
			id: "local-llm",
			auth: "none",
			models: [{ id: "m1" }],
		});
	});

	it("saves Auto with concrete endpoint protocols, not model-name guesses", async () => {
		useUiStore.getState().openProviderConfig("new");
		await mountDialog();
		await fillLocalServer();
		await change('input[type="password"]', "key");
		await change(
			`input[placeholder="${translate("providerCfg.form.modelIdPlaceholder")}"]`,
			"claude-through-gateway",
		);
		await click(translate("providerCfg.form.add"));
		expect(upsertProvider.mock.calls[0]?.[0]).toMatchObject({
			models: [{ id: "claude-through-gateway", api: "openai-completions" }],
		});
		expect(upsertProvider.mock.calls[0]?.[0]?.api).toBeUndefined();
	});

	it.each([
		["https://api.openai.com/v1", "openai-responses"],
		["https://api.anthropic.com/v1", "anthropic-messages"],
	])("uses native endpoint protocol for Auto at %s", async (url, api) => {
		useUiStore.getState().openProviderConfig("new");
		await mountDialog();
		await fillLocalServer();
		await change('input[type="password"]', "key");
		await change(`input[placeholder="${translate("providerCfg.form.baseUrlPlaceholder")}"]`, url);
		await click(translate("providerCfg.form.add"));
		expect(upsertProvider.mock.calls[0]?.[0]?.models[0]?.api).toBe(api);
	});

	it("uses saved runtime metadata and preserves an explicit per-model override", async () => {
		const saved = {
			...mockProvider(),
			api: undefined,
			models: [{ id: "responses" }, { id: "messages", api: "anthropic-messages" as const }],
		};
		useModelStore.setState({
			availableModels: [
				{ provider: "mock", id: "responses", api: "openai-responses" },
				{ provider: "mock", id: "messages", api: "openai-completions" },
			],
		});
		useUiStore.getState().openProviderConfig(saved);
		await mountDialog();
		await click(translate("providerCfg.form.save"));
		expect(getProviders).toHaveBeenCalledWith(true);
		expect(upsertProvider.mock.calls[0]?.[0]?.models).toMatchObject([
			{ id: "responses", api: "openai-responses" },
			{ id: "messages", api: "anthropic-messages" },
		]);
	});

	it("ignores saved catalog API after changing a model endpoint", async () => {
		useModelStore.setState({ availableModels: [{ provider: "mock", id: "responses", api: "openai-responses" }] });
		useUiStore.getState().openProviderConfig({ ...mockProvider(), api: undefined, models: [{ id: "responses" }] });
		await mountDialog();
		const expand = document.querySelector(`button[aria-label="${translate("providerCfg.form.modelExpand")}"]`);
		await act(async () => {
			(expand as unknown as HTMLElement)?.click();
		});
		await change(
			`input[placeholder="${translate("providerCfg.form.modelBaseUrlPlaceholder")}"]`,
			"https://api.anthropic.com/v1",
		);
		await click(translate("providerCfg.form.save"));
		expect(upsertProvider.mock.calls[0]?.[0]?.models[0]).toMatchObject({
			baseUrl: "https://api.anthropic.com/v1",
			api: "anthropic-messages",
		});
	});

	it("shows automatically discovered models without pinning untouched rows, and saves an edited API override", async () => {
		const runtimeModels = [
			{ provider: "mock", id: "runtime-a", name: "Runtime A", api: "openai-responses" },
			{ provider: "mock", id: "runtime-b", name: "Runtime B", api: "openai-completions" },
		];
		getAvailableModels.mockResolvedValue({
			type: "response",
			command: "get_available_models",
			success: true,
			data: { models: runtimeModels },
		});
		useModelStore.setState({ availableModels: runtimeModels });
		const saved = { ...mockProvider(), api: undefined, discovery: { type: "proxy" as const }, models: [] };
		useUiStore.getState().openProviderConfig(saved);
		await mountDialog();
		const names = Array.from(
			document.querySelectorAll(`input[placeholder="${translate("providerCfg.form.modelNamePlaceholder")}"]`),
		) as unknown as HTMLInputElement[];
		expect(names.map(input => input.value)).toContain("Runtime A");
		expect(names.map(input => input.value)).toContain("Runtime B");
		await click(translate("providerCfg.form.save"));
		expect(upsertProvider.mock.calls[0]?.[0]?.models).toEqual([]);
		await act(async () => {
			useUiStore.getState().openProviderConfig({ ...saved });
		});
		const ids = Array.from(
			document.querySelectorAll(`input[placeholder="${translate("providerCfg.form.modelIdPlaceholder")}"]`),
		) as unknown as HTMLInputElement[];
		const row = ids.find(input => input.value === "runtime-a")?.parentElement;
		expect(row).toBeDefined();
		await act(async () => {
			row?.querySelector<HTMLButtonElement>(
				`button[aria-label="${translate("providerCfg.form.modelExpand")}"]`,
			)?.click();
		});
		await change('label select:has(option[value="anthropic-messages"])', "anthropic-messages");
		await click(translate("providerCfg.form.save"));
		expect(upsertProvider.mock.calls[1]?.[0]?.models).toMatchObject([{ id: "runtime-a", api: "anthropic-messages" }]);
		expect(upsertProvider.mock.calls[1]?.[0]?.models).toHaveLength(1);
	});

	it("inherits the gateway protocol for discovered vendor names without saving untouched overrides", async () => {
		const ids = ["claude", "gpt", "gemini", "grok", "capcuttts"];
		const runtimeModels = ids.map(id => ({ provider: "mock", id, api: "openai-completions" }));
		getAvailableModels.mockResolvedValue({
			type: "response",
			command: "get_available_models",
			success: true,
			data: { models: runtimeModels },
		});
		useModelStore.setState({ availableModels: runtimeModels });
		useUiStore.getState().openProviderConfig({
			...mockProvider(),
			discovery: { type: "openai-models-list" },
			models: [{ id: "explicit", api: "openai-responses" }],
		});
		await mountDialog();
		const modelInputs = Array.from(
			document.querySelectorAll(`input[placeholder="${translate("providerCfg.form.modelIdPlaceholder")}"]`),
		) as unknown as HTMLInputElement[];
		for (const id of ids) {
			const row = modelInputs.find(input => input.value === id)?.parentElement;
			expect(row?.textContent).toContain(translate("providerCfg.form.modelApiAuto", { api: "openai-completions" }));
		}
		const explicitRow = modelInputs.find(input => input.value === "explicit")?.parentElement;
		expect(explicitRow?.textContent).not.toContain(
			translate("providerCfg.form.modelApiAuto", { api: "openai-completions" }),
		);
		await click(translate("providerCfg.form.save"));
		expect(upsertProvider.mock.calls[0]?.[0]?.models).toEqual([{ id: "explicit", api: "openai-responses" }]);
	});

	it("activates Wisa family defaults only after clearing an explicit provider API", async () => {
		const runtimeModels = ["claude-opus-4-6", "gpt-6-sol", "gemini-4-argon"].map(id => ({
			provider: "wisa",
			id,
			api: "openai-completions",
		}));
		getAvailableModels.mockResolvedValue({
			type: "response",
			command: "get_available_models",
			success: true,
			data: { models: runtimeModels },
		});
		useModelStore.setState({ availableModels: runtimeModels });
		useUiStore.getState().openProviderConfig({
			...mockProvider(),
			id: "wisa",
			baseUrl: "https://api.askwisa.com/v1",
			discovery: { type: "openai-models-list" },
			models: [{ id: "explicit", api: "openai-completions" }],
		});
		await mountDialog();
		await click(translate("providerCfg.form.wisaApiUseFamilies"));
		expect(text()).toContain(translate("providerCfg.form.modelApiAuto", { api: "anthropic-messages" }));
		expect(text()).toContain(translate("providerCfg.form.modelApiAuto", { api: "openai-responses" }));
		expect(text()).toContain(translate("providerCfg.form.modelApiAuto", { api: "openai-completions" }));
		await click(translate("providerCfg.form.save"));
		expect(upsertProvider.mock.calls[0]?.[0]?.api).toBeUndefined();
		expect(upsertProvider.mock.calls[0]?.[0]?.models).toEqual([{ id: "explicit", api: "openai-completions" }]);
	});

	it("uses Wisa family policy over an old runtime catalog when provider API is already unset", async () => {
		const runtimeModels = ["claude-opus-4-6", "gpt-6-sol", "gemini-4-argon"].map(id => ({
			provider: "wisa",
			id,
			api: "openai-completions",
		}));
		getAvailableModels.mockResolvedValue({
			type: "response",
			command: "get_available_models",
			success: true,
			data: { models: runtimeModels },
		});
		useModelStore.setState({ availableModels: runtimeModels });
		useUiStore.getState().openProviderConfig({
			...mockProvider(),
			id: "wisa",
			api: undefined,
			baseUrl: "https://api.askwisa.com/v1",
			discovery: { type: "openai-models-list" },
			models: [{ id: "explicit", api: "openai-completions" }],
		});
		await mountDialog();
		expect(text()).toContain(translate("providerCfg.form.modelApiAuto", { api: "anthropic-messages" }));
		expect(text()).toContain(translate("providerCfg.form.modelApiAuto", { api: "openai-responses" }));
		await click(translate("providerCfg.form.save"));
		expect(upsertProvider.mock.calls[0]?.[0]?.models).toEqual([{ id: "explicit", api: "openai-completions" }]);
	});

	it("reads effective saved endpoint routes through the existing catalog RPC before saving fetched models", async () => {
		getAvailableModels.mockResolvedValue({
			type: "response",
			command: "get_available_models",
			success: true,
			data: { models: [{ provider: "mock", id: "resolved", api: "anthropic-messages" }] },
		});
		endpointLists([discovered("resolved")]);
		useUiStore.getState().openProviderConfig({ ...mockProvider(), api: undefined, models: [] });
		await mountDialog();
		await click(translate("providerCfg.fetch.action"));
		await click(translate("providerCfg.fetch.add", { count: 1 }));
		await click(translate("providerCfg.form.save"));
		expect(upsertProvider.mock.calls[0]?.[0]?.models).toMatchObject([{ id: "resolved", api: "anthropic-messages" }]);
	});

	it("fetches the endpoint's models into editable rows and saves them as an explicit list", async () => {
		endpointLists([
			discovered("big-model", { name: "Big Model", contextWindow: 200_000 }),
			discovered("small-model"),
		]);
		useUiStore.getState().openProviderConfig("new");
		await mountDialog();
		await change(`input[placeholder="${translate("providerCfg.form.idPlaceholder")}"]`, "local-llm");
		await change(`input[placeholder="${translate("providerCfg.form.baseUrlPlaceholder")}"]`, "http://127.0.0.1:9/v1");
		await change('input[type="password"]', "typed-key");

		await click(translate("providerCfg.fetch.action"));
		expect(discoverProviderModels).toHaveBeenCalledOnce();
		const request = discoverProviderModels.mock.calls[0]?.[0];
		expect(request).toMatchObject({ baseUrl: "http://127.0.0.1:9/v1", apiKey: "typed-key" });
		// A provider that doesn't exist yet has no saved key to borrow.
		expect(request?.provider).toBeUndefined();

		await click(translate("providerCfg.fetch.add", { count: 2 }));
		const idField = `input[placeholder="${translate("providerCfg.form.modelIdPlaceholder")}"]`;
		const ids = Array.from(document.body.querySelectorAll(idField)) as unknown as HTMLInputElement[];
		expect(ids.map(field => field.value)).toEqual(["big-model", "small-model"]);

		await change(idField, "big-model-renamed");
		await click(translate("providerCfg.form.add"));
		expect(upsertProvider.mock.calls[0]?.[0]).toMatchObject({
			id: "local-llm",
			models: [{ id: "big-model-renamed", name: "Big Model", contextWindow: 200_000 }, { id: "small-model" }],
		});
		// Fetching once doesn't sign the provider up for automatic updates.
		expect(upsertProvider.mock.calls[0]?.[0]?.discovery).toBeUndefined();
	});

	it("asks with the saved key only when editing the provider it belongs to", async () => {
		const saved = { ...mockProvider(), hasApiKey: true, auth: undefined };
		endpointLists([discovered("mock-1"), discovered("mock-2")]);
		useUiStore.getState().openProviderConfig(saved);
		await mountDialog();

		await click(translate("providerCfg.fetch.action"));
		expect(discoverProviderModels.mock.calls[0]?.[0]).toMatchObject({ provider: "mock" });
		expect(discoverProviderModels.mock.calls[0]?.[0]?.apiKey).toBeUndefined();

		// The row that's already there isn't offered again or replaced.
		await click(translate("providerCfg.fetch.add", { count: 1 }));
		await click(translate("providerCfg.form.save"));
		expect(upsertProvider.mock.calls[0]?.[0]).toMatchObject({
			models: [{ id: "mock-1", name: "Mock One" }, { id: "mock-2" }],
		});
	});

	it("shows why a fetch failed and leaves the rows as they were", async () => {
		discoverProviderModels.mockResolvedValueOnce({
			type: "response",
			command: "discover_provider_models",
			success: false,
			error: "401 Unauthorized",
		});
		useUiStore.getState().openProviderConfig("new");
		await mountDialog();
		await fillLocalServer();

		const scrolled: unknown[] = [];
		const scrollIntoView = vi
			.spyOn(HTMLElement.prototype as unknown as { scrollIntoView: () => void }, "scrollIntoView")
			.mockImplementation(function (this: unknown) {
				scrolled.push(this);
			});
		await click(translate("providerCfg.fetch.action"));
		expect(text()).toContain("The server rejected your credentials (401)");
		// The button can sit at the form's bottom edge; the failure must not land out of sight.
		expect(scrolled.some(node => (node as { textContent: string }).textContent.includes("(401)"))).toBe(true);
		scrollIntoView.mockRestore();
		const field = document.body.querySelector(
			`input[placeholder="${translate("providerCfg.form.modelIdPlaceholder")}"]`,
		) as unknown as HTMLInputElement;
		expect(field.value).toBe("m1");
	});

	it("explains an unusable proxy instead of repeating Bun's error", async () => {
		discoverProviderModels.mockResolvedValueOnce({
			type: "response",
			command: "discover_provider_models",
			success: false,
			error: 'UnsupportedProxyProtocol fetching "http://localhost:11434/v1/models". For more information, pass `verbose: true` in the second argument to fetch()',
		});
		useUiStore.getState().openProviderConfig("new");
		await mountDialog();
		await fillLocalServer();

		await click(translate("providerCfg.fetch.action"));
		expect(text()).toContain(translate("proxy.unsupportedError"));
		expect(text()).not.toContain("UnsupportedProxyProtocol");
	});

	it("asks for a valid base URL instead of calling a fetch with none", async () => {
		useUiStore.getState().openProviderConfig("new");
		await mountDialog();

		await click(translate("providerCfg.fetch.action"));
		expect(discoverProviderModels).not.toHaveBeenCalled();
		expect(text()).toContain(translate("providerCfg.form.baseUrlRequired"));
	});

	it("leaves a long list unpicked until you choose", async () => {
		endpointLists(Array.from({ length: 21 }, (_, index) => discovered(`gateway-${index}`)));
		useUiStore.getState().openProviderConfig("new");
		await mountDialog();
		await fillLocalServer();

		await click(translate("providerCfg.fetch.action"));
		expect(button(translate("providerCfg.fetch.add", { count: 0 })).disabled).toBe(true);
		await click(translate("providerCfg.fetch.selectAll"));
		expect(button(translate("providerCfg.fetch.add", { count: 21 })).disabled).toBe(false);
	});

	it("shows each provider's own fields when the form is reopened for another one", async () => {
		// One dialog stays mounted across requests: the form must not keep the last one's values,
		// or saving writes them over the provider named in the title.
		const baseUrl = () =>
			(
				document.body.querySelector(
					`input[placeholder="${translate("providerCfg.form.baseUrlPlaceholder")}"]`,
				) as unknown as HTMLInputElement
			).value;
		useUiStore.getState().openProviderConfig("new");
		await mountDialog();

		await act(async () => useUiStore.getState().closeProviderConfig());
		await act(async () => useUiStore.getState().openProviderConfig(mockProvider()));
		expect(baseUrl()).toBe("http://127.0.0.1:9/v1");

		await act(async () => useUiStore.getState().closeProviderConfig());
		await act(async () =>
			useUiStore.getState().openProviderConfig({ ...mockProvider(), id: "other", baseUrl: "http://other.test/v1" }),
		);
		expect(baseUrl()).toBe("http://other.test/v1");

		await act(async () => useUiStore.getState().closeProviderConfig());
		await act(async () => useUiStore.getState().openProviderConfig("new"));
		expect(baseUrl()).toBe("");
	});

	it("opens straight into the add form and returns to the Providers window on Cancel", async () => {
		useUiStore.getState().openProviders();
		useUiStore.getState().openProviderConfig("new");
		await mountDialog();

		// No detour through the custom-provider list.
		expect(
			document.body.querySelector(`input[placeholder="${translate("providerCfg.form.idPlaceholder")}"]`),
		).not.toBeNull();

		await click(translate("providerCfg.form.cancel"));
		expect(useUiStore.getState().providerConfigOpen).toBe(false);
		// Cancel used to close the Providers window behind it as well.
		expect(useUiStore.getState().providersOpen).toBe(true);
	});

	it("deletes from the edit form the Providers window opens, then returns to the window", async () => {
		// Add provider now opens the form directly, so the edit form is the only
		// place the Providers window can reach Delete from.
		useUiStore.getState().openProviders();
		useUiStore.getState().openProviderConfig(mockProvider());
		await mountDialog();

		await click(translate("providerCfg.list.delete"));
		await click(translate("providerCfg.delete.confirm"));
		expect(deleteProvider).toHaveBeenCalledWith("mock");
		expect(getProviders).toHaveBeenCalledWith(true);
		expect(useUiStore.getState().providerConfigOpen).toBe(false);
		expect(useUiStore.getState().providersOpen).toBe(true);
	});

	it("warns before deleting the provider the session's model comes from", async () => {
		listProviders.mockResolvedValue([mockProvider()]);
		useModelStore.setState({ model: { provider: "mock", id: "mock-1", name: "Mock One" } });
		useUiStore.getState().openProviderConfig();
		await mountDialog();

		await click(translate("providerCfg.list.delete"));
		expect(text()).toContain(translate("providerCfg.delete.inUse", { model: "Mock One" }));
	});
});

describe("mergeFetchedModels", () => {
	test("keeps an edited row, adds only new ids and drops the empty starter row", () => {
		let key = 100;
		const merged = mergeFetchedModels(
			[
				{ key: 1, id: "kept", name: "My own name", contextWindow: 1234 },
				{ key: 2, id: "" },
			],
			[discovered("kept", { name: "Upstream name", contextWindow: 9999 }), discovered("fresh", { reasoning: true })],
			() => key++,
		);
		expect(merged).toEqual([
			{ key: 1, id: "kept", name: "My own name", contextWindow: 1234 },
			{ key: 100, id: "fresh", reasoning: true },
		]);
	});
});
