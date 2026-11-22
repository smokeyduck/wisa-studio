/** Only distinctive model families reveal a maker without a namespace. */
const FAMILY_PREFIXES: readonly [RegExp, string][] = [
	[/^(gpt-|chatgpt(?:-|$)|codex(?:-|$)|o\d(?:-|$))/, "OpenAI"],
	[/^claude(?=[-\d.]|$)/, "Anthropic"],
	[/^gemini(?=[-\d.]|$)/, "Google"],
	[/^grok(?=[-\d.]|$)/, "xAI"],
	[/^deepseek(?=[-\d.]|$)/, "DeepSeek"],
	[/^glm(?=[-\d.]|$)/, "Z.ai"],
	[/^kimi(?=[-\d.]|$)/, "Moonshot"],
	[/^minimax(?=[-\d.]|$)/, "MiniMax"],
	[/^nemotron(?=[-\d.]|$)/, "NVIDIA"],
	[/^step-?\d/, "StepFun"],
	[/^qwen(?=[-\d.]|$)/, "Qwen"],
	[/^capcut(?:-|$)/, "CapCut"],
];

/**
 * Explicit namespaces retain their spelling; bare ids use known model families.
 * Unknown ids return "" rather than inventing a maker. Display/search only:
 * callers keep the original provider and id for authentication and selection.
 */
export function manufacturerLabel(model: { id: string }): string {
	const slash = model.id.indexOf("/");
	if (slash > 0) return model.id.slice(0, slash);
	const id = model.id.toLowerCase();
	for (const [pattern, label] of FAMILY_PREFIXES) {
		if (pattern.test(id)) return label;
	}
	return "";
}
