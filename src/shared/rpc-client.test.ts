import { describe, expect, it } from "vitest";
import { createSessionRpcClient, fetchTranscript } from "./rpc-client";
import type { RpcCommand, RpcResponse, RpcSessionState } from "./rpc-types";

describe("model RPC timeouts", () => {
	it("gives model switches enough time for provider/session reconfiguration", async () => {
		const calls: Array<{ type: string; timeoutMs: number | undefined }> = [];
		const response: RpcResponse = { type: "response", command: "set_model", success: true };
		const rpc = createSessionRpcClient(async (command, timeoutMs) => {
			calls.push({ type: command.type, timeoutMs });
			return response;
		});

		await rpc.setModel("openai", "gpt-test");
		await rpc.cycleModel();

		expect(calls).toEqual([
			{ type: "set_model", timeoutMs: 30_000 },
			{ type: "cycle_model", timeoutMs: 30_000 },
		]);
	});

	it("loads a complete long transcript in one snapshot instead of rebuilding every page", async () => {
		const messages = Array.from({ length: 5000 }, (_, index) => ({
			role: "user" as const,
			content: `Message ${index}: ${"history ".repeat(100)}`,
			timestamp: index,
		}));
		const calls: string[] = [];
		const rpc = createSessionRpcClient(async command => {
			calls.push(command.type);
			return { type: "response", command: command.type, success: true, data: { messages } };
		});
		const result = await rpc.getTranscript();
		expect(result.success && (result.data as { messages: unknown[] }).messages).toEqual(messages);
		expect(calls).toEqual(["get_transcript"]);
	});

	it("reassembles a transport-limited transcript through paged fallback", async () => {
		const messages = [
			{ role: "user" as const, content: "first", timestamp: 1 },
			{ role: "assistant" as const, content: [{ type: "text" as const, text: "second" }], timestamp: 2 },
		];
		const calls: string[] = [];
		const rpc = createSessionRpcClient(async command => {
			calls.push(command.type);
			if (command.type !== "get_transcript_page")
				return { type: "response", command: command.type, success: false, error: "unexpected command" };
			return {
				type: "response",
				command: "get_transcript_page",
				success: true,
				data:
					command.cursor === undefined
						? { messages: [messages[0]], totalMessages: messages.length, nextCursor: "next" }
						: { messages: [messages[1]], totalMessages: messages.length },
			};
		});

		expect(await rpc.getTranscript()).toEqual({
			type: "response",
			command: "get_transcript",
			success: true,
			data: { messages },
		});
		expect(calls).toEqual(["get_transcript", "get_transcript_page", "get_transcript_page"]);
	});

	it("loads ordered user and assistant history beyond 1000 rows through native cursor paging", async () => {
		const messages = Array.from({ length: 1281 }, (_, index) => ({
			role: index % 2 === 0 ? "user" : "assistant",
			content: `Message ${index}`,
			entryId: `entry-${index}`,
			timestamp: index,
		}));
		const calls: RpcCommand[] = [];
		const result = await fetchTranscript(async command => {
			calls.push(command);
			if (command.type !== "get_transcript_page")
				return { type: "response", command: command.type, success: false, error: "transport limit" };
			const start = command.cursor === undefined ? 0 : Number(command.cursor);
			const end = Math.min(start + (command.limit ?? 256), messages.length);
			return {
				type: "response",
				command: command.type,
				success: true,
				data: {
					messages: messages.slice(start, end),
					totalMessages: messages.length,
					...(end < messages.length ? { nextCursor: String(end) } : {}),
				},
			};
		});
		expect(result).toMatchObject({ success: true, data: { messages } });
		expect(calls).toEqual([
			{ type: "get_transcript" },
			{ type: "get_transcript_page", limit: 256 },
			...[256, 512, 768, 1024, 1280].map(cursor => ({
				type: "get_transcript_page",
				limit: 256,
				cursor: String(cursor),
			})),
		]);
	});
});

describe("thinking shortcut", () => {
	it.each([
		{ mode: undefined, level: "high" },
		{ mode: "provider", level: "auto" },
	] as const)("uses $level only after checking the live sidecar semantics", async ({ mode, level }) => {
		const calls: RpcCommand[] = [];
		const rpc = createSessionRpcClient(async command => {
			calls.push(command);
			const state: Partial<RpcSessionState> = {
				model: { provider: "p", id: "m", reasoning: true },
				thinkingLevels: ["off", "auto", "high"],
				thinkingConfigured: "off",
				thinkingAutoMode: mode,
			};
			return { type: "response", command: command.type, success: true, data: state };
		});
		await rpc.cycleThinkingLevel();
		expect(calls).toEqual([{ type: "get_state" }, { type: "set_thinking_level", level }]);
	});

	it("does not issue a reasoning mutation for a provisional ladder", async () => {
		const calls: RpcCommand[] = [];
		const rpc = createSessionRpcClient(async command => {
			calls.push(command);
			const state: Partial<RpcSessionState> = {
				model: { provider: "p", id: "m", reasoning: true, thinking: { unverified: true } },
				thinkingLevels: ["off", "auto", "high"],
				thinkingConfigured: "auto",
			};
			return { type: "response", command: command.type, success: true, data: state };
		});
		await rpc.cycleThinkingLevel();
		expect(calls).toEqual([{ type: "get_state" }]);
	});
});
