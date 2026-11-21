import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_THRESHOLD_PERCENT, ensureCompactionDefaults, resetCompactionDefaultsCheck } from "./context-defaults";
import { type CompactionConfig, DEFAULT_COMPACTION_CONFIG } from "./context-strategy";

const prefs = new Map<string, unknown>();
(globalThis as { window?: unknown }).window = {
	omp: {
		prefs: {
			get: async (key: string) => prefs.get(key),
			set: async (key: string, value: unknown) => void prefs.set(key, value),
		},
	},
} as never;

const config = (overrides: Partial<CompactionConfig> = {}): CompactionConfig => ({
	...DEFAULT_COMPACTION_CONFIG,
	methodOrder: [...DEFAULT_COMPACTION_CONFIG.methodOrder],
	...overrides,
});

afterEach(() => {
	prefs.clear();
	resetCompactionDefaultsCheck();
});

describe("ensureCompactionDefaults", () => {
	it("writes 20% once when the threshold is still the agent's reserve default", async () => {
		const write = vi.fn(async () => true);

		await ensureCompactionDefaults(config(), write);

		expect(write).toHaveBeenCalledWith([{ path: "compaction.thresholdPercent", value: DEFAULT_THRESHOLD_PERCENT }]);
		expect(prefs.get("compactionDefaults")).toBe(true);
	});

	it("never runs twice, so a reader who picks Auto keeps it", async () => {
		const write = vi.fn(async () => true);
		await ensureCompactionDefaults(config(), write);

		write.mockClear();
		resetCompactionDefaultsCheck();
		await ensureCompactionDefaults(config({ thresholdPercent: -1 }), write);

		expect(write).not.toHaveBeenCalled();
	});

	it("leaves a threshold the reader already set alone", async () => {
		const write = vi.fn(async () => true);

		await ensureCompactionDefaults(config({ thresholdPercent: 55 }), write);

		expect(write).not.toHaveBeenCalled();
		expect(prefs.get("compactionDefaults")).toBe(true);
	});

	it("retries on the next launch when the write fails, instead of marking it done", async () => {
		const write = vi.fn(async () => false);

		await ensureCompactionDefaults(config(), write);

		expect(prefs.get("compactionDefaults")).toBeUndefined();
	});
});
