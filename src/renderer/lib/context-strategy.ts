/**
 * Context strategy: one view over the agent's compaction settings, tied to the
 * model that is actually running.
 *
 * The agent exposes compaction as a dozen independent settings. What a reader
 * needs to know is simpler — "when this model's context fills, what happens to
 * my history?" — and the answer depends on the model (window size, whether it
 * reads images, whether its provider compacts server-side). This module turns
 * those settings into named strategies and identifies the first eligible Core
 * method. It is pure: the composer footer and its popover render what it returns
 * and write back the patches it produces.
 */

export const COMPACTION_METHODS = ["remote", "snapcompact", "handoff", "shake", "soft"] as const;
export type CompactionMethod = (typeof COMPACTION_METHODS)[number];

export const CONTEXT_SETTING_PATHS = {
	enabled: "compaction.enabled",
	methodOrder: "compaction.methodOrder",
	keepRecentTokens: "compaction.keepRecentTokens",
	notesBacked: "compaction.experimentalContextManagement",
	thresholdPercent: "compaction.thresholdPercent",
	thresholdTokens: "compaction.thresholdTokens",
	reserveTokens: "compaction.reserveTokens",
	modelThresholds: "compaction.modelThresholds",
	modelThresholdsEnabled: "compaction.modelThresholdsEnabled",
	promotion: "contextPromotion.enabled",
} as const;

export const CONTEXT_SETTING_PATH_LIST: string[] = Object.values(CONTEXT_SETTING_PATHS);

export interface CompactionConfig {
	enabled: boolean;
	methodOrder: CompactionMethod[];
	keepRecentTokens: number;
	/** Experimental notes-backed context windows replace summary compression. */
	notesBacked: boolean;
	/** `-1` selects the reserve-based threshold, not a spending budget. */
	thresholdPercent: number;
	thresholdTokens: number;
	reserveTokens: number | undefined;
	modelThresholds: Record<string, unknown>;
	modelThresholdsEnabled: boolean;
	/** Switch to the model's configured larger sibling on overflow before compacting. */
	promotion: boolean;
}

/** Read fallback mirroring Core's WISA desktop defaults. */
export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
	enabled: true,
	methodOrder: ["remote", "snapcompact", "handoff", "shake", "soft"],
	keepRecentTokens: 20_000,
	notesBacked: false,
	thresholdPercent: 20,
	thresholdTokens: -1,
	reserveTokens: undefined,
	modelThresholds: {},
	modelThresholdsEnabled: true,
	promotion: false,
};

/** The facts about the running model that decide how compaction behaves. */
export interface ModelProfile {
	/** `null` when the host does not publish the window. */
	windowTokens: number | null;
	/** Reads images, which snapcompact needs. */
	vision: boolean;
	/** Its provider offers server-side compaction. */
	nativeRemote: boolean;
	/** Provider-qualified model ID for matching Core's per-model rules. */
	key?: string;
}

/** The slice of the wire model object the profile reads; every field is optional on the wire. */
export interface ProfileSource {
	api?: string;
	provider?: string;
	id?: string;
	transport?: string;
	contextWindow?: number | null;
	input?: readonly string[];
	baseUrl?: string;
	remoteCompaction?: { api?: string; enabled?: boolean; endpoint?: string; v2StreamingEnabled?: boolean };
	compat?: object | null;
}

const OPENAI_RESPONSES_APIS = new Set(["openai-responses", "azure-openai-responses", "openai-codex-responses"]);

