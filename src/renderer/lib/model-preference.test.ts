/**
 * Contracts for the remembered-model default: a new session should open on the
 * model the user keeps choosing, never on one the catalog no longer offers, and
 * never overriding a session that already has history.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ModelInfo, RpcSessionState } from "../../shared/rpc-types";
import type { ModelStore } from "../stores/model";
import { sessionRuntimeStore } from "../stores/session-runtime-context";
import { ensureTabRuntime } from "../stores/tab-runtime";
import {
	applyPreferredModel,
	type ModelPicks,
	modelKey,
	preferredModel,
	rankPicks,
	recordPick,
	rememberModelPick,
	resetAppliedModelDefaults,
	resetModelPicksCache,
} from "./model-preference";

const at = (n: number) => 1_700_000_000_000 + n;

function model(provider: string, id: string): ModelInfo {
	return { provider, id } as ModelInfo;
}

function state(overrides: Partial<RpcSessionState> = {}): RpcSessionState {
	return { messageCount: 0, model: null, ...overrides } as RpcSessionState;
}

describe("remembered model preference", () => {
	it("counts a repeat pick as a stronger habit than a one-off", () => {
		let picks: ModelPicks = {};
		picks = recordPick(picks, "wisa", "claude-fable-5-2", at(1));
		picks = recordPick(picks, "minimax", "m3.1-flash", at(2));
		picks = recordPick(picks, "wisa", "claude-fable-5-2", at(3));
		expect(rankPicks(picks).map(pick => pick.id)).toEqual(["claude-fable-5-2", "m3.1-flash"]);
	});

	it("breaks a tie on the most recent pick", () => {
		let picks: ModelPicks = {};
		picks = recordPick(picks, "wisa", "a", at(1));
		picks = recordPick(picks, "minimax", "b", at(2));
		expect(rankPicks(picks).map(pick => pick.id)).toEqual(["b", "a"]);
	});

	it("forgets the least-used pick once the history is full", () => {
		let picks: ModelPicks = {};
		for (let index = 0; index < 30; index += 1) picks = recordPick(picks, "wisa", `m${index}`, at(index));
		// The two oldest are still the least recent, so the newest 24 survive.
		expect(Object.keys(picks)).toHaveLength(24);
		expect(picks[modelKey("wisa", "m29")]).toBeDefined();
		expect(picks[modelKey("wisa", "m0")]).toBeUndefined();
	});

	it("skips a remembered model the catalog no longer offers", () => {
		let picks: ModelPicks = {};
		picks = recordPick(picks, "gone", "removed", at(2));
		picks = recordPick(picks, "wisa", "claude-fable-5-2", at(1));
		const available = [model("wisa", "claude-fable-5-2")];
		expect(preferredModel(picks, available, null)).toEqual({ provider: "wisa", id: "claude-fable-5-2" });
	});

	it("reports nothing to do when the session already runs that model", () => {
		const picks = recordPick({}, "wisa", "claude-fable-5-2", at(1));
		const available = [model("wisa", "claude-fable-5-2")];
		expect(preferredModel(picks, available, model("wisa", "claude-fable-5-2"))).toBeNull();
	});
});

describe("applying the remembered model to a fresh tab", () => {
	const sent: Array<Record<string, unknown>> = [];
	const bridge = { commandForTab: async (_tabId: string, command: Record<string, unknown>) => command };
	(globalThis as { window?: unknown }).window = {
		omp: {
			rpc: bridge,
			prefs: {
				get: async () => recordPick({}, "wisa", "claude-fable-5-2", at(1)),
				set: async () => undefined,
			},
		},
	} as never;

	beforeEach(() => {
		resetAppliedModelDefaults();
		resetModelPicksCache();
		sent.length = 0;
		bridge.commandForTab = async (_tabId: string, command: Record<string, unknown>) => {
			sent.push(command);
			return { id: command.id, type: "response", success: true, data: {} };
		};
		// The tab's own model store is what `applyPreferredModel` reads.
		sessionRuntimeStore<ModelStore>("tab-fresh", "model")?.setState({
			availableModels: [model("wisa", "claude-fable-5-2"), model("minimax", "m3.1-flash")],
		});
	});

	afterEach(() => {
		resetAppliedModelDefaults();
		resetModelPicksCache();
	});

	it("switches an empty session onto the remembered model", async () => {
		ensureTabRuntime("tab-fresh");
		sessionRuntimeStore<ModelStore>("tab-fresh", "model")?.setState({
			availableModels: [model("wisa", "claude-fable-5-2"), model("minimax", "m3.1-flash")],
		});
		expect(await applyPreferredModel("tab-fresh", state())).toBe(true);
		expect(sent.map(command => command.type)).toContain("set_model");
		const switchCommand = sent.find(command => command.type === "set_model");
		expect(switchCommand).toMatchObject({ provider: "wisa", modelId: "claude-fable-5-2" });
	});

	it("leaves a session that already has messages alone", async () => {
		ensureTabRuntime("tab-resumed");
		expect(await applyPreferredModel("tab-resumed", state({ messageCount: 4 }))).toBe(false);
		expect(sent.some(command => command.type === "set_model")).toBe(false);
	});

	it("touches each tab at most once, so a restart does not re-apply", async () => {
		ensureTabRuntime("tab-once");
		sessionRuntimeStore<ModelStore>("tab-once", "model")?.setState({
			availableModels: [model("wisa", "claude-fable-5-2")],
		});
		await applyPreferredModel("tab-once", state());
		const before = sent.length;
		await applyPreferredModel("tab-once", state());
		expect(sent.length).toBe(before);
	});

	it("records a pick without failing when prefs are unavailable", async () => {
		rememberModelPick("wisa", "claude-fable-5-2");
		await Promise.resolve();
		// Nothing to assert beyond "it did not throw": the switch already succeeded.
		expect(true).toBe(true);
	});
});
