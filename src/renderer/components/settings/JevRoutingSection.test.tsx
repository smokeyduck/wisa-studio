import { parseHTML } from "linkedom";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { createSessionRpcClient, type RpcTransport } from "../../../shared/rpc-client";
import type { ModelRoleEntry, ProviderInfo, RpcCommand, RpcResponse } from "../../../shared/rpc-types";
import { I18nProvider, translate } from "../../lib/i18n";
import { useModelStore } from "../../stores/model";
import { useSessionStore } from "../../stores/session";
import { useToastStore } from "../../stores/toast";
import { JevRoutingSection } from "./JevRoutingSection";

const { document, window, Event, CustomEvent, HTMLElement, Element, Node } = parseHTML("<html><body></body></html>");
const NATIVE_ID = "backend-native-judge-v7";
const SELECTOR = `typesafe/${NATIVE_ID}`;
const CHAT_MODEL = { provider: "anthropic", id: "chat-model", name: "Current chat" };

function roles(): ModelRoleEntry[] {
	return [
		{
			id: "default",
			name: "Default",
			section: "chat",
			source: "settings",
			model: "anthropic/chat-model",
			candidates: [{ ...CHAT_MODEL, kind: "chat" }],
		},
		{
			id: "judge",
			name: "Judge",
			section: "kind",
			source: "default",
			candidates: [
				{ provider: "typesafe", id: "another-native-judge", name: "Other native judge", kind: "judge" },
				{ provider: "typesafe", id: NATIVE_ID, name: "Backend native judge", kind: "judge" },
				{ provider: "typesafe", id: "chat-impostor", name: "Not a native judge", kind: "chat" },
				{ provider: "openai", id: "foreign-judge", name: "Other provider judge", kind: "judge" },
			],
		},
	];
}

interface BackendOptions {
	authenticated?: boolean;
	routing?: boolean;
	roleError?: string;
	settingError?: string;
	providerMissing?: boolean;
	refreshPending?: boolean;
	noJudgeModels?: boolean;
}

let root: Root | undefined;

beforeEach(() => {
	for (const [key, value] of Object.entries({
		document,
		window,
		Event,
		CustomEvent,
		HTMLElement,
		Element,
		Node,
		IS_REACT_ACT_ENVIRONMENT: true,
		requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0),
		cancelAnimationFrame: (handle: number) => clearTimeout(handle),
	})) {
		vi.stubGlobal(key, value);
	}
	useModelStore.getState().reset();
	useSessionStore.getState().reset();
	useSessionStore.getState().setStatus("ready", "/repo");
	useModelStore.setState({ model: CHAT_MODEL });
});

