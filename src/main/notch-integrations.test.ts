import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }));

import type { NotchAgent } from "../shared/agent-notch";
import { NotchIntegrations } from "./notch-integrations";

const require = createRequire(import.meta.url);
const { forward } = require("../../resources/notch-agent-hook.cjs") as {
	forward: (
		path: string,
		agent: string,
		event: string,
		payload: Record<string, unknown>,
	) => Promise<Record<string, unknown>>;
};
let root: string;
let home: string;
let directory: string;
let bridge: NotchIntegrations;
let port: number;
let token: string;
let enabled: string[];
let events: Array<{ event: Record<string, unknown>; respond?: (reply: unknown) => void }>;
let cancels: string[];
let observed: ((value: { event: Record<string, unknown>; respond?: (reply: unknown) => void }) => void) | undefined;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wisa-notch-integrations-"));
	home = join(root, "home");
	directory = join(root, "profile");
	events = [];
	cancels = [];
	enabled = ["claude", "codex", "cursor", "gemini", "copilot", "opencode", "custom"];
	observed = undefined;
	bridge = new NotchIntegrations({
		directory,
		home,
		enabledAgents: () => enabled,
		onEvent: (event, respond) => {
			const value = { event, respond };
			events.push(value);
			observed?.(value);
		},
		onCancel: id => cancels.push(id),
	});
	await bridge.start();
	({ port, token } = JSON.parse(await readFile(join(directory, "bridge.json"), "utf8")));
});
afterEach(async () => {
	bridge.dispose();
	await rm(root, { recursive: true, force: true });
});

async function post(
	body: unknown,
	headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
	const response = await fetch(`http://127.0.0.1:${port}/events`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...headers },
		body: JSON.stringify(body),
	});
	return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}
function envelope(agent: string, event: string, payload: Record<string, unknown> = {}) {
	return { agent, event, payload: { session_id: "session-one", ...payload } };
}
function nextEvent() {
	const deferred = Promise.withResolvers<{ event: Record<string, unknown>; respond?: (reply: unknown) => void }>();
	observed = deferred.resolve;
	return deferred.promise;
}

describe("opt-in registrations", () => {
	it("starts privately without installing agent hooks or exporting the token", async () => {
		expect((await bridge.list()).every(entry => !entry.connected)).toBe(true);
		await expect(readdir(home)).rejects.toMatchObject({ code: "ENOENT" });
		if (process.platform !== "win32") expect((await stat(join(directory, "bridge.json"))).mode & 0o777).toBe(0o600);
		expect(JSON.stringify(await bridge.list())).not.toContain(token);
	});
	it.each(["claude", "codex", "cursor", "gemini", "copilot", "opencode", "custom"] as NotchAgent[])(
		"connects/disconnects/reconnects %s without automatic trust",
		async agent => {
			const entries = await bridge.connect(agent, true);
			const info = entries.find(item => item.agent === agent)!;
			expect(info.connected).toBe(true);
			expect(await readFile(info.configPath, "utf8")).not.toContain(token);
			expect((await bridge.connect(agent, false)).find(item => item.agent === agent)?.connected).toBe(false);
			expect((await bridge.connect(agent, true)).find(item => item.agent === agent)?.connected).toBe(true);
		},
	);
	it("preserves unrelated settings and hooks and backs up original configuration", async () => {
		const path = join(home, ".claude", "settings.json");
		await mkdir(join(home, ".claude"), { recursive: true });
		const original = {
			permissions: { allow: ["Read"] },
			hooks: {
				Stop: [{ matcher: "*", hooks: [{ type: "command", command: "my-existing-hook" }] }],
				UnknownEvent: [{ custom: true }],
			},
		};
		await writeFile(path, JSON.stringify(original));
		await bridge.connect("claude", true);
		await bridge.connect("claude", true);
		const connected = JSON.parse(await readFile(path, "utf8"));
		expect(connected.hooks.Stop).toHaveLength(2);
		await bridge.connect("claude", false);
		expect(JSON.parse(await readFile(path, "utf8"))).toEqual(original);
		const backup = (await readdir(dirname(path))).find(name => name.includes(".wisa-backup-"));
		expect(backup).toBeDefined();
	});
	it("refuses malformed configs and edited managed entries rather than overwriting", async () => {
		const [info] = await bridge.connect("claude", true);
		const config = JSON.parse(await readFile(info!.configPath, "utf8"));
		config.hooks.Stop[0].hooks[0].timeout = 999;
		const edited = JSON.stringify(config);
		await writeFile(info!.configPath, edited);
		await expect(bridge.connect("claude", false)).rejects.toThrow("edited");
		expect(await readFile(info!.configPath, "utf8")).toBe(edited);
		await writeFile(info!.configPath, "[1,2]");
		await expect(bridge.connect("claude", true)).rejects.toThrow("Invalid existing");
		expect(await readFile(info!.configPath, "utf8")).toBe("[1,2]");
	});
	it("uses real agent hook layouts and an OpenCode plugin without a system Node dependency", async () => {
		for (const agent of ["claude", "codex", "cursor", "gemini", "copilot", "opencode"] as NotchAgent[])
			await bridge.connect(agent, true);
		const list = await bridge.list();
		const read = async (agent: string) => readFile(list.find(item => item.agent === agent)!.configPath, "utf8");
		expect(list.find(item => item.agent === "codex")?.configPath).toBe(join(home, ".codex", "hooks.json"));
		expect(JSON.parse(await read("claude")).hooks.PermissionRequest[0].hooks[0].timeout).toBe(100);
		expect(JSON.parse(await read("gemini")).hooks.BeforeAgent[0].hooks[0].type).toBe("command");
		expect(JSON.parse(await read("cursor")).hooks.postToolUse[0].command).toContain(
			process.platform === "win32" ? "-EncodedCommand" : "ELECTRON_RUN_AS_NODE",
		);
		const copilot = JSON.parse(await read("copilot"));
		expect(copilot.hooks.sessionStart[0]).toMatchObject({
			exec: process.execPath,
			env: { ELECTRON_RUN_AS_NODE: "1" },
		});
		expect(copilot.hooks.permissionRequest).toBeUndefined();
		const plugin = await read("opencode");
		expect(plugin).toContain(JSON.stringify(process.execPath));
		expect(plugin).toContain("tool.execute.before");
		expect(plugin).not.toContain("permission.ask':");
	});
});

