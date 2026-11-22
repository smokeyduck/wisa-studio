/**
 * Provider branding for the model picker: display labels and inline brand
 * marks.
 *
 * Two rules shape this file:
 *
 * 1. Labels come from a lookup table, never from title-casing an id. Provider
 *    ids are catalog/vendor strings (`wisa`, `openai-codex`, `moonshot`), so a
 *    blanket transform renders `wisa` and `xAI` wrong in opposite directions.
 * 2. Marks are hand-drawn geometry, not trademarked logo paths. Each glyph is a
 *    few primitives on a 16px grid in `currentColor`, so it inherits the row's
 *    colour, themes, and prints at any size. No network fetch, no dependency.
 */

import type { ComponentType, ReactNode, SVGProps } from "react";

export type BrandKey =
	| "openai"
	| "anthropic"
	| "google"
	| "xai"
	| "meta"
	| "mistral"
	| "deepseek"
	| "qwen"
	| "minimax"
	| "moonshot"
	| "wisa"
	| "generic";

export interface BrandIconProps extends SVGProps<SVGSVGElement> {
	/** Rendered square size in px. Defaults to 16 — the picker's header scale. */
	size?: number;
}

export interface Brand {
	key: BrandKey;
	/** Display name for the vendor, e.g. `MiniMax`, `OpenAI`, `xAI`. */
	label: string;
	/** Inline SVG mark; 16px, `currentColor`, decorative. */
	Icon: ComponentType<BrandIconProps>;
}

/** Shared wrapper: one 16px square, stroke inherited from the text colour. */
function mark(key: string, children: ReactNode) {
	const Mark = ({ size = 16, ...props }: BrandIconProps) => (
		<svg
			aria-hidden="true"
			fill="none"
			focusable="false"
			height={size}
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={1.4}
			viewBox="0 0 16 16"
			width={size}
			{...props}
			data-brand={key}
		>
			{children}
		</svg>
	);
	Mark.displayName = `BrandMark(${key})`;
	return Mark;
}

/* -------------------------------------------------------------------------- */
/* Marks · abstract, geometric, deliberately not the vendors' real logo art.   */
/* -------------------------------------------------------------------------- */

/** Hexagonal knot: a hexagon outline with a counter-rotating inner triangle. */
const OpenAIMark = mark(
	"openai",
	<>
		<path d="M8 1.7 13.4 4.8v6.4L8 14.3 2.6 11.2V4.8z" />
		<path d="M8 4.6 11 6.3v3.4L8 11.4 5 9.7V6.3z" opacity={0.55} />
	</>,
);

/** Three crossing strokes: a starburst, the "A" read as a spark. */
const AnthropicMark = mark(
	"anthropic",
	<>
		<path d="M3 12.6 8 3.4l5 9.2" />
		<path d="M5.2 9.4h5.6" opacity={0.55} />
	</>,
);

/** Ring with a bar through the gap: a "G" reduced to circle plus radius. */
const GoogleMark = mark(
	"google",
	<>
		<path d="M12.9 5.4A5.5 5.5 0 1 0 13.5 8" />
		<path d="M8.4 8h5.1" />
	</>,
);

/** Two crossing diagonals: the X of xAI. */
const XAIMark = mark(
	"xai",
	<>
		<path d="M2.8 2.8 13.2 13.2" />
		<path d="M13.2 2.8 2.8 13.2" opacity={0.55} />
	</>,
);

/** Two interlocking loops: the infinity read of Meta. */
const MetaMark = mark(
	"meta",
	<path d="M1.8 8c0-2.2 1.2-3.6 2.7-3.6C6.6 4.4 8 8 8 8s1.4 3.6 3.5 3.6c1.5 0 2.7-1.4 2.7-3.6s-1.2-3.6-2.7-3.6C9.4 4.4 8 8 8 8S6.6 11.6 4.5 11.6C3 11.6 1.8 10.2 1.8 8z" />,
);

/** Three stepped bars: the Mistral fan, flattened to stripes. */
const MistralMark = mark(
	"mistral",
	<>
		<path d="M2.5 3.5h11" />
		<path d="M2.5 8h7.5" />
		<path d="M2.5 12.5h11" opacity={0.55} />
	</>,
);

/** Nested arcs over a baseline: a wave (the deep) on the seabed. */
const DeepSeekMark = mark(
	"deepseek",
	<>
		<path d="M1.8 11.6c2-3.2 4-3.2 6.2 0 2.2-3.2 4.2-3.2 6.2 0" />
		<path d="M4.4 6.6c1.2-1.6 2.4-1.6 3.6 0 1.2-1.6 2.4-1.6 3.6 0" opacity={0.55} />
	</>,
);

/** Circle with a descender: a "q" cut to two strokes. */
const QwenMark = mark(
	"qwen",
	<>
		<circle cx={8} cy={7.4} r={4.4} />
		<path d="M10.4 10.2 13 13.4" />
	</>,
);

/** Two opposing triangles: an "M" as mirrored chevrons. */
const MiniMaxMark = mark(
	"minimax",
	<>
		<path d="M1.8 12.4 6 3.6v8.8" />
		<path d="M14.2 12.4 10 3.6v8.8" opacity={0.55} />
	</>,
);

