import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelInfo, RpcCommand, RpcResponse, RpcSessionState } from "../../shared/rpc-types";
import { ensureTabRuntime, replaceTabRuntime } from "../stores/tab-runtime";
import {
	applyPreferredModel,
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

describe("the default model of a new tab", () => {
	const haiku = model("anthropic", "claude-haiku-4-5");
	const sol = model("wisa", "gpt-6.2-sol");
	const oldPicks = recordPick(recordPick({}, haiku.provider, haiku.id, at(1)), haiku.provider, haiku.id, at(2));
	const picks = recordPick(oldPicks, sol.provider, sol.id, at(3));
	const get = vi.fn(async () => picks);
	const set = vi.fn(async () => {});
	const command = vi.fn(
		async (_tabId: string, request: RpcCommand): Promise<RpcResponse> => ({
			type: "response",
			command: request.type,
			success: true,
			data: sol,
		}),
	);
	Object.assign(globalThis, { window: { omp: { rpc: { commandForTab: command }, prefs: { get, set } } } });

	beforeEach(() => {
		resetAppliedModelDefaults();
		resetModelPicksCache();
		vi.clearAllMocks();
	});

	it("requests the latest selection over the historically frequent model even with a cold catalog", async () => {
		ensureTabRuntime("tab-fresh");
		expect(await applyPreferredModel("tab-fresh", state({ model: haiku }))).toBe(true);
		expect(command).toHaveBeenCalledExactlyOnceWith(
			"tab-fresh",
			{ type: "set_model", provider: sol.provider, modelId: sol.id },
			undefined,
		);
	});

	it("keeps the Core default when the latest selection is unavailable, without trying an old pick", async () => {
		ensureTabRuntime("tab-unavailable");
		command.mockResolvedValueOnce({
			type: "response",
			command: "set_model",
			success: false,
			error: "Model not found",
		});
		expect(await applyPreferredModel("tab-unavailable", state({ model: haiku }))).toBe(false);
		expect(command).toHaveBeenCalledTimes(1);
	});

	it("leaves a session that already has messages alone", async () => {
		ensureTabRuntime("tab-resumed");
		expect(await applyPreferredModel("tab-resumed", state({ messageCount: 4 }))).toBe(false);
		expect(command).not.toHaveBeenCalled();
	});

	it("does not send a startup selection to a replacement session", async () => {
		ensureTabRuntime("tab-replaced");
		const applying = applyPreferredModel("tab-replaced", state({ model: haiku }));
		replaceTabRuntime("tab-replaced");
		expect(await applying).toBe(false);
		expect(command).not.toHaveBeenCalled();
	});

	it("uses a new selection even when the preference write fails", async () => {
		ensureTabRuntime("tab-preference-write-failed");
		set.mockRejectedValueOnce(new Error("Disk unavailable"));
		rememberModelPick(haiku.provider, haiku.id);
		expect(await applyPreferredModel("tab-preference-write-failed", state({ model: sol }))).toBe(true);
		expect(command.mock.calls[0]?.[1]).toMatchObject({ provider: haiku.provider, modelId: haiku.id });
	});
});