describe("authenticated local event bridge", () => {
	it("rejects browser requests, wrong token, disabled and disconnected agents", async () => {
		const body = envelope("custom", "SessionStart");
		expect((await post(body)).status).toBe(403);
		await bridge.connect("custom", true);
		const forbiddenHeaders: Record<string, string>[] = [
			{ Origin: "https://attacker.invalid" },
			{ Cookie: "x=y" },
			{ Authorization: "Bearer wrong" },
			{ "Sec-Fetch-Site": "same-origin" },
		];
		for (const headers of forbiddenHeaders) expect((await post(body, headers)).status).toBe(403);
		enabled = [];
		expect((await post(body)).status).toBe(403);
		expect(events).toHaveLength(0);
	});
	it("bounds event bodies, rejects unknown protocols, strips incoming executable metadata", async () => {
		await bridge.connect("custom", true);
		expect((await post(envelope("custom", "runAnything"))).status).toBe(400);
		expect((await post(envelope("custom", "SessionStart", { session_id: "../../bad" }))).status).toBe(400);
		expect((await post(envelope("custom", "SessionStart", { prompt: "x".repeat(270000) }))).status).toBe(413);
		expect(
			(
				await post(
					envelope("custom", "SessionStart", {
						_agent: "wisa",
						_request_id: "spoof",
						_terminal: { command: "malicious" },
						_agent_pid: 123,
						transcript_path: "/secret",
						tool_input: { command: "display only", hidden: "secret" },
					}),
				)
			).status,
		).toBe(200);
		expect(events[0]?.event).toMatchObject({
			_agent: "custom",
			session_id: "custom:session-one",
			tool_input: { command: "display only" },
		});
		for (const key of ["_terminal", "_agent_pid", "transcript_path", "_request_id"])
			expect(events[0]?.event).not.toHaveProperty(key);
	});
	it.each([
		["claude", "SessionStart", { session_id: "a" }, "SessionStart"],
		["codex", "UserPromptSubmit", { session_id: "a", prompt: "hello" }, "UserPromptSubmit"],
		["cursor", "beforeSubmitPrompt", { conversation_id: "cursor-a", session_id: undefined }, "UserPromptSubmit"],
		["gemini", "BeforeAgent", { session_id: "a" }, "UserPromptSubmit"],
		[
			"copilot",
			"preToolUse",
			{ sessionId: "copilot-a", session_id: undefined, toolName: "bash", toolArgs: { command: "ls" } },
			"PreToolUse",
		],
		["opencode", "session.status", { session_id: undefined, sessionID: "oc-a", status: { type: "idle" } }, "Stop"],
	] as const)("adapts %s %s to canonical panel events", async (agent, event, payload, canonical) => {
		await bridge.connect(agent, true);
		expect((await post(envelope(agent, event, payload))).status).toBe(200);
		expect(events[0]?.event).toMatchObject({ _agent: agent, _wisa_normalized: true, hook_event_name: canonical });
		expect(events[0]?.event.session_id).toMatch(new RegExp(`^${agent}:`));
	});
	it("keeps notification-only providers out of approval callbacks", async () => {
		for (const agent of ["cursor", "gemini", "copilot", "opencode"] as NotchAgent[]) {
			await bridge.connect(agent, true);
			expect((await post(envelope(agent, "PermissionRequest", { request_id: "x" }))).status).toBe(400);
		}
		expect(events).toHaveLength(0);
	});
	it.each(["claude", "codex", "custom"] as const)(
		"blocks %s only for a real explicit request and converts panel decisions",
		async agent => {
			await bridge.connect(agent, true);
			const observedEvent = nextEvent();
			const result = post(
				envelope(agent, "PermissionRequest", {
					request_id: "request-one",
					response_mode: "allow-deny",
					tool_name: "Bash",
					tool_input: { command: "ls" },
				}),
			);
			const pending = await observedEvent;
			expect(pending.event._request_id).toBe(`${agent}:request-one`);
			pending.respond?.({ behavior: "allow", _request_id: `${agent}:request-one` });
			expect((await result).body).toEqual(
				agent === "custom"
					? { decision: "allow", requestId: "custom:request-one" }
					: { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } },
			);
			expect(cancels).toHaveLength(0);
		},
	);
	it.each(["ask", "always", "answer", "unexpected"])("returns no override for %s", async behavior => {
		await bridge.connect("claude", true);
		const event = nextEvent();
		const result = post(envelope("claude", "PermissionRequest", { request_id: "request-one" }));
		(await event).respond?.({ behavior });
		expect((await result).body).toEqual({});
		expect(cancels).toEqual(["claude:request-one"]);
	});
	it("requires custom capability and cancels on disconnect without answering", async () => {
		await bridge.connect("custom", true);
		expect((await post(envelope("custom", "PermissionRequest", { request_id: "no-capability" }))).status).toBe(400);
		const event = nextEvent();
		const result = post(
			envelope("custom", "PermissionRequest", { request_id: "request-one", response_mode: "allow-deny" }),
		);
		await event;
		await bridge.connect("custom", false);
		expect((await result).body).toEqual({});
		expect(cancels).toEqual(["custom:request-one"]);
	});
	it("cleans pending approvals when the hook connection closes", async () => {
		await bridge.connect("claude", true);
		const event = nextEvent();
		const socket = request({
			host: "127.0.0.1",
			port,
			path: "/events",
			method: "POST",
			headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
		});
		socket.on("error", () => {});
		socket.end(JSON.stringify(envelope("claude", "PermissionRequest", { request_id: "cancel-me" })));
		await event;
		const cancelled = Promise.withResolvers<void>();
		// Observe cancellation through the public callback, not internal maps.
		const previousPush = cancels.push.bind(cancels);
		cancels.push = (...values) => {
			const length = previousPush(...values);
			cancelled.resolve();
			return length;
		};
		socket.destroy();
		await cancelled.promise;
		expect(Array.from(cancels)).toEqual(["claude:cancel-me"]);
	});
	it("limits live session identities", async () => {
		await bridge.connect("custom", true);
		for (let index = 0; index < 128; index++)
			expect((await post(envelope("custom", "SessionStart", { session_id: `s-${index}` }))).status).toBe(200);
		expect((await post(envelope("custom", "SessionStart", { session_id: "overflow" }))).status).toBe(429);
		await post(envelope("custom", "SessionEnd", { session_id: "s-0" }));
		expect((await post(envelope("custom", "SessionStart", { session_id: "overflow" }))).status).toBe(200);
	});
});