/** Conservative route eligibility from the model snapshot; Core remains the execution authority. */
function supportsServerCompaction(model: ProfileSource): boolean {
	const remote = model.remoteCompaction;
	if (remote?.enabled === false) return false;
	const api = remote?.api ?? model.api;
	let hostname = "";
	let pathname = "";
	let https = false;
	try {
		if (model.baseUrl) {
			const url = new URL(model.baseUrl);
			({ hostname, pathname } = url);
			https = url.protocol === "https:";
		}
	} catch {
		// An invalid endpoint cannot establish native support.
	}
	const runtimeHost =
		/^(?:bedrock-runtime(?:-fips)?\.[a-z0-9-]+\.amazonaws\.com|vpce-[a-z0-9-]+\.bedrock-runtime(?:-fips)?\.[a-z0-9-]+\.vpce\.amazonaws\.com)$/.test(
			hostname,
		);
	const mantleHost =
		/^(?:bedrock-mantle\.(?:[a-z0-9-]+|\{region\})\.api\.aws|vpce-[a-z0-9-]+\.bedrock-mantle\.[a-z0-9-]+\.vpce\.amazonaws\.com)$/.test(
			hostname,
		);
	const bedrockRuntime = https && runtimeHost && pathname === "/";
	const bedrockOpenAi =
		https &&
		(runtimeHost || mantleHost) &&
		(pathname === "/openai" ||
			pathname.startsWith("/openai/") ||
			(mantleHost && (pathname === "/v1" || pathname.startsWith("/v1/"))));
	if (model.provider === "openai") return true;
	if (model.provider === "openai-codex" && remote?.endpoint?.trim()) return true;
	if (api !== undefined && OPENAI_RESPONSES_APIS.has(api)) {
		if (remote?.v2StreamingEnabled === true) return true;
		if (model.provider !== "openai-codex" && remote?.enabled === true) return true;
		if (api === "openai-responses" && bedrockOpenAi) return true;
	}
	const compat = model.compat as Record<string, unknown> | null | undefined;
	if (compat?.supportsServerCompaction !== true) return false;
	if (model.api === "bedrock-converse-stream") return remote?.enabled ?? (!model.baseUrl || bedrockRuntime);
	if (model.api !== "anthropic-messages") return false;
	if (model.transport === "pi-native" && compat.firstPartyProvider === true) return true;
	if (compat.bedrockMessagesApi === true) return true;
	if (remote?.api === "anthropic-messages" && remote.enabled === true) return true;
	const knownEndpoint =
		!model.baseUrl ||
		(https &&
			(hostname === "api.anthropic.com" ||
				/^(?:[a-z0-9-]+[-.])?aiplatform\.googleapis\.com$/.test(hostname) ||
				(hostname.endsWith(".services.ai.azure.com") &&
					(pathname === "/" || pathname === "/anthropic" || pathname.startsWith("/anthropic/"))) ||
				/^aws-external-anthropic\.[a-z0-9-]+\.api\.aws$/.test(hostname)));
	return (
		knownEndpoint &&
		(compat.firstPartyProvider === true || model.provider === "google-vertex" || remote?.enabled === true)
	);
}

export function modelProfile(model: ProfileSource | null | undefined): ModelProfile {
	if (!model) return { windowTokens: null, vision: false, nativeRemote: false };
	const stripsImages =
		model.api === "openai-completions" &&
		model.transport !== "pi-native" &&
		model.compat !== undefined &&
		model.compat !== null &&
		"stripImageInput" in model.compat &&
		model.compat.stripImageInput === true;
	return {
		windowTokens: model.contextWindow && model.contextWindow > 0 ? model.contextWindow : null,
		key: model.provider && model.id ? `${model.provider}/${model.id}` : undefined,
		vision: !stripsImages && model.input?.includes("image") === true,
		// API or vision declarations alone do not establish server compaction support.
		nativeRemote: supportsServerCompaction(model),
	};
}

// ── Strategies ──────────────────────────────────────────────────────────────

export type StrategyId = "balanced" | "preserve" | "notes";
export type StrategyView = StrategyId | "custom";

interface StrategyDefinition {
	methodOrder: CompactionMethod[];
	keepRecentTokens: number;
	notesBacked: boolean;
}

/**
 * Selectable strategies. Each fixes only the three settings that define its
 * character; threshold, auto-compact and promotion stay the reader's own.
 */
