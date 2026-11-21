import { resultDetails } from "./format";

/**
 * Tool commands: with `tools.commands` on, the sidecar mounts a rarely-used
 * (discoverable) tool as a shell command the model runs through `bash`, so the
 * transcript carries one `bash` call whose `details.toolCommands` records each
 * wrapped invocation — its parsed args, its exit status, and the wrapped tool's
 * own details. Without this layer a plan resolution, a security scan or an MCP
 * call renders as a shell run with a wall time and the outcome disappears.
 *
 * Mirrors `ToolCommandDispatch` in
 * `packages/coding-agent/src/tools/tool-commands.ts`.
 */

/** One wrapped invocation, as the `bash` result records it. */
export interface ToolCommandDispatch {
	tool: string;
	mode: "help" | "execute";
	/** Exit status of this invocation, independent of the outer shell status. */
	exitCode: number;
	/** Validated args of the wrapped tool; absent for `help` and for calls that never ran. */
	args?: Record<string, unknown>;
	/** Details object the wrapped tool returned. */
	inner?: unknown;
}

/** Only `bash` carries dispatches; every other tool result is its own. */
const TRANSPORT_TOOLS: Record<string, true> = { bash: true };

function isDispatch(value: unknown): value is ToolCommandDispatch {
	if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.tool === "string" &&
		(record.mode === "help" || record.mode === "execute") &&
		typeof record.exitCode === "number" &&
		(record.args === undefined ||
			(record.args != null && typeof record.args === "object" && !Array.isArray(record.args)))
	);
}

/** Dispatch records on a completed `bash` result, in invocation order; `[]` otherwise. */
export function toolCommandDispatches(toolName: string, result: unknown): ToolCommandDispatch[] {
	if (!Object.hasOwn(TRANSPORT_TOOLS, toolName)) return [];
	const details = resultDetails(result);
	const recorded = details?.toolCommands;
	if (!Array.isArray(recorded)) return [];
	return recorded.filter(isDispatch);
}

/**
 * Whether the whole `bash` call was one executed tool command whose card stands
 * for the call's entire output. Mirrors `isSoleInvocation` in the TUI: the
 * command line is the tool name alone, with no shell metacharacters or
 * expansions that could add or change output.
 */
export function isSoleToolCommand(command: string | undefined, tool: string): boolean {
	const line = command?.trim();
	if (!line || (line !== tool && !line.startsWith(`${tool} `) && !line.startsWith(`${tool}\t`))) return false;
	let quote: "'" | '"' | undefined;
	for (let index = 0; index < line.length; index += 1) {
		const char = line[index];
		if (quote === "'") {
			if (char === "'") quote = undefined;
			continue;
		}
		if (char === "\\") {
			index += 1;
			continue;
		}
		if (quote === '"') {
			if (char === '"') quote = undefined;
			else if (char === "$" || char === "`") return false;
			continue;
		}
		if (char === "'" || char === '"') quote = char;
		else if (";&|<>()`$\n".includes(char)) return false;
	}
	return true;
}

/**
 * Human label for a mounted command: `server/tool` for an MCP name, else the
 * tool name itself (parity with the TUI's command card header).
 */
export function toolCommandLabel(name: string): string {
	if (!name.startsWith("mcp__")) return name;
	const rest = name.slice("mcp__".length);
	const underscore = rest.indexOf("_");
	if (underscore <= 0) return name;
	return `${rest.slice(0, underscore)}/${rest.slice(underscore + 1)}`;
}

/** The wrapped tool's own result, rebuilt so its renderer reads it as a direct call. */
export function toolCommandInnerResult(dispatch: ToolCommandDispatch, output: string | undefined): unknown {
	return {
		content: output ? [{ type: "text", text: output }] : [],
		details: dispatch.inner,
		isError: dispatch.exitCode !== 0,
	};
}