/** Crescent: a filled disc with an offset bite. */
const MoonshotMark = mark("moonshot", <path d="M11.6 10.9A5 5 0 0 1 6.1 4a5 5 0 1 0 5.5 6.9z" />);

/** Concentric arcs opening upward: the gateway's "W" as nested rings. */
const WisaMark = mark(
	"wisa",
	<>
		<circle cx={8} cy={8} r={5.6} />
		<path d="M4.6 8.6 8 5.2l3.4 3.4" />
	</>,
);

/** Fallback: a plain cube outline, readable at 10px. */
const GenericMark = mark(
	"generic",
	<>
		<rect height={9.4} rx={2.2} width={9.4} x={3.3} y={3.3} />
		<path d="M3.3 8h9.4" opacity={0.45} />
	</>,
);

/* -------------------------------------------------------------------------- */
/* Label table — the single source of truth for group headers.                 */
/* -------------------------------------------------------------------------- */

interface BrandEntry {
	key: BrandKey;
	label: string;
	Icon: ComponentType<BrandIconProps>;
	/** Normalised ids/aliases that resolve here (see `normalizeId`). */
	aliases: readonly string[];
}

/** Fallback row: no aliases, so it is reachable only through the resolver. */
const GENERIC_ENTRY: BrandEntry = { key: "generic", label: "Other", Icon: GenericMark, aliases: [] };

const ENTRIES: readonly BrandEntry[] = [
	{
		key: "openai",
		label: "OpenAI",
		Icon: OpenAIMark,
		aliases: ["openai", "openaicodex", "gpt", "chatgpt", "codex"],
	},
	{
		key: "anthropic",
		label: "Anthropic",
		Icon: AnthropicMark,
		aliases: ["anthropic", "claude", "claudecode"],
	},
	{
		key: "google",
		label: "Google",
		Icon: GoogleMark,
		aliases: ["google", "googleai", "googlevertex", "vertex", "vertexai", "gemini", "antigravity"],
	},
	{ key: "xai", label: "xAI", Icon: XAIMark, aliases: ["xai", "xgrok", "grok"] },
	{ key: "meta", label: "Meta", Icon: MetaMark, aliases: ["meta", "metaai", "llama", "together"] },
	{ key: "mistral", label: "Mistral", Icon: MistralMark, aliases: ["mistral", "mistralai", "mixtral", "codestral"] },
	{ key: "deepseek", label: "DeepSeek", Icon: DeepSeekMark, aliases: ["deepseek", "deepseekai"] },
	{ key: "qwen", label: "Qwen", Icon: QwenMark, aliases: ["qwen", "qwenai", "alibaba", "dashscope", "tongyi"] },
	{ key: "minimax", label: "MiniMax", Icon: MiniMaxMark, aliases: ["minimax", "minimaxi", "hailuo"] },
	{ key: "moonshot", label: "Moonshot", Icon: MoonshotMark, aliases: ["moonshot", "moonshotai", "kimi", "kimicode"] },
	{ key: "wisa", label: "Wisa", Icon: WisaMark, aliases: ["wisa", "wisastudio", "wisagateway"] },
	GENERIC_ENTRY,
];

/** `openai-codex` / `OpenAI_Codex` / `OpenAI Codex` → `openaicodex`. */
function normalizeId(id: string): string {
	return id.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const BY_ALIAS: Record<string, BrandEntry> = {};
for (const entry of ENTRIES) {
	for (const alias of entry.aliases) BY_ALIAS[alias] = entry;
}

/**
 * The wire protocol is a weak hint, and only for protocols that belong to one
 * vendor. `openai-completions` is the universal compatibility layer — most
 * gateways speak it — so it never implies OpenAI; `openai-responses` does.
 */
function brandFromApi(api: string): BrandEntry | undefined {
	const normalised = normalizeId(api);
	if (normalised.startsWith("anthropic")) return BY_ALIAS.anthropic;
	if (normalised.startsWith("openairesponses")) return BY_ALIAS.openai;
	if (normalised.startsWith("google") || normalised.startsWith("gemini")) return BY_ALIAS.google;
	return undefined;
}

/**
 * Resolve a provider id (and optionally its wire `api`) to a vendor brand.
 * Unknown ids resolve to the generic mark, labelled with the id itself, so a
 * user-defined gateway still reads as itself in the picker.
 */
export function providerBrand(provider: string, api?: string): Brand {
	const id = typeof provider === "string" ? provider : "";
	const direct = BY_ALIAS[normalizeId(id)];
	if (direct) return { key: direct.key, label: direct.label, Icon: direct.Icon };
	const hinted = api ? brandFromApi(api) : undefined;
	if (hinted) return { key: hinted.key, label: hinted.label, Icon: hinted.Icon };
	// Keep the id exactly as configured: a user-defined gateway still reads as itself.
	const trimmed = id.trim();
	const label = trimmed || GENERIC_ENTRY.label;
	return { key: GENERIC_ENTRY.key, label, Icon: GENERIC_ENTRY.Icon };
}