export const STRATEGIES: Record<StrategyId, StrategyDefinition> = {
	// Balanced follows Core's default order and retention, without a GUI-specific policy.
	balanced: {
		methodOrder: DEFAULT_COMPACTION_CONFIG.methodOrder,
		keepRecentTokens: DEFAULT_COMPACTION_CONFIG.keepRecentTokens,
		notesBacked: DEFAULT_COMPACTION_CONFIG.notesBacked,
	},
	// Preserve favors image archives and a larger recent-history tail.
	preserve: { methodOrder: ["snapcompact", "shake", "handoff", "soft"], keepRecentTokens: 40_000, notesBacked: false },
	// Experimental: the model keeps notes and starts fresh windows; full history stays searchable.
	notes: { methodOrder: ["shake", "handoff", "soft"], keepRecentTokens: 40_000, notesBacked: true },
};

export const STRATEGY_IDS: readonly StrategyId[] = ["balanced", "preserve", "notes"];

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((method, index) => method === right[index]);
}

/** Which named strategy the settings add up to, or `custom` when they match none. */
export function detectStrategy(config: CompactionConfig): StrategyView {
	if (config.notesBacked) return "notes";
	for (const id of ["balanced", "preserve"] as const) {
		const definition = STRATEGIES[id];
		if (
			sameOrder(config.methodOrder, definition.methodOrder) &&
			config.keepRecentTokens === definition.keepRecentTokens
		) {
			return id;
		}
	}
	return "custom";
}

/** The session-scoped settings that define a strategy. */
export function strategyPatch(id: StrategyId): Array<{ path: string; value: unknown }> {
	const definition = STRATEGIES[id];
	return [
		{ path: CONTEXT_SETTING_PATHS.methodOrder, value: [...definition.methodOrder] },
		{ path: CONTEXT_SETTING_PATHS.keepRecentTokens, value: definition.keepRecentTokens },
		{ path: CONTEXT_SETTING_PATHS.notesBacked, value: definition.notesBacked },
	];
}

// ── Prediction ──────────────────────────────────────────────────────────────

export type ExpectedMethod = CompactionMethod | "notes";

/** The method that will run first when this model's context fills, in this configuration. */
export function expectedMethod(config: CompactionConfig, profile: ModelProfile): ExpectedMethod | null {
	if (config.notesBacked) return "notes";
	for (const method of config.methodOrder) {
		if (method === "remote" && !profile.nativeRemote) continue;
		if (method === "snapcompact" && !profile.vision) continue;
		return method;
	}
	return null;
}

/** A matching model rule takes precedence over the global threshold fields. */
function modelThresholdKey(config: CompactionConfig, profile: ModelProfile): string | undefined {
	if (!config.modelThresholdsEnabled || !profile.key) return undefined;
	let best: string | undefined;
	for (const key in config.modelThresholds) {
		const value = config.modelThresholds[key];
		const valid =
			(typeof value === "number" && Number.isSafeInteger(value) && value > 0) ||
			(typeof value === "string" &&
				(/^f[1-9]\d*$/i.test(value.trim()) ||
					(/^\d+(?:\.\d+)?%$/.test(value.trim()) &&
						Number.parseFloat(value) > 0 &&
						Number.parseFloat(value) <= 100)));
		if (!valid) continue;
		if (key === profile.key) return key;
		if (key.endsWith("*") && profile.key.startsWith(key.slice(0, -1)) && (!best || key.length > best.length))
			best = key;
	}
	return best;
}

/** Session RPC cannot clear a fixed limit or a per-model rule. Do not offer a no-op preset. */
export function hasCompactionThresholdOverride(config: CompactionConfig, profile: ModelProfile): boolean {
	return config.thresholdTokens > 0 || modelThresholdKey(config, profile) !== undefined;
}

/** Tokens at which maintenance starts, or `null` when the window is unknown. */
export function compactionThreshold(config: CompactionConfig, profile: ModelProfile): number | null {
	const key = modelThresholdKey(config, profile);
	const entry = key === undefined ? undefined : config.modelThresholds[key];
	return windowCompactionThreshold(config, profile.windowTokens, entry);
}

