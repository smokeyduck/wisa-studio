export const CODING_TOOL_PROFILE_PREF = "toolProfileCoding";
export const WORK_TOOL_PROFILE_PREF = "toolProfileWork";

/** Native tools whose availability the Coding profile can narrow. */
export const CODING_PROFILE_TOOLS = [
	"read",
	"glob",
	"grep",
	"find",
	"ast_grep",
	"lsp",
	"edit",
	"ast_edit",
	"write",
	"bash",
	"eval",
	"debug",
	"task",
	"ask",
	"todo",
	"web_search",
] as const;

const REQUIRED_WORK_TOOL = "computer";
const DEFAULT_WORK_TOOLS = [REQUIRED_WORK_TOOL, "read", "glob", "grep", "ask", "web_search", "todo"] as const;
export const WORK_PROFILE_TOOLS = [...DEFAULT_WORK_TOOLS, "edit", "write", "recall", "learn", "manage_skill"] as const;

export const CODING_EDIT_MODES = ["hashline", "replace", "core"] as const;
type CodingEditMode = (typeof CODING_EDIT_MODES)[number];

export interface CodingToolProfile {
	disabled: (typeof CODING_PROFILE_TOOLS)[number][];
	editMode: CodingEditMode;
}

export interface WorkToolProfile {
	tools: (typeof WORK_PROFILE_TOOLS)[number][];
}

function isProfile(raw: unknown): raw is Record<string, unknown> {
	return !!raw && typeof raw === "object" && !Array.isArray(raw);
}

function toolList<T extends string>(raw: unknown, allowed: readonly T[], fallback: readonly T[]): T[] {
	return Array.isArray(raw) ? allowed.filter(tool => raw.includes(tool)) : [...fallback];
}

export function readCodingToolProfile(raw: unknown): CodingToolProfile {
	const input = isProfile(raw) ? raw : undefined;
	return {
		disabled: toolList(input?.disabled, CODING_PROFILE_TOOLS, []),
		editMode: CODING_EDIT_MODES.find(mode => mode === input?.editMode) ?? "hashline",
	};
}

export function readWorkToolProfile(raw: unknown): WorkToolProfile {
	const tools = toolList(isProfile(raw) ? raw.tools : undefined, WORK_PROFILE_TOOLS, DEFAULT_WORK_TOOLS);
	if (!tools.includes(REQUIRED_WORK_TOOL)) tools.unshift(REQUIRED_WORK_TOOL);
	return { tools };
}
