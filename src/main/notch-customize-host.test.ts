import type { BrowserWindow } from "electron";
import { describe, expect, it, vi } from "vitest";
import type { HostToolCallRequest, HostToolDefinition, RpcCommand } from "../shared/rpc-types";
import { NOTCH_APP_TOOL, NotchCustomizeHost } from "./notch-customize-host";
import type { SidecarManager } from "./sidecar";

const base: HostToolDefinition[] = ["schedule_task", "browser_use", "workspace_peer"].map(name => ({
	name,
	description: name,
	parameters: {},
}));
const request: HostToolCallRequest = {
	type: "host_tool_call",
	id: "1",
	toolCallId: "tc1",
	toolName: "notch_app",
	arguments: { action: "list" },
};
const owner = {} as BrowserWindow;
function setup() {
	const command = vi.fn(async (_command: RpcCommand) => ({
		type: "response" as const,
		command: "test",
		success: true,
		data: { isStreaming: false, isCompacting: false },
	}));
	const sendSideChannel = vi.fn();
	const sidecar = {
		rpcClient: { command },
		allowsInteractiveHostTools: true,
		sendSideChannel,
	} as unknown as SidecarManager;
	const execute = vi.fn(async () => ({ apps: [] }));
	const host = new NotchCustomizeHost(execute);
	return { command, sendSideChannel, sidecar, execute, host };
}

describe("session-gated notch tool", () => {
	it("only publishes SDK after explicit enable and composes all base tools on every update", async () => {
		const { host, sidecar, command } = setup();
		await host.register("a", sidecar, base);
		expect(command).toHaveBeenLastCalledWith({ type: "set_host_tools", tools: base });
		expect(JSON.stringify(command.mock.calls)).not.toContain("window.wisa");
		expect(await host.setEnabled("a", true)).toEqual({ enabled: true });
		expect(command).toHaveBeenLastCalledWith({ type: "set_host_tools", tools: [...base, NOTCH_APP_TOOL] });
		expect(NOTCH_APP_TOOL.description).toContain("window.wisa.request");
		await host.setEnabled("a", false);
		expect(command).toHaveBeenLastCalledWith({ type: "set_host_tools", tools: base });
	});

	it("rejects ungranted calls, revokes off immediately and prevents queued execution", async () => {
		const { host, sidecar, execute, sendSideChannel } = setup();
		await host.register("a", sidecar, base);
		expect(host.handleToolCall(sidecar, request, owner)).toBe(true);
		expect(sendSideChannel).toHaveBeenLastCalledWith(expect.objectContaining({ isError: true }));
		await host.setEnabled("a", true);
		host.handleToolCall(sidecar, { ...request, id: "2" }, owner);
		await host.setEnabled("a", false);
		expect(execute).not.toHaveBeenCalled();
	});

	it("resets grants on session change, rejects replays, and isolates tabs", async () => {
		const { host, sidecar, execute } = setup();
		const other = setup();
		await host.register("a", sidecar, base);
		await host.register("b", other.sidecar, base);
		await host.setEnabled("a", true);
		host.handleToolCall(sidecar, request, owner);
		await Promise.resolve();
		await Promise.resolve();
		expect(execute).toHaveBeenCalledTimes(1);
		host.handleToolCall(sidecar, request, owner);
		host.handleToolCall(other.sidecar, { ...request, id: "other" }, owner);
		host.reset("a");
		host.handleToolCall(sidecar, { ...request, id: "new" }, owner);
		await Promise.resolve();
		expect(execute).toHaveBeenCalledTimes(1);
	});

	it("does not grant on registration error or busy session", async () => {
		const { host, sidecar, command, execute } = setup();
		await host.register("a", sidecar, base);
		command.mockRejectedValueOnce(new Error("RPC failed"));
		await expect(host.setEnabled("a", true)).rejects.toThrow("RPC failed");
		host.handleToolCall(sidecar, request, owner);
		expect(execute).not.toHaveBeenCalled();
		command.mockResolvedValueOnce({
			type: "response",
			command: "get_state",
			success: true,
			data: { isStreaming: true, isCompacting: false },
		});
		await expect(host.setEnabled("a", true)).rejects.toThrow("active turn");
	});
	it("does not grant when set_host_tools itself fails and refuses calls from a replaced client", async () => {
		const { host, sidecar, command, execute } = setup();
		await host.register("a", sidecar, base);
		command.mockResolvedValueOnce({
			type: "response",
			command: "get_state",
			success: true,
			data: { isStreaming: false, isCompacting: false },
		});
		command.mockRejectedValueOnce(new Error("registry failed"));
		await expect(host.setEnabled("a", true)).rejects.toThrow("registry failed");
		host.handleToolCall(sidecar, request, owner);
		expect(execute).not.toHaveBeenCalled();
		await host.setEnabled("a", true);
		Object.assign(sidecar, { rpcClient: setup().sidecar.rpcClient });
		host.handleToolCall(sidecar, { ...request, id: "restarted" }, owner);
		expect(execute).not.toHaveBeenCalled();
	});
	it("aborts an already dispatched executor immediately on off or session reset", async () => {
		for (const revoke of ["off", "reset", "close", "dispose"]) {
			const { sidecar, command } = setup();
			const { promise: started, resolve: markStarted } = Promise.withResolvers<AbortSignal>();
			const { promise: result, resolve: finish } = Promise.withResolvers<unknown>();
			const host = new NotchCustomizeHost(async (_args, _owner, signal) => {
				markStarted(signal);
				return result;
			});
			await host.register("a", sidecar, base);
			await host.setEnabled("a", true);
			host.handleToolCall(sidecar, request, owner);
			const signal = await started;
			expect(signal.aborted).toBe(false);
			if (revoke === "off") await host.setEnabled("a", false);
			else if (revoke === "reset") host.reset("a");
			else if (revoke === "close") host.close("a");
			else host.dispose();
			expect(signal.aborted).toBe(true);
			finish({});
			expect(command).toHaveBeenCalled();
		}
	});

	it("cannot commit a pending enable across session reset", async () => {
		const { host, sidecar, command, execute } = setup();
		await host.register("a", sidecar, base);
		const { promise, resolve: finish } = Promise.withResolvers<void>();
		const { promise: started, resolve: markStarted } = Promise.withResolvers<void>();
		command.mockImplementationOnce(async () => {
			markStarted();
			await promise;
			return {
				type: "response",
				command: "get_state",
				success: true,
				data: { isStreaming: false, isCompacting: false },
			};
		});
		const enabling = host.setEnabled("a", true);
		await started;
		host.reset("a");
		finish();
		expect(await enabling).toEqual({ enabled: false });
		host.handleToolCall(sidecar, request, owner);
		expect(execute).not.toHaveBeenCalled();
		host.dispose();
		await expect(host.setEnabled("a", true)).rejects.toThrow("unavailable");
	});
});
