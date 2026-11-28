import { afterEach, describe, expect, it, vi } from "vitest";
import type { RpcCommand, RpcMcpServerInfo, RpcResponse } from "../../shared/rpc-types";
import { createMcpStore, mcpServerState } from "./mcp";

const server: RpcMcpServerInfo = {
	name: "server",
	transport: "stdio",
	status: "connected",
	enabled: true,
	authed: false,
	toolCount: 283,
};
const ok = (servers: RpcMcpServerInfo[]): RpcResponse => ({
	type: "response",
	command: "get_mcp_servers",
	success: true,
	data: { servers },
});
const stops: Array<() => void> = [];
afterEach(() => {
	for (const stop of stops.splice(0)) stop();
	vi.useRealTimers();
});

describe("live MCP state", () => {
	it("shares one polling reader and observes disconnection and recovery without reconnecting a server", async () => {
		vi.useFakeTimers();
		const command = vi.fn(async (_input: RpcCommand) => ok([server]));
		const store = createMcpStore(command);
		const first = store.getState().watch("session");
		const second = store.getState().watch("session");
		stops.push(first, second);
		await vi.advanceTimersByTimeAsync(0);
		expect(command).toHaveBeenCalledTimes(1);
		command.mockResolvedValueOnce(ok([{ ...server, status: "disconnected", lastError: "Closed" }]));
		await vi.advanceTimersByTimeAsync(1000);
		expect(mcpServerState(store.getState().data?.[0] as RpcMcpServerInfo).key).toBe("error");
		first();
		stops.shift();
		await vi.advanceTimersByTimeAsync(1000);
		expect(store.getState().data?.[0].status).toBe("connected");
		expect(command.mock.calls.every(([input]) => input.type === "get_mcp_servers")).toBe(true);
		second();
		stops.shift();
		const calls = command.mock.calls.length;
		await vi.advanceTimersByTimeAsync(2000);
		expect(command).toHaveBeenCalledTimes(calls);
	});

	it("does not leave a healthy stale snapshot after a read failure, and recovers on the next tick", async () => {
		vi.useFakeTimers();
		const command = vi.fn(async () => ok([server]));
		const store = createMcpStore(command);
		stops.push(store.getState().watch("session"));
		await vi.advanceTimersByTimeAsync(0);
		command.mockRejectedValueOnce(new Error("RPC unavailable"));
		await vi.advanceTimersByTimeAsync(1000);
		expect(store.getState()).toMatchObject({ data: null, error: expect.any(String) });
		await vi.advanceTimersByTimeAsync(1000);
		expect(store.getState()).toMatchObject({ data: [server], error: null });
	});

	it("discards late results from a replaced session", async () => {
		const old = Promise.withResolvers<RpcResponse>();
		const current = Promise.withResolvers<RpcResponse>();
		const command = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
		const store = createMcpStore(command);
		stops.push(store.getState().watch("old"));
		stops.push(store.getState().watch("new"));
		current.resolve(ok([{ ...server, name: "new" }]));
		await current.promise;
		await Promise.resolve();
		old.resolve(ok([{ ...server, name: "old" }]));
		await old.promise;
		await Promise.resolve();
		expect(store.getState().data?.map(value => value.name)).toEqual(["new"]);
	});

	it("serializes a refresh requested during an older read instead of losing a mutation update", async () => {
		const old = Promise.withResolvers<RpcResponse>();
		const command = vi
			.fn()
			.mockReturnValueOnce(old.promise)
			.mockResolvedValue(ok([server]));
		const store = createMcpStore(command);
		const first = store.getState().refresh();
		const afterMutation = store.getState().refresh();
		expect(command).toHaveBeenCalledTimes(1);
		old.resolve(ok([]));
		await Promise.all([first, afterMutation]);
		expect(command).toHaveBeenCalledTimes(2);
		expect(store.getState().data).toEqual([server]);
	});

	it("uses live transport state rather than historical errors, stored credentials, or registered tool count", () => {
		expect(mcpServerState({ ...server, lastError: "Old error", authState: "expired" }).key).toBe("connected");
		expect(mcpServerState({ ...server, status: "connecting", lastError: "Old error" }).key).toBe("connecting");
		expect(mcpServerState({ ...server, status: "disconnected" }).key).toBe("disconnected");
		expect(mcpServerState({ ...server, enabled: false, lastError: "Old error" }).key).toBe("off");
	});
});
