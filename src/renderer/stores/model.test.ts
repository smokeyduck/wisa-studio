/** Session-scoped model snapshots own the verified composer reasoning selectors. */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoreApi } from "zustand/vanilla";
import { deriveThinkingSelectors, type ModelInfo, type RpcResponse, type RpcSessionState } from "../../shared/rpc-types";
import { createModelStore, type ModelStore } from "./model";

let store: StoreApi<ModelStore>;

/** A `get_state` payload: only the thinking/model fields matter here. */
function state(model: ModelInfo | null, overrides: Partial<RpcSessionState> = {}): RpcSessionState {
	return {
		model,
		thinkingLevel: "high",
		thinkingConfigured: "auto",
		availableThinkingLevels: null,
		isStreaming: false,
		isCompacting: false,
		steeringMode: "all",
		followUpMode: "all",
		interruptMode: "immediate",
		cwd: "/work",
		sessionId: "s1",
		fastModeEnabled: false,
		fastModeActive: false,
		tokensPerSecond: null,
		autoCompactionEnabled: true,
		autoRetryEnabled: true,
		messageCount: 0,
		queuedMessageCount: 0,
		todoPhases: [],
		planModeEnabled: false,
		agentsPaused: false,
		...overrides,
	} as RpcSessionState;
}

/** The model `minimax-m3.1-flash` exactly as the real sidecar reports it. */
const minimax: ModelInfo = {
	provider: "minimax",
	id: "minimax-m3.1-flash",
	reasoning: true,
	thinking: { mode: "effort", efforts: ["minimal", "low", "medium", "high", "xhigh"] },
};

const nonReasoning: ModelInfo = {
	provider: "openai",
	id: "gpt-4o-mini",
	reasoning: false,
	thinking: null,
};

afterEach(() => {
	store?.getState().reset();
});

describe("model store thinking ladder", () => {
	it("derives the ladder from model.thinking.efforts when availableThinkingLevels is null", () => {
		store = createModelStore();
		store.getState().setFromState(state(minimax));
		expect(store.getState().availableThinkingSelectors).toEqual(["off", "minimal", "low", "medium", "high", "xhigh"]);
	});

	it("prefers an explicit availableThinkingLevels over the model's efforts", () => {
		store = createModelStore();
		store.getState().setFromState(state(minimax, { availableThinkingLevels: ["low", "high"] }));
		expect(store.getState().availableThinkingSelectors).toEqual(["off", "low", "high"]);
	});

	it("yields an empty ladder for a non-reasoning model", () => {
		store = createModelStore();
		store.getState().setFromState(state(nonReasoning));
		expect(store.getState().availableThinkingSelectors).toEqual([]);
	});

	it("yields an empty ladder when there is no model at all", () => {
		store = createModelStore();
		store.getState().setFromState(state(null));
		expect(store.getState().availableThinkingSelectors).toEqual([]);
	});

	it("drops unknown efforts and keeps effort order", () => {
		store = createModelStore();
		store.getState().setFromState(
			state({
				provider: "p",
				id: "m",
				reasoning: true,
				thinking: { mode: "effort", efforts: ["xhigh", "turbo", "off", "minimal", "inherit"] },
			}),
		);
		expect(store.getState().availableThinkingSelectors).toEqual(["off", "minimal", "xhigh"]);
	});

	it("keeps the effective level and configured selector from get_state", () => {
		store = createModelStore();
		store.getState().setFromState(state(minimax));
		expect(store.getState().thinkingLevel).toBe("high");
		expect(store.getState().thinkingConfigured).toBe("auto");
	});
});

describe("deriveThinkingSelectors", () => {
	it("does not infer native Auto from a ladder or a legacy selector list", () => {
		expect(deriveThinkingSelectors({ model: minimax, thinkingLevels: ["off", "auto", "high"] })).toEqual([
			"off",
			"high",
		]);
	});

	it("uses the native marker and authoritative selectors instead of broad catalog efforts", () => {
		const adaptive = { ...minimax, thinking: { mode: "anthropic-adaptive", efforts: ["low", "high"] } };
		store = createModelStore();
		store.getState().setFromState(
			state(adaptive, { thinkingAutoMode: "provider", thinkingLevels: ["off", "auto", "low"] }),
		);
		expect(store.getState().availableThinkingSelectors).toEqual(["off", "auto", "low"]);
		store.getState().setFromState(state(minimax, { thinkingLevels: ["off", "inherit", "high"] }));
		expect(store.getState().availableThinkingSelectors).toEqual(["off", "inherit", "high"]);
	});

	it("rejects non-reasoning and unverified rows even when an obsolete list reports effort", () => {
		const provisional = { ...minimax, thinking: { ...minimax.thinking, unverified: true } };
		for (const model of [nonReasoning, provisional]) {
			expect(
				deriveThinkingSelectors({ model, thinkingLevels: ["off", "auto", "high"], thinkingAutoMode: "provider" }),
			).toEqual([]);
		}
		expect(deriveThinkingSelectors({ model: minimax, thinkingLevels: [] })).toEqual([]);
	});
});

describe("model catalog reads", () => {
	it("returns the newer catalog push to callers even when the pending read finishes later", async () => {
		const pending = Promise.withResolvers<RpcResponse>();
		store = createModelStore(() => pending.promise);
		const read = store.getState().refreshAvailableModels(true);
		store.getState().applyCatalogUpdate({
			type: "model_catalog_update",
			models: [minimax],
			providers: [],
			discoveryStates: [],
			refreshPending: false,
			generation: 2,
		});
		pending.resolve({
			type: "response",
			command: "get_available_models",
			success: true,
			data: { models: [nonReasoning], generation: 1, refreshPending: true },
		});
		expect(await read).toMatchObject({ models: [minimax], generation: 2, refreshPending: false });
	});

	it("does not resurrect an old sidecar's catalog after the tab runtime resets", async () => {
		const pending = Promise.withResolvers<RpcResponse>();
		store = createModelStore(() => pending.promise);
		const read = store.getState().refreshProviders(true);
		store.getState().reset();
		pending.resolve({
			type: "response",
			command: "get_providers",
			success: true,
			data: { models: [nonReasoning], generation: 20, refreshPending: false },
		});
		expect(await read).toMatchObject({ models: [], generation: 0 });
		expect(store.getState().availableModels).toEqual([]);
	});
});

describe("model store speed actions", () => {
	it("does not send Fast RPCs for compatible routes that do not advertise the tier", async () => {
		const command = vi.fn(async (): Promise<RpcResponse> => ({
			type: "response",
			command: "set_fast_mode",
			success: true,
		}));
		store = createModelStore(command);
		store.getState().setFromState(state({ provider: "wisa", id: "gpt-5-fast", api: "openai-completions" }));
		await store.getState().toggleFastMode();
		await store.getState().setModelSpeed("fast");
		expect(command).not.toHaveBeenCalled();
	});
});