describe("bundled command helper", () => {
	it("uses stdin and the authenticated endpoint without executing event commands", async () => {
		await bridge.connect("claude", true);
		const { promise, resolve, reject } = Promise.withResolvers<{ code: number | null; stdout: string }>();
		const child = spawn(
			process.execPath,
			[join(directory, "notch-agent-hook.cjs"), join(directory, "bridge.json"), "claude", "SessionStart"],
			{ env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: ["pipe", "pipe", "pipe"] },
		);
		let stdout = "";
		child.stdout.on("data", chunk => {
			stdout += chunk;
		});
		child.once("error", reject);
		child.once("close", code => resolve({ code, stdout }));
		child.stdin.end(
			JSON.stringify({ session_id: "from-helper", hook_event_name: "SessionStart", command: "must never execute" }),
		);
		expect(await promise).toEqual({ code: 0, stdout: "" });
		expect(events[0]?.event.session_id).toBe("claude:from-helper");
	});
	it.each(["claude", "codex"] as const)(
		"generates transport request IDs for actual %s permission payloads",
		async agent => {
			await bridge.connect(agent, true);
			const event = nextEvent();
			const result = forward(join(directory, "bridge.json"), agent, "PermissionRequest", {
				session_id: "real-native-input",
				hook_event_name: "PermissionRequest",
				tool_use_id: "toolu_123",
				tool_name: "Bash",
				tool_input: { command: "ls" },
			});
			const pending = await event;
			expect(pending.event._request_id).toMatch(new RegExp(`^${agent}:[a-f0-9-]{36}$`));
			pending.respond?.({ behavior: "deny", _request_id: pending.event._request_id });
			expect(await result).toEqual({
				hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "deny" } },
			});
		},
	);
	it("returns no override if the bridge is offline or the config is invalid", async () => {
		bridge.dispose();
		expect(
			await forward(join(directory, "bridge.json"), "claude", "PermissionRequest", { session_id: "offline" }),
		).toEqual({});
		const bad = join(directory, "bad.json");
		await writeFile(bad, JSON.stringify({ port: 2, token: "invalid" }));
		expect(await forward(bad, "claude", "PermissionRequest", {})).toEqual({});
	});
});
