import { describe, expect, it } from "vitest";
import {
	type CompactionConfig,
	compactionThreshold,
	DEFAULT_COMPACTION_CONFIG,
	detectStrategy,
	expectedMethod,
	hasCompactionThresholdOverride,
	type ModelProfile,
	modelProfile,
	parseCompactionConfig,
	STRATEGIES,
	strategyPatch,
} from "./context-strategy";

const config = (overrides: Partial<CompactionConfig> = {}): CompactionConfig => ({
	...DEFAULT_COMPACTION_CONFIG,
	methodOrder: [...DEFAULT_COMPACTION_CONFIG.methodOrder],
	...overrides,
});

const textOnly: ModelProfile = { windowTokens: 262_144, vision: false, nativeRemote: false };
const vision: ModelProfile = { windowTokens: 262_144, vision: true, nativeRemote: false };
const native: ModelProfile = { windowTokens: 400_000, vision: true, nativeRemote: true };

describe("modelProfile", () => {
	it("reads window, vision and server compaction from the wire model", () => {
		expect(
			modelProfile({
				api: "openai-responses",
				provider: "openai",
				contextWindow: 400_000,
				input: ["text", "image"],
			}),
		).toEqual(native);
		expect(modelProfile({ api: "openai-completions", contextWindow: 262_144, input: ["text"] })).toEqual(textOnly);
	});

	it("does not apply the Chat Completions image guard to pi-native forwarding", () => {
		const profile = modelProfile({
			api: "openai-completions",
			transport: "pi-native",
			input: ["text", "image"],
			compat: { stripImageInput: true },
		});
		expect(expectedMethod(config(), profile)).toBe("snapcompact");
	});

	it("requires model policy and a supported Anthropic route, not a capability flag alone", () => {
		const model = {
			api: "anthropic-messages",
			provider: "anthropic",
			compat: { supportsServerCompaction: true, firstPartyProvider: true },
		};
		expect(modelProfile(model).nativeRemote).toBe(true);
		expect(modelProfile({ ...model, baseUrl: "https://gateway.example/anthropic" }).nativeRemote).toBe(false);
		expect(modelProfile({ ...model, remoteCompaction: { enabled: false } }).nativeRemote).toBe(false);
		expect(modelProfile({ ...model, compat: { supportsServerCompaction: false } }).nativeRemote).toBe(false);
	});

	it("does not mistake a Responses-compatible API for compaction support", () => {
		expect(modelProfile({ api: "openai-responses", provider: "gateway" }).nativeRemote).toBe(false);
		expect(
			modelProfile({ api: "openai-responses", provider: "gateway", remoteCompaction: { enabled: true } })
				.nativeRemote,
		).toBe(true);
		expect(
			modelProfile({ api: "openai-responses", provider: "openai", remoteCompaction: { enabled: false } })
				.nativeRemote,
		).toBe(false);
		expect(
			modelProfile({
				api: "openai-codex-responses",
				provider: "openai-codex",
				remoteCompaction: { v2StreamingEnabled: true },
			}).nativeRemote,
		).toBe(true);
		expect(modelProfile({ api: "openai-codex-responses", provider: "openai-codex" }).nativeRemote).toBe(false);
		expect(
			modelProfile({ api: "openai-responses", baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1" })
				.nativeRemote,
		).toBe(true);
		expect(
			modelProfile({ api: "openai-responses", baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com/" })
				.nativeRemote,
		).toBe(false);
		expect(
			modelProfile({
				api: "openai-responses",
				baseUrl: "https://gateway.example/bedrock-runtime.us-east-1.amazonaws.com/openai/v1",
			}).nativeRemote,
		).toBe(false);
	});

	it("reports an unpublished window as unknown, and a missing model as capable of nothing", () => {
		expect(modelProfile({ contextWindow: 0 }).windowTokens).toBeNull();
		expect(modelProfile(null)).toEqual({ windowTokens: null, vision: false, nativeRemote: false });
	});
});

describe("expectedMethod", () => {
	it("skips methods the model cannot run, in order", () => {
		// The default order on a vision model without server compaction lands on the image archive.
		expect(expectedMethod(config(), vision)).toBe("snapcompact");
		expect(expectedMethod(config(), native)).toBe("remote");
		// Text-only without server compaction falls past both to the handoff document.
		expect(expectedMethod(config(), textOnly)).toBe("handoff");
	});

	it("uses Core's default method order for Balanced and skips unsupported methods", () => {
		const balanced = config({ ...STRATEGIES.balanced });
		expect(expectedMethod(balanced, vision)).toBe("snapcompact");
		expect(expectedMethod(balanced, textOnly)).toBe("handoff");
		expect(expectedMethod(balanced, native)).toBe("remote");
		expect(balanced.methodOrder).toEqual(["remote", "snapcompact", "handoff", "shake", "soft"]);
	});

	it("prioritizes image archiving in Preserve and falls back on text-only routes", () => {
		const preserve = config({ ...STRATEGIES.preserve });
		expect(expectedMethod(preserve, vision)).toBe("snapcompact");
		expect(expectedMethod(preserve, textOnly)).toBe("shake");
	});

	it("names the notes mode over any method order", () => {
		expect(expectedMethod(config({ notesBacked: true }), native)).toBe("notes");
	});

	it("reports nothing runnable when every listed method needs a capability the model lacks", () => {
		expect(expectedMethod(config({ methodOrder: ["remote", "snapcompact"] }), textOnly)).toBeNull();
	});
});

describe("detectStrategy", () => {
	it("recognizes each strategy from its settings, and anything else as custom", () => {
		expect(detectStrategy(config())).toBe("balanced");
		expect(detectStrategy(config({ ...STRATEGIES.balanced }))).toBe("balanced");
		expect(detectStrategy(config({ ...STRATEGIES.preserve }))).toBe("preserve");
		expect(detectStrategy(config({ ...STRATEGIES.notes }))).toBe("notes");
		// One setting off the strategy is a custom setup, not a silent match.
		expect(detectStrategy(config({ ...STRATEGIES.preserve, keepRecentTokens: 25_000 }))).toBe("custom");
		expect(detectStrategy(config({ methodOrder: ["handoff", "shake"] }))).toBe("custom");
	});

	it("round-trips: applying a strategy's patch yields that strategy", () => {
		for (const id of ["balanced", "preserve", "notes"] as const) {
			const values: Record<string, unknown> = {};
			for (const { path, value } of strategyPatch(id)) values[path] = value;
			expect(detectStrategy(parseCompactionConfig(values))).toBe(id);
		}
	});

	it("keeps thresholds, promotion and automatic maintenance independent of strategy patches", () => {
		for (const id of ["balanced", "preserve", "notes"] as const) {
			expect(strategyPatch(id).map(({ path }) => path)).toEqual([
				"compaction.methodOrder",
				"compaction.keepRecentTokens",
				"compaction.experimentalContextManagement",
			]);
		}
	});
});

describe("compactionThreshold", () => {
	it("defaults to compaction at 20% of the model window", () => {
		expect(compactionThreshold(config(), { ...textOnly, windowTokens: 1_000_000 })).toBe(200_000);
		expect(compactionThreshold(config(), { ...textOnly, windowTokens: 262_144 })).toBe(52_428);
	});

	it("uses the fixed reserve on a small window when Auto is selected", () => {
		expect(compactionThreshold(config({ thresholdPercent: -1 }), { ...textOnly, windowTokens: 32_000 })).toBe(
			32_000 - 16_384,
		);
	});

	it("honors an explicit percentage and reports an unknown window as unknown", () => {
		expect(compactionThreshold(config({ thresholdPercent: 70 }), { ...textOnly, windowTokens: 200_000 })).toBe(
			140_000,
		);
		expect(compactionThreshold(config(), { ...textOnly, windowTokens: null })).toBeNull();
	});

	it("honors fixed limits ahead of percentages and falls back to the reserve when a limit cannot fit", () => {
		expect(compactionThreshold(config({ thresholdPercent: 20, thresholdTokens: 100_000 }), native)).toBe(100_000);
		expect(compactionThreshold(config({ thresholdTokens: 400_000 }), native)).toBe(340_000);
		expect(
			compactionThreshold(config({ thresholdPercent: -1, reserveTokens: 50_000 }), {
				...native,
				windowTokens: 200_000,
			}),
		).toBe(150_000);
	});

	it("keeps default reserves usable on small windows and honors explicit reserves", () => {
		expect(compactionThreshold(config({ thresholdPercent: -1 }), { ...textOnly, windowTokens: 16_000 })).toBe(13_600);
		expect(
			compactionThreshold(config({ thresholdPercent: -1, reserveTokens: 14_000 }), {
				...textOnly,
				windowTokens: 16_000,
			}),
		).toBe(2_000);
		expect(compactionThreshold(config({ thresholdPercent: 100 }), native)).toBe(396_000);
	});

	it("uses exact model rules before the longest provider prefix, including base and fixed token entries", () => {
		const profile = { ...native, windowTokens: 1_000_000, key: "openrouter/anthropic/test" };
		const settings = config({
			thresholdPercent: -1,
			thresholdTokens: 250_000,
			modelThresholds: { "openrouter/*": "80%", "openrouter/anthropic/*": 200_000 },
		});
		expect(compactionThreshold(settings, profile)).toBe(170_000);
		expect(hasCompactionThresholdOverride(settings, profile)).toBe(true);
		settings.modelThresholds[profile.key] = "f90000";
		expect(compactionThreshold(settings, profile)).toBe(90_000);
		settings.modelThresholds[profile.key] = "20%";
		expect(compactionThreshold(settings, profile)).toBe(200_000);
		settings.modelThresholdsEnabled = false;
		expect(compactionThreshold(settings, profile)).toBe(250_000);
	});

	it("does not let unrelated or invalid model rules block a session preset", () => {
		const settings = config({ modelThresholds: { "other/*": "20%", "openai/*": "bad" } });
		expect(hasCompactionThresholdOverride(settings, { ...native, key: "openai/test" })).toBe(false);
	});
});

describe("parseCompactionConfig", () => {
	it("falls back to the agent default per field and drops unknown methods", () => {
		const parsed = parseCompactionConfig({
			"compaction.methodOrder": ["shake", "bogus", "soft"],
			"compaction.keepRecentTokens": -5,
			"compaction.enabled": false,
		});
		expect(parsed.methodOrder).toEqual(["shake", "soft"]);
		expect(parsed.keepRecentTokens).toBe(DEFAULT_COMPACTION_CONFIG.keepRecentTokens);
		expect(parsed.enabled).toBe(false);
		expect(parsed.promotion).toBe(false);
		expect(parseCompactionConfig({ "compaction.methodOrder": ["bogus"] }).methodOrder).toEqual(
			DEFAULT_COMPACTION_CONFIG.methodOrder,
		);
		expect(parseCompactionConfig(undefined).methodOrder).toEqual([
			"remote",
			"snapcompact",
			"handoff",
			"shake",
			"soft",
		]);
		expect(parseCompactionConfig({ "compaction.methodOrder": ["snapcompact", "soft"] }).methodOrder).toEqual([
			"snapcompact",
			"soft",
		]);
	});
});
