import { describe, expect, it } from "vitest";
import {
	isSoleToolCommand,
	type ToolCommandDispatch,
	toolCommandDispatches,
	toolCommandInnerResult,
	toolCommandLabel,
} from "./tool-commands";

/** A `bash` result whose details record one or more dispatched tool commands. */
function commandResult(dispatches: unknown[], extra: Record<string, unknown> = {}) {
	return {
		content: [{ type: "text", text: "Security scan scan-1: reviewing; 3 finding(s)." }],
		details: { exitCode: 0, toolCommands: dispatches, ...extra },
	};
}

const DISPATCH: ToolCommandDispatch = {
	tool: "security_scan",
	mode: "execute",
	exitCode: 0,
	args: { action: "status" },
	inner: { phase: "reviewing" },
};

describe("toolCommandDispatches", () => {
	it("reads the dispatch records a bash result carries", () => {
		expect(toolCommandDispatches("bash", commandResult([DISPATCH]))).toEqual([DISPATCH]);
	});

	it("is empty for a plain shell run and for non-bash tools", () => {
		expect(toolCommandDispatches("bash", { content: [], details: { exitCode: 0 } })).toEqual([]);
		expect(toolCommandDispatches("bash", undefined)).toEqual([]);
		expect(toolCommandDispatches("bash", { details: { toolCommands: "nope" } })).toEqual([]);
		// A `read` or `write` result never carries dispatches.
		expect(toolCommandDispatches("read", commandResult([DISPATCH]))).toEqual([]);
	});

	it("drops records that are not a well-formed dispatch", () => {
		const records = [
			DISPATCH,
			{ tool: "grep" },
			{ tool: "grep", mode: "run", exitCode: 0 },
			{ tool: "grep", mode: "execute", exitCode: "0" },
			{ tool: "grep", mode: "execute", exitCode: 0, args: [1, 2] },
			null,
		];
		expect(toolCommandDispatches("bash", commandResult(records))).toEqual([DISPATCH]);
	});

	it("keeps invocation order", () => {
		const second: ToolCommandDispatch = { tool: "grep", mode: "execute", exitCode: 1, args: { pattern: "x" } };
		expect(toolCommandDispatches("bash", commandResult([DISPATCH, second]))).toEqual([DISPATCH, second]);
	});
});

describe("isSoleToolCommand", () => {
	it("accepts the command alone, with plain arguments", () => {
		expect(isSoleToolCommand("security_scan", "security_scan")).toBe(true);
		expect(isSoleToolCommand("lsp references buildTool", "lsp")).toBe(true);
		expect(isSoleToolCommand('resolve "apply the staged rename"', "resolve")).toBe(true);
		expect(isSoleToolCommand("  grep --pattern 'a|b'  ", "grep")).toBe(true);
	});

	it("rejects anything that could add or change output", () => {
		expect(isSoleToolCommand("lsp references x | head -20", "lsp")).toBe(false);
		expect(isSoleToolCommand("grep x && echo done", "grep")).toBe(false);
		expect(isSoleToolCommand("grep x > out.txt", "grep")).toBe(false);
		expect(isSoleToolCommand("grep $(cat list)", "grep")).toBe(false);
		expect(isSoleToolCommand('grep "$(cat list)"', "grep")).toBe(false);
		expect(isSoleToolCommand("grep x; ls", "grep")).toBe(false);
	});

	it("rejects a different command that merely shares the prefix", () => {
		expect(isSoleToolCommand("grepx foo", "grep")).toBe(false);
		expect(isSoleToolCommand("", "grep")).toBe(false);
		expect(isSoleToolCommand(undefined, "grep")).toBe(false);
	});
});

describe("toolCommandInnerResult", () => {
	it("hands the wrapped tool its own details instead of the shell envelope", () => {
		const inner = { report: "findings", rewound: true };
		const unwrapped = toolCommandInnerResult({ ...DISPATCH, inner }, "ok") as Record<string, unknown>;
		expect(unwrapped.details).toEqual(inner);
		expect(unwrapped.content).toEqual([{ type: "text", text: "ok" }]);
		expect(unwrapped.isError).toBe(false);
	});

	it("carries no body when the command shared the run with other lines", () => {
		const unwrapped = toolCommandInnerResult(DISPATCH, undefined) as Record<string, unknown>;
		expect(unwrapped.content).toEqual([]);
	});

	it("reads a non-zero exit as the wrapped tool's failure", () => {
		const unwrapped = toolCommandInnerResult({ ...DISPATCH, exitCode: 2 }, undefined) as Record<string, unknown>;
		expect(unwrapped.isError).toBe(true);
	});
});

describe("toolCommandLabel", () => {
	it("names an MCP command by server and tool", () => {
		expect(toolCommandLabel("mcp__docs_search")).toBe("docs/search");
	});

	it("keeps a plain tool name as written", () => {
		expect(toolCommandLabel("security_scan")).toBe("security_scan");
		expect(toolCommandLabel("mcp__")).toBe("mcp__");
	});
});
