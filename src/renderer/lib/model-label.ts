/**
 * Human names for models.
 *
 * The composer and the picker used to print the raw catalog id
 * (`minimax-m3.1-flash`) wherever a name belonged. The catalog only carries a
 * `name` for some models, so this module also prettifies an id: split on the
 * `-` / `_` / `.` separators, keep known vendor casing and acronyms, and keep
 * version numbers intact (`m3` + `1` reads back as `M3.1`, not `M3 1`).
 */

/** Vendor / product tokens that carry their own casing, keyed lower-case. */
const TOKEN_CASING: Record<string, string> = {
	alibaba: "Alibaba",
	anthropic: "Anthropic",
	claude: "Claude",
	copilot: "Copilot",
	deepseek: "DeepSeek",
	gemini: "Gemini",
	github: "GitHub",
	glm: "GLM",
	google: "Google",
	grok: "Grok",
	kimi: "Kimi",
	llama: "Llama",
	meta: "Meta",
	minimax: "MiniMax",
	mistral: "Mistral",
	moe: "MoE",
	mixtral: "Mixtral",
	moonshot: "Moonshot",
	ollama: "Ollama",
	openai: "OpenAI",
	openrouter: "OpenRouter",
	qwen: "Qwen",
	wisa: "Wisa",
	xai: "xAI",
};

/** Acronyms that stay upper-case wherever they appear as a token. */
const ACRONYMS: Record<string, true> = {
	ai: true,
	api: true,
	gpt: true,
	hd: true,
	llm: true,
	ocr: true,
	stt: true,
	tts: true,
	vl: true,
};

const SEPARATORS = /[-_.\s/]+/;
const DIGITS_ONLY = /^\d+$/;
const ENDS_WITH_DIGIT = /\d$/;
/** `m3`, `o3`, `v3`: a letter prefix glued to a version number. */
const VERSION_TOKEN = /^[a-z]\d/i;

/** Split an id into label tokens, re-gluing a version continuation
 * (`m3` + `1` → `m3.1`) so dotted versions survive the split. */
function tokensOf(id: string): string[] {
	const merged: string[] = [];
	for (const token of id.split(SEPARATORS)) {
		if (!token) continue;
		const last = merged[merged.length - 1];
		if (last !== undefined && DIGITS_ONLY.test(token) && ENDS_WITH_DIGIT.test(last)) {
			merged[merged.length - 1] = `${last}.${token}`;
			continue;
		}
		merged.push(token);
	}
	return merged;
}

function capitalizeToken(token: string): string {
	const known = TOKEN_CASING[token.toLowerCase()];
	if (known) return known;
	if (ACRONYMS[token.toLowerCase()]) return token.toUpperCase();
	// Versions keep their digits: "4o" stays "4o", "m3.1" becomes "M3.1".
	if (/^\d/.test(token)) return token;
	if (VERSION_TOKEN.test(token)) return token[0].toUpperCase() + token.slice(1);
	return token[0].toUpperCase() + token.slice(1).toLowerCase();
}

/** `minimax-m3.1-flash` → `MiniMax M3.1 Flash`. */
export function prettifyModelId(id: string): string {
	const trimmed = id.trim();
	const tokens = tokensOf(trimmed);
	if (tokens.length === 0) return trimmed;
	return tokens.map(capitalizeToken).join(" ");
}

/**
 * Display name for a model: the catalog `name` when the wire carries one,
 * otherwise a prettified id. `null` when there is no model at all, so callers
 * can render their own "choose model" copy.
 */
export function modelLabel(model: { id: string; name?: string | null } | null | undefined): string | null {
	if (!model) return null;
	const id = typeof model.id === "string" ? model.id.trim() : "";
	const name = typeof model.name === "string" ? model.name.trim() : "";
	// A name identical to the id is a catalog echo, not a display name.
	if (name && name !== id) return name;
	if (!id) return name || null;
	return prettifyModelId(id);
}
