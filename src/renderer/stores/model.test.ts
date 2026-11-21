/**
 * Model store contract: the thinking ladder the composer picker offers must
 * come from what the ACTIVE MODEL actually reports. The sidecar never fills in
 * `availableThinkingLevels` (it is `null` for every model, reasoning or not),
 * so the ladder has to be derived from `model.thinking.efforts`; an explicit
 * `availableThinkingLevels` still wins when a sidecar sends one, and a
 * non-reasoning model must yield an empty ladder (never a dead selector).
 */

import { afterEach, describe, expect, it } from "vitest";
import type { StoreApi } from "zustand/vanilla";
import type { ModelInfo, RpcSessionState } from "../../shared/rpc-types";
import { createModelStore, deriveThinkingLevels, type ModelStore } from "./model";

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
		expect(store.getState().availableThinkingLevels).toEqual(["minimal", "low", "medium", "high", "xhigh"]);
	});

	it("prefers an explicit availableThinkingLevels over the model's efforts", () => {
		store = createModelStore();
		store.getState().setFromState(state(minimax, { availableThinkingLevels: ["low", "high"] }));
		expect(store.getState().availableThinkingLevels).toEqual(["low", "high"]);
	});

	it("yields an empty ladder for a non-reasoning model", () => {
		store = createModelStore();
		store.getState().setFromState(state(nonReasoning));
		expect(store.getState().availableThinkingLevels).toEqual([]);
	});

	it("yields an empty ladder when there is no model at all", () => {
		store = createModelStore();
		store.getState().setFromState(state(null));
		expect(store.getState().availableThinkingLevels).toEqual([]);
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
		expect(store.getState().availableThinkingLevels).toEqual(["minimal", "xhigh"]);
	});

	it("keeps the effective level and configured selector from get_state", () => {
		store = createModelStore();
		store.getState().setFromState(state(minimax));
		expect(store.getState().thinkingLevel).toBe("high");
		expect(store.getState().thinkingConfigured).toBe("auto");
	});
});

describe("deriveThinkingLevels", () => {
	it("is the single source both the store and its callers read", () => {
		expect(deriveThinkingLevels({ availableThinkingLevels: null, model: minimax })).toEqual([
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
		]);
		expect(deriveThinkingLevels({ availableThinkingLevels: [], model: nonReasoning })).toEqual([]);
		// `reasoning: false` without a thinking config stays empty even if a stale
		// efforts list somehow survived.
		expect(deriveThinkingLevels({ model: { provider: "p", id: "m", reasoning: false, thinking: null } })).toEqual([]);
	});
});