afterEach(async () => {
	await act(async () => root?.unmount());
	root = undefined;
	document.body.replaceChildren();
	Reflect.deleteProperty(window, "omp");
	useModelStore.getState().reset();
	useSessionStore.getState().reset();
	useToastStore.setState({ toasts: [] });
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

async function mount(options: BackendOptions = {}) {
	let authenticated = options.authenticated ?? true;
	let routing = options.routing ?? false;
	let backendRoles = roles();
	if (!authenticated || options.providerMissing || options.noJudgeModels) {
		backendRoles = backendRoles.map(role => (role.id === "judge" ? { ...role, candidates: [] } : role));
	}
	let generation = 0;
	if (routing) {
		backendRoles = backendRoles.map(role =>
			role.id === "judge"
				? { ...role, model: SELECTOR, selected: { provider: "typesafe", id: NATIVE_ID }, source: "settings" }
				: role,
		);
	}
	const command = vi.fn(async (request: RpcCommand): Promise<RpcResponse> => {
		const response = { type: "response" as const, command: request.type, success: true as const };
		switch (request.type) {
			case "get_providers": {
				const provider: ProviderInfo = {
					id: "typesafe",
					name: "TypeSafe",
					authenticated,
					loginAvailable: true,
					apiKeyLogin: true,
					disabled: false,
					modelCount: authenticated ? 2 : 0,
				};
				return {
					...response,
					data: {
						providers: options.providerMissing ? [] : [provider],
						models: [],
						discoveryStates: [],
						refreshPending: options.refreshPending ?? false,
						generation: ++generation,
					},
				};
			}
			case "get_settings":
				return { ...response, data: { values: { "task.judgeRouting": routing } } };
			case "get_model_roles":
				return { ...response, data: { roles: backendRoles } };
			case "set_api_key":
				authenticated = true;
				backendRoles = roles();
				return response;
			case "set_model_role":
				if (options.roleError) return { ...response, success: false, error: options.roleError };
				backendRoles = backendRoles.map(role =>
					role.id === request.role
						? { ...role, model: request.modelId ?? undefined, selected: { provider: "typesafe", id: NATIVE_ID } }
						: role,
				);
				return response;
			case "set_setting":
				if (options.settingError) return { ...response, success: false, error: options.settingError };
				routing = request.value === true;
				return response;
			default:
				throw new Error(`Unexpected RPC: ${request.type}`);
		}
	});
	const rpc = createSessionRpcClient(command);
	Object.assign(window, { omp: { rpc } });
	const onRefresh = vi.fn(async () => {});
	function Consumer() {
		const [entries, setEntries] = useState(backendRoles);
		return (
			<JevRoutingSection
				open
				roles={entries}
				onRefresh={async () => {
					await onRefresh();
					setEntries(backendRoles);
				}}
			/>
		);
	}
	root = createRoot(document.body as unknown as globalThis.Element);
	await act(async () =>
		root?.render(
			<I18nProvider>
				<Consumer />
			</I18nProvider>,
		),
	);
	await act(async () => {});
	return { command, onRefresh };
}

function button(label: string): HTMLButtonElement | undefined {
	return [...document.body.querySelectorAll("button")].find(node => node.textContent?.trim() === label) as
		| HTMLButtonElement
		| undefined;
}

async function click(label: string): Promise<void> {
	const target = button(label);
	expect(target, `Missing button: ${label}`).toBeDefined();
	expect(target?.disabled).toBe(false);
	await act(async () => target?.click());
}

// linkedom cannot dispatch React's controlled input change events itself.
function reactProps(element: unknown): Record<string, (event: object) => void | Promise<void>> {
	const record = element as Record<string, unknown>;
	const key = Object.getOwnPropertyNames(record).find(name => name.startsWith("__reactProps$"));
	return (key ? record[key] : {}) as Record<string, (event: object) => void | Promise<void>>;
}

async function selectNativeJudge(): Promise<void> {
	const select = document.body.querySelector('[aria-label="Judge model"]');
	expect(select).not.toBeNull();
	await act(async () =>
		reactProps(select).onChange?.({ target: { value: SELECTOR }, currentTarget: { value: SELECTOR } }),
	);
}

function writes(command: Mock<RpcTransport>): RpcCommand[] {
	return command.mock.calls.map(([request]) => request).filter(request => request.type.startsWith("set_"));
}

describe("JevRoutingSection", () => {
	it("connects with an API key, then saves the exact native judge before enabling routing without changing chat", async () => {
		const { command, onRefresh } = await mount({ authenticated: false });
		expect(writes(command)).toEqual([]);
		const details = document.body.querySelector("details");
		expect(details?.hasAttribute("open")).toBe(false);
		expect(button("Use API key")?.closest("details")).toBeNull();
		await click("Use API key");
		const input = document.body.querySelector('input[type="password"]');
		expect(input).not.toBeNull();
		await act(async () => reactProps(input).onChange?.({ target: { value: "test-typesafe-key" } }));
		expect(button("Save key")?.disabled).toBe(false);
		const form = document.body.querySelector("form");
		expect(form).not.toBeNull();
		await act(async () => reactProps(form).onSubmit?.({ preventDefault() {} }));
		expect(writes(command)).toEqual([{ type: "set_api_key", providerId: "typesafe", apiKey: "test-typesafe-key" }]);
		expect(
			command.mock.calls.some(([request]) => request.type === "get_providers" && request.forceRefresh === true),
		).toBe(true);
		expect(useModelStore.getState().providers.find(provider => provider.id === "typesafe")?.authenticated).toBe(true);
		expect(onRefresh).toHaveBeenCalled();
		expect(button("Use API key")).toBeUndefined();
		expect(document.body.querySelector("details")).toBe(details);
		expect(details?.hasAttribute("open")).toBe(false);
		expect(document.body.textContent).not.toContain("Jev routing enabled");

		await selectNativeJudge();
		expect(writes(command)).toHaveLength(1);
		await click("Enable Jev routing");
		expect(writes(command)).toEqual([
			{ type: "set_api_key", providerId: "typesafe", apiKey: "test-typesafe-key" },
			{ type: "set_model_role", role: "judge", modelId: SELECTOR, thinkingLevel: undefined },
			{ type: "set_setting", path: "task.judgeRouting", value: true },
		]);
		expect(useModelStore.getState().model).toEqual(CHAT_MODEL);
		expect(document.body.textContent).toContain("Jev routing enabled");
	});

	it("only offers native TypeSafe judge candidates, without saving on open or selection", async () => {
		const { command } = await mount();
		const select = document.body.querySelector('[aria-label="Judge model"]');
		const options = [...(select?.querySelectorAll("option") ?? [])].map(option => option.getAttribute("value"));
		expect(options).toContain(SELECTOR);
		expect(options).not.toContain("typesafe/chat-impostor");
		expect(options).not.toContain("openai/foreign-judge");
		await selectNativeJudge();
		expect(writes(command)).toEqual([]);
	});

	it("keeps connection controls collapsed after authentication and privacy visible beside enable", async () => {
		await mount();
		const details = document.body.querySelector("details");
		expect(details).not.toBeNull();
		expect(details?.hasAttribute("open")).toBe(false);
		expect(details?.querySelector("summary")?.textContent).toBe(translate("modelRoles.jev.details"));
		expect(button(translate("modelRoles.refresh"))?.closest("details")).toBe(details);
		expect(button(translate("providers.updateCredentials", { provider: "TypeSafe" }))?.closest("details")).toBe(
			details,
		);
		expect(details?.textContent).toContain(translate("modelRoles.jev.behavior"));
		const privacy = [...document.body.querySelectorAll("p")].find(
			node => node.textContent === translate("modelRoles.jev.privacy"),
		);
		expect(privacy).toBeDefined();
		expect(privacy?.closest("details")).toBeNull();
		expect(button("Enable Jev routing")?.closest("details")).toBeNull();
		expect(button("Enable Jev routing")?.parentElement).toBe(privacy?.previousElementSibling);
	});

	it("preserves the credential dialog and draft when authentication changes", async () => {
		const { command } = await mount({ authenticated: false });
		const details = document.body.querySelector("details");
		await click("Use API key");
		const input = document.body.querySelector('input[type="password"]');
		await act(async () => reactProps(input).onChange?.({ target: { value: "private-draft-key" } }));
		await act(async () =>
			useModelStore.setState(state => ({
				providers: state.providers.map(provider => ({ ...provider, authenticated: true })),
			})),
		);
		expect(document.body.querySelector("details")).toBe(details);
		expect(details?.hasAttribute("open")).toBe(false);
		expect(document.body.querySelector('input[type="password"]')).toBe(input);
		expect((input as unknown as HTMLInputElement).value).toBe("private-draft-key");
		expect(document.body.textContent).not.toContain("private-draft-key");
		expect(writes(command)).toEqual([]);
	});

	it("shows pending discovery without enabling routing or inventing Judge models", async () => {
		const { command } = await mount({ refreshPending: true, noJudgeModels: true });
		expect(document.body.textContent).toContain(translate("providers.refreshPending"));
		expect(document.body.textContent).not.toContain(translate("modelRoles.jev.noModels"));
		expect(document.body.querySelector('[aria-label="Judge model"]')).toBeNull();
		expect(button("Enable Jev routing")?.disabled).toBe(true);
		expect(writes(command)).toEqual([]);
	});

	it("explains when authenticated discovery has no native Judge models", async () => {
		await mount({ noJudgeModels: true });
		expect(document.body.textContent).toContain(translate("modelRoles.jev.noModels"));
		expect(button("Enable Jev routing")?.disabled).toBe(true);
	});

	it("does not enable routing when saving the judge role fails and shows the failure", async () => {
		const { command } = await mount({ roleError: "Judge selection rejected" });
		await selectNativeJudge();
		await click("Enable Jev routing");
		expect(writes(command)).toEqual([
			{ type: "set_model_role", role: "judge", modelId: SELECTOR, thinkingLevel: undefined },
		]);
		expect(document.body.querySelector('[role="alert"]')?.textContent).toContain("Judge selection rejected");
		expect(document.body.textContent).not.toContain("Jev routing enabled");
		expect(button("Turn off routing")).toBeUndefined();
	});

	it("does not claim routing is enabled if persisting the setting fails", async () => {
		const { command } = await mount({ settingError: "Routing setting rejected" });
		await selectNativeJudge();
		await click("Enable Jev routing");
		expect(writes(command).map(request => request.type)).toEqual(["set_model_role", "set_setting"]);
		expect(document.body.querySelector('[role="alert"]')?.textContent).toContain("Routing setting rejected");
		expect(document.body.textContent).not.toContain("Jev routing enabled");
		expect(button("Turn off routing")).toBeUndefined();
	});

	it("turns off only the routing flag, preserving the configured judge and chat model", async () => {
		const { command } = await mount({ routing: true });
		expect(document.body.textContent).toContain("Jev routing enabled");
		expect(writes(command)).toEqual([]);
		await click("Turn off routing");
		expect(writes(command)).toEqual([{ type: "set_setting", path: "task.judgeRouting", value: false }]);
		expect(useModelStore.getState().model).toEqual(CHAT_MODEL);
		expect(document.body.textContent).not.toContain("Jev routing enabled");
	});

	it("cannot enable unavailable TypeSafe and does not manufacture a native judge", async () => {
		const { command } = await mount({ providerMissing: true });
		const enable = button("Enable Jev routing");
		expect(enable === undefined || enable.disabled).toBe(true);
		expect(button("Use API key")).toBeUndefined();
		expect(document.body.querySelector('[aria-label="Judge model"]')).toBeNull();
		expect(writes(command)).toEqual([]);
		expect(document.body.textContent).not.toContain("Jev routing enabled");
	});
});