/** Mirrors Core's fixed, model-base, percentage and reserve threshold precedence. */
export function windowCompactionThreshold(
	config: CompactionConfig,
	window: number | null,
	modelEntry?: unknown,
): number | null {
	if (window === null || !Number.isFinite(window) || window <= 0) return null;
	let base = window;
	let percent = config.thresholdPercent;
	let fixed = config.thresholdTokens;
	if (typeof modelEntry === "number") {
		base = Math.min(window, modelEntry);
		fixed = -1;
	} else if (typeof modelEntry === "string") {
		if (modelEntry.trim().toLowerCase().startsWith("f")) fixed = Number(modelEntry.trim().slice(1));
		else {
			fixed = -1;
			percent = Number.parseFloat(modelEntry);
		}
	}
	if (fixed > 0 && fixed < window) return Math.min(window - 1, Math.max(1, fixed));
	if (fixed > 0) base = window;
	else if (percent > 0) return Math.floor(base * (Math.min(99, Math.max(1, percent)) / 100));
	const proportional = Math.max(1, Math.floor(base * 0.15));
	let reserve = Math.max(Math.floor(base * 0.15), config.reserveTokens ?? 16_384);
	if ((config.reserveTokens === undefined && reserve >= base - proportional) || reserve >= base)
		reserve = proportional;
	return Math.max(0, Math.min(base - 1, base - reserve));
}

// ── Reading settings ────────────────────────────────────────────────────────

function isMethod(value: unknown): value is CompactionMethod {
	return typeof value === "string" && (COMPACTION_METHODS as readonly string[]).includes(value);
}

/** Build a config from a `get_settings` values map, falling back per field to the agent default. */
export function parseCompactionConfig(values: Record<string, unknown> | undefined): CompactionConfig {
	const defaults = DEFAULT_COMPACTION_CONFIG;
	if (!values) return { ...defaults, methodOrder: [...defaults.methodOrder] };
	const order = values[CONTEXT_SETTING_PATHS.methodOrder];
	const methods = Array.isArray(order) ? order.filter(isMethod) : [];
	const keep = values[CONTEXT_SETTING_PATHS.keepRecentTokens];
	const percent = values[CONTEXT_SETTING_PATHS.thresholdPercent];
	const tokens = values[CONTEXT_SETTING_PATHS.thresholdTokens];
	const reserve = values[CONTEXT_SETTING_PATHS.reserveTokens];
	const modelThresholds = values[CONTEXT_SETTING_PATHS.modelThresholds];
	const flag = (path: string, fallback: boolean) =>
		typeof values[path] === "boolean" ? (values[path] as boolean) : fallback;
	return {
		enabled: flag(CONTEXT_SETTING_PATHS.enabled, defaults.enabled),
		methodOrder: methods.length > 0 ? methods : [...defaults.methodOrder],
		keepRecentTokens: typeof keep === "number" && keep > 0 ? keep : defaults.keepRecentTokens,
		notesBacked: flag(CONTEXT_SETTING_PATHS.notesBacked, defaults.notesBacked),
		thresholdPercent: typeof percent === "number" ? percent : defaults.thresholdPercent,
		thresholdTokens: typeof tokens === "number" && Number.isFinite(tokens) ? tokens : defaults.thresholdTokens,
		reserveTokens: typeof reserve === "number" && Number.isFinite(reserve) && reserve >= 0 ? reserve : undefined,
		modelThresholds:
			typeof modelThresholds === "object" && modelThresholds !== null && !Array.isArray(modelThresholds)
				? (modelThresholds as Record<string, unknown>)
				: defaults.modelThresholds,
		modelThresholdsEnabled: flag(CONTEXT_SETTING_PATHS.modelThresholdsEnabled, defaults.modelThresholdsEnabled),
		promotion: flag(CONTEXT_SETTING_PATHS.promotion, defaults.promotion),
	};
}
