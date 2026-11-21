/**
 * Contracts for the Work-session desktop-control default: it must only fire for
 * a session in the Work workspace, must not overwrite an existing choice, and
 * must fire at most once per tab.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceMode } from "../stores/workspace-mode";
import { applyWorkComputerDefault, resetWorkComputerDefaults } from "./work-computer";

const WORK = "/home/person/.omp/work";

// The renderer's bridge is not present in a node test; a fake keeps the
// contract honest without a DOM.
const bridge = { commandForTab: async (_tabId: string, command: Record<string, unknown>) => command };
(globalThis as { window?: unknown }).window = { omp: { rpc: bridge } } as never;

function stubRpc(initial: unknown) {
	const values: Record<string, unknown> = { "computer.enabled": initial };
	const calls: Array<Record<string, unknown>> = [];
	bridge.commandForTab = async (_tabId: string, command: Record<string, unknown>) => {
		calls.push(command);
		if (command.type === "get_settings") {
			const paths = (command.paths as string[] | undefined) ?? [];
			return {
				id: command.id,
				type: "response",
				success: true,
				data: { values: Object.fromEntries(paths.map(path => [path, values[path]])) },
			};
		}
		if (command.type === "set_setting") {
			values[command.path as string] = command.value;
			return { id: command.id, type: "response", success: true, data: {} };
		}
		return { id: command.id, type: "response", success: false, error: "unexpected" };
	};
	return { calls, values };
}

beforeEach(() => {
	resetWorkComputerDefaults();
	useWorkspaceMode.setState({ defaultWorkspace: WORK });
});

afterEach(() => {
	resetWorkComputerDefaults();
	useWorkspaceMode.setState({ defaultWorkspace: null });
});

describe("Work session desktop control", () => {
	it("turns computer use on for a Work session that has it off", async () => {
		const { calls, values } = stubRpc(false);
		expect(await applyWorkComputerDefault("tab-1", WORK)).toBe(true);
		expect(values["computer.enabled"]).toBe(true);
		expect(calls.map(call => call.type)).toEqual(["get_settings", "set_setting"]);
	});

	it("leaves a project session alone", async () => {
		const { calls } = stubRpc(false);
		expect(await applyWorkComputerDefault("tab-1", "/repo")).toBe(false);
		expect(calls).toEqual([]);
	});

	it("never re-enables what the user turned off during the same tab", async () => {
		const { calls } = stubRpc(false);
		await applyWorkComputerDefault("tab-1", WORK);
		const before = calls.length;
		// The user turns it back off; the boot path must not run again for this tab.
		await applyWorkComputerDefault("tab-1", WORK);
		expect(calls.length).toBe(before);
	});

	it("keeps an existing on setting untouched, without a second write", async () => {
		const { calls } = stubRpc(true);
		expect(await applyWorkComputerDefault("tab-1", WORK)).toBe(false);
		expect(calls.map(call => call.type)).toEqual(["get_settings"]);
	});

	it("does nothing while the Work path is still unknown", async () => {
		useWorkspaceMode.setState({ defaultWorkspace: null });
		const { calls } = stubRpc(false);
		// load() cannot resolve without a sidecar; the call must not guess.
		expect(await applyWorkComputerDefault("tab-1", WORK)).toBe(false);
		expect(calls).toEqual([]);
	});
});
