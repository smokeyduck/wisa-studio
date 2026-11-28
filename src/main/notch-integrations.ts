import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { chmod, copyFile, lstat, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { app } from "electron";
import type { NotchAgent } from "../shared/agent-notch";
import type { NotchIntegrationInfo } from "../shared/notch-integrations";

type ObjectValue = Record<string, unknown>;
type Options = {
	directory: string;
	home: string;
	enabledAgents: () => readonly string[];
	onEvent: (event: ObjectValue, respond?: (reply: unknown) => void) => void;
	onCancel: (requestId: string) => void;
};
// Protocol references (notification-only unless PermissionRequest is explicitly registered):
// https://code.claude.com/docs/en/hooks
// https://developers.openai.com/codex/hooks
// https://cursor.com/docs/hooks
// https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md
// https://docs.github.com/en/copilot/reference/hooks-reference
// https://github.com/anomalyco/opencode/blob/v1.2.27/packages/plugin/src/index.ts
const AGENTS = ["claude", "codex", "cursor", "gemini", "copilot", "opencode", "custom"] as const;
const COMMON = [
	"SessionStart",
	"SessionEnd",
	"UserPromptSubmit",
	"PreToolUse",
	"PostToolUse",
	"Stop",
	"StopFailure",
	"Notification",
];
const EVENTS: Record<string, readonly string[]> = {
	claude: [...COMMON, "PermissionRequest"],
	codex: [...COMMON.filter(name => name !== "StopFailure" && name !== "Notification"), "PermissionRequest"],
	cursor: ["sessionStart", "sessionEnd", "beforeSubmitPrompt", "postToolUse", "afterAgentResponse", "stop"],
	gemini: ["SessionStart", "SessionEnd", "BeforeAgent", "BeforeTool", "AfterTool", "AfterAgent", "Notification"],
	copilot: [
		"sessionStart",
		"sessionEnd",
		"userPromptSubmitted",
		"preToolUse",
		"postToolUse",
		"agentStop",
		"errorOccurred",
		"notification",
	],
	custom: [...COMMON, "PermissionRequest"],
	opencode: [
		"session.created",
		"session.deleted",
		"session.status",
		"session.error",
		"permission.asked",
		"chat.message",
		"tool.execute.before",
		"tool.execute.after",
	],
};
const MAPS: Record<string, Record<string, string>> = {
	cursor: {
		sessionStart: "SessionStart",
		sessionEnd: "SessionEnd",
		beforeSubmitPrompt: "UserPromptSubmit",
		postToolUse: "PostToolUse",
		afterAgentResponse: "AssistantMessage",
		stop: "Stop",
	},
	gemini: {
		SessionStart: "SessionStart",
		SessionEnd: "SessionEnd",
		BeforeAgent: "UserPromptSubmit",
		BeforeTool: "PreToolUse",
		AfterTool: "PostToolUse",
		AfterAgent: "Stop",
		Notification: "Notification",
	},
	copilot: {
		sessionStart: "SessionStart",
		sessionEnd: "SessionEnd",
		userPromptSubmitted: "UserPromptSubmit",
		preToolUse: "PreToolUse",
		postToolUse: "PostToolUse",
		agentStop: "Stop",
		errorOccurred: "StopFailure",
		notification: "Notification",
	},
};
function object(value: unknown): ObjectValue {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as ObjectValue) : {};
}
function text(value: unknown, max = 8192): string | undefined {
	return typeof value === "string" ? value.slice(0, max).replace(/\u0000/g, "") : undefined;
}
function identifier(value: unknown): value is string {
	return typeof value === "string" && /^[\w.:-]{1,160}$/.test(value);
}
function shellQuote(value: string, windows: boolean): string {
	if (/[\r\n\0]/.test(value)) throw new Error("Invalid hook path");
	return windows ? `'${value.replace(/'/g, "''")}'` : `'${value.replace(/'/g, "'\\''")}'`;
}
async function contents(path: string): Promise<string | null> {
	try {
		const stat = await lstat(path);
		if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024)
			throw new Error(`Unsafe integration file: ${path}`);
		return await readFile(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}
/** Cooperating writes are locked; re-read immediately before rename catches edits made
 * while planning the merge. Never overwrite a malformed or externally edited managed entry. */
async function atomic(path: string, previous: string | null, next: string | null): Promise<void> {
	if (previous === next) return;
	await mkdir(dirname(path), { recursive: true });
	const lock = await open(`${path}.wisa-lock`, "wx", 0o600);
	const temporary = `${path}.wisa-${randomUUID()}`;
	try {
		if ((await contents(path)) !== previous) throw new Error(`Integration changed while editing: ${path}`);
		if (previous !== null) {
			const backup = `${path}.wisa-backup-${Date.now()}-${randomUUID()}`;
			await copyFile(path, backup);
			await chmod(backup, 0o600);
		}
		if (next !== null) await writeFile(temporary, next, { mode: 0o600, flag: "wx" });
		if ((await contents(path)) !== previous) throw new Error(`Integration changed while editing: ${path}`);
		if (next === null) await rm(path);
		else await rename(temporary, path);
	} finally {
		await lock.close();
		await rm(`${path}.wisa-lock`, { force: true });
		await rm(temporary, { force: true });
	}
}

export class NotchIntegrations {
	private server: Server | undefined;
	private token = "";
	private disposed = false;
	private starting: Promise<void> | undefined;
	private readonly pending = new Map<string, { session: string; agent: string; cancel: () => void }>();
	private readonly sessions = new Map<string, number>();
	private readonly installed = new Set<string>();
	private mutation: Promise<unknown> = Promise.resolve();
	private readonly bridgePath: string;
	private readonly helperPath: string;
	constructor(private readonly options: Options) {
		this.bridgePath = join(options.directory, "bridge.json");
		this.helperPath = join(options.directory, "notch-agent-hook.cjs");
	}

	start(): Promise<void> {
		if (this.disposed) return Promise.reject(new Error("Notch integrations disposed"));
		this.starting ??= this.startServer();
		return this.starting;
	}
	private async startServer(): Promise<void> {
		await mkdir(this.options.directory, { recursive: true, mode: 0o700 });
		await chmod(this.options.directory, 0o700);
		const packaged = join(process.resourcesPath ?? "", "notch-agent-hook.cjs");
		const source = app.isPackaged ? packaged : join(app.getAppPath(), "resources", "notch-agent-hook.cjs");
		const helper = await readFile(source, "utf8");
		await atomic(this.helperPath, await contents(this.helperPath), helper);
		this.token = randomBytes(32).toString("hex");
		const server = createServer((request, response) => {
			void this.receive(request, response);
		});
		server.maxConnections = 96;
		server.requestTimeout = 10000;
		server.headersTimeout = 5000;
		server.keepAliveTimeout = 1000;
		this.server = server;
		const { promise, resolve, reject } = Promise.withResolvers<void>();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", reject);
			resolve();
		});
		await promise;
		try {
			if (this.disposed) throw new Error("Notch integrations disposed");
			const address = server.address();
			if (!address || typeof address === "string") throw new Error("No local integration port");
			await atomic(
				this.bridgePath,
				await contents(this.bridgePath),
				`${JSON.stringify({ version: 1, port: address.port, token: this.token })}\n`,
			);
			await this.list();
		} catch (error) {
			server.close();
			throw error;
		}
	}

	private target(agent: string): string {
		const home = this.options.home;
		switch (agent) {
			case "claude":
				return join(home, ".claude", "settings.json");
			case "codex":
				return join(home, ".codex", "hooks.json");
			case "cursor":
				return join(home, ".cursor", "hooks.json");
			case "gemini":
				return join(home, ".gemini", "settings.json");
			case "copilot":
				return join(home, ".copilot", "hooks", "wisa-notch.json");
			case "opencode":
				return join(home, ".config", "opencode", "plugins", "wisa-notch.js");
			default:
				return join(this.options.directory, "custom.json");
		}
	}
	private args(agent: string, event: string): string[] {
		return [this.helperPath, this.bridgePath, agent, event];
	}
	private command(agent: string, event: string, windows = process.platform === "win32"): string {
		const invocation = [process.execPath, ...this.args(agent, event)]
			.map(value => shellQuote(value, windows))
			.join(" ");
		if (!windows) return `ELECTRON_RUN_AS_NODE=1 ${invocation}`;
		const script = `$env:ELECTRON_RUN_AS_NODE='1'; & ${invocation}`;
		return `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(script, "utf16le").toString("base64")}`;
	}
	private entries(agent: string): Record<string, unknown[]> {
		return Object.fromEntries(
			(EVENTS[agent] ?? []).map(event => {
				const command = this.command(agent, event);
				if (agent === "copilot")
					return [
						event,
						[
							{
								type: "command",
								exec: process.execPath,
								args: this.args(agent, event),
								env: { ELECTRON_RUN_AS_NODE: "1" },
								timeoutSec: 5,
							},
						],
					];
				if (agent === "cursor") return [event, [{ command, timeout: 5 }]];
				return [
					event,
					[
						{
							matcher: "*",
							hooks: [
								{
									type: "command",
									command,
									timeout:
										agent === "gemini"
											? 5000
											: event === "PermissionRequest"
												? 100
												: event === "SessionEnd"
													? 3
													: 5,
								},
							],
						},
					],
				];
			}),
		);
	}
	private plugin(): string {
		return `// WISA managed notch plugin v1; notification-only.\nimport { spawn } from 'node:child_process';\nexport const WisaNotch = async ({ directory }) => {\n const send = (name, payload) => new Promise(resolve => {\n  const child = spawn(${JSON.stringify(process.execPath)}, [${JSON.stringify(this.helperPath)}, ${JSON.stringify(this.bridgePath)}, 'opencode', name], {env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['pipe','ignore','ignore'],windowsHide:true});\n  const timer=setTimeout(()=>{child.kill();resolve();},5000);\n  child.once('error',()=>{clearTimeout(timer);resolve();}); child.once('close',()=>{clearTimeout(timer);resolve();}); child.stdin.on('error',()=>{});\n  child.stdin.end(JSON.stringify({...payload,cwd:directory}));\n });\n return { event: async ({event}) => {if (['session.created','session.deleted','session.status','session.error','permission.asked'].includes(event.type)) await send(event.type,event.properties);},\n 'chat.message': async (input,output) => {await send('chat.message',{sessionID:input.sessionID,prompt:output.parts.filter(p=>p.type==='text').map(p=>p.text).join('\\n')});},\n 'tool.execute.before': async (input,output) => {await send('tool.execute.before',{...input,tool_input:output.args});},\n 'tool.execute.after': async (input) => {await send('tool.execute.after',input);} };\n};\n`;
	}
	private async connected(agent: string): Promise<boolean> {
		const raw = await contents(this.target(agent));
		if (raw === null) return false;
		if (agent === "opencode") return raw === this.plugin();
		if (agent === "custom") return raw === this.custom();
		try {
			const hooks = object(object(JSON.parse(raw)).hooks);
			return Object.entries(this.entries(agent)).every(
				([name, entries]) =>
					Array.isArray(hooks[name]) &&
					entries.every(entry =>
						(hooks[name] as unknown[]).some(value => JSON.stringify(value) === JSON.stringify(entry)),
					),
			);
		} catch {
			return false;
		}
	}
	private custom(): string {
		return `${JSON.stringify({ version: 1, protocol: "wisa-notch", bridgeFile: this.bridgePath, endpoint: "/events", authentication: "Bearer token from bridgeFile; never export", agent: "custom", events: EVENTS.custom, request: { agent: "custom", event: "PermissionRequest", payload: { session_id: "your-session-id", hook_event_name: "PermissionRequest", request_id: "unique-request-id", response_mode: "allow-deny", tool_name: "Your tool", tool_input: {} } }, response: { decision: "allow|deny", requestId: "custom:unique-request-id" }, timeoutMs: 90000, emptyResponse: "No override; show your own prompt", cancel: "Close the HTTP connection", browserRequests: "Origin and Cookie forbidden" }, null, 2)}\n`;
	}
	async list(): Promise<NotchIntegrationInfo[]> {
		const list = await Promise.all(
			AGENTS.map(async agent => ({
				agent,
				connected: await this.connected(agent),
				configPath: this.target(agent),
				command: this.command(agent, agent === "custom" ? "SessionStart" : (EVENTS[agent]?.[0] ?? "SessionStart")),
			})),
		);
		this.installed.clear();
		for (const item of list) if (item.connected) this.installed.add(item.agent);
		return list;
	}
	connect(agent: NotchAgent, connected: boolean): Promise<NotchIntegrationInfo[]> {
		const task = this.mutation.then(async () => {
			if (!(AGENTS as readonly string[]).includes(agent)) throw new Error("Unsupported external agent");
			await this.start();
			const path = this.target(agent);
			const previous = await contents(path);
			if (agent === "custom" || agent === "opencode") {
				const expected = agent === "custom" ? this.custom() : this.plugin();
				if (previous !== null && previous !== expected) throw new Error(`Managed integration was edited: ${path}`);
				if (connected && previous === null) await atomic(path, null, expected);
				if (!connected && previous !== null) await atomic(path, previous, null);
			} else {
				const parsed: unknown = previous === null ? {} : JSON.parse(previous);
				if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
					throw new Error("Invalid existing hooks configuration");
				const config = parsed as ObjectValue;
				if (
					config.hooks !== undefined &&
					(typeof config.hooks !== "object" || config.hooks === null || Array.isArray(config.hooks))
				)
					throw new Error("Invalid existing hooks configuration");
				const hooks = { ...object(config.hooks) };
				for (const [event, entries] of Object.entries(this.entries(agent))) {
					const existing = hooks[event] ?? [];
					if (!Array.isArray(existing)) throw new Error(`Invalid existing ${event} hooks`);
					const expected = JSON.stringify(entries[0]);
					// A path match without an exact generated entry is an edited managed hook.
					for (const value of existing)
						if (
							JSON.stringify(value).includes(this.helperPath.replace(/\\/g, "\\\\")) &&
							JSON.stringify(value) !== expected
						)
							throw new Error(`Managed ${event} hook was edited`);
					const kept = existing.filter(value => JSON.stringify(value) !== expected);
					if (connected) kept.push(...entries);
					if (kept.length) hooks[event] = kept;
					else delete hooks[event];
				}
				config.hooks = hooks;
				if (agent === "cursor" || agent === "copilot") {
					if (config.version !== undefined && config.version !== 1)
						throw new Error("Unsupported existing hooks version");
					config.version = 1;
				}
				await atomic(path, previous, `${JSON.stringify(config, null, 2)}\n`);
			}
			if (!connected) for (const pending of this.pending.values()) if (pending.agent === agent) pending.cancel();
			return this.list();
		});
		this.mutation = task.catch(() => {});
		return task;
	}

	private normalize(agent: string, event: string, payload: ObjectValue): ObjectValue | null {
		if (!EVENTS[agent]?.includes(event)) return null;
		let id = payload.session_id ?? payload.sessionId ?? payload.conversation_id ?? payload.sessionID;
		let name = MAPS[agent]?.[event] ?? event;
		if (agent === "claude" && payload.cursor_version !== undefined) return null;
		if (agent === "opencode") {
			const info = object(payload.info);
			id ??= info.id;
			name =
				(
					{
						"session.created": "SessionStart",
						"session.deleted": "SessionEnd",
						"session.error": "StopFailure",
						"permission.asked": "Notification",
						"chat.message": "UserPromptSubmit",
						"tool.execute.before": "PreToolUse",
						"tool.execute.after": "PostToolUse",
					} as Record<string, string>
				)[event] ?? (object(payload.status).type === "idle" ? "Stop" : "PreToolUse");
		}
		if (!identifier(id)) return null;
		if (payload.hook_event_name !== undefined && payload.hook_event_name !== event) return null;
		const out: ObjectValue = {
			_agent: agent,
			_wisa_normalized: true,
			session_id: `${agent}:${id}`,
			hook_event_name: name,
		};
		for (const key of [
			"cwd",
			"prompt",
			"message",
			"last_assistant_message",
			"tool_name",
			"notification_type",
			"error",
		]) {
			const value = text(payload[key]);
			if (value !== undefined) out[key] = value;
		}
		out.tool_name ??= text(payload.toolName ?? payload.tool ?? payload.permission, 128);
		out.cwd ??= text((payload.workspace_roots as unknown[] | undefined)?.[0] ?? object(payload.info).directory);
		out.last_assistant_message ??= text(payload.prompt_response ?? payload.text);
		const input = object(payload.tool_input ?? payload.toolArgs ?? payload.args);
		// Only display fields; never forward arbitrary nested metadata, transcript paths, PIDs or commands to execute.
		const safeInput: ObjectValue = {};
		for (const key of ["command", "description", "file_path", "path", "pattern", "url"]) {
			const value = text(input[key]);
			if (value !== undefined) safeInput[key] = value;
		}
		out.tool_input = safeInput;
		if (
			event === "permission.asked" ||
			(name === "Notification" &&
				(payload.notification_type === "ToolPermission" || payload.notification_type === "permission_prompt"))
		) {
			out.notification_type = "permission_prompt";
			out.message ??= text(object(payload.details).title) ?? "Approval required in the agent";
		}
		return out;
	}
	private async receive(request: IncomingMessage, response: ServerResponse): Promise<void> {
		const send = (status: number, body: unknown = {}) => {
			if (response.destroyed || response.writableEnded) return;
			response.writeHead(status, {
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
				Connection: "close",
			});
			response.end(JSON.stringify(body));
		};
		try {
			const auth = Buffer.from(request.headers.authorization ?? "");
			const expected = Buffer.from(`Bearer ${this.token}`);
			if (
				request.headers.origin !== undefined ||
				request.headers.cookie !== undefined ||
				request.headers["sec-fetch-site"] !== undefined ||
				auth.length !== expected.length ||
				!timingSafeEqual(auth, expected)
			) {
				send(403);
				return;
			}
			if (
				request.method !== "POST" ||
				request.url !== "/events" ||
				request.headers["content-type"] !== "application/json"
			) {
				send(400);
				return;
			}
			if (Number(request.headers["content-length"]) > 262144) {
				send(413);
				request.resume();
				return;
			}
			let size = 0;
			const chunks: Buffer[] = [];
			const body = Promise.withResolvers<Buffer | null>();
			const onData = (chunk: Buffer) => {
				size += chunk.length;
				if (size > 262144) {
					request.off("data", onData);
					chunks.length = 0;
					send(413);
					request.resume();
					body.resolve(null);
				} else chunks.push(chunk);
			};
			request.on("data", onData);
			request.once("end", () => {
				request.off("data", onData);
				body.resolve(Buffer.concat(chunks));
			});
			request.once("error", body.reject);
			request.once("aborted", () => body.reject(new Error("Hook disconnected")));
			const buffer = await body.promise;
			if (buffer === null) return;
			const envelope = object(JSON.parse(buffer.toString("utf8")));
			const agent = envelope.agent;
			if (typeof agent !== "string" || !this.installed.has(agent) || !this.options.enabledAgents().includes(agent)) {
				send(403);
				return;
			}
			if (typeof envelope.event !== "string") {
				send(400);
				return;
			}
			const payload = object(envelope.payload);
			const event = this.normalize(agent, envelope.event, payload);
			if (!event) {
				send(400);
				return;
			}
			const session = event.session_id as string;
			for (const [key, seen] of this.sessions)
				if (Date.now() - seen > 24 * 60 * 60 * 1000) this.sessions.delete(key);
			if (!this.sessions.has(session) && this.sessions.size >= 128) {
				send(429);
				return;
			}
			this.sessions.set(session, Date.now());
			if (["SessionEnd", "Stop", "StopFailure"].includes(event.hook_event_name as string)) {
				for (const pending of this.pending.values()) if (pending.session === session) pending.cancel();
				if (event.hook_event_name === "SessionEnd") this.sessions.delete(session);
			}
			if (event.hook_event_name !== "PermissionRequest") {
				this.options.onEvent(event);
				send(200);
				return;
			}
			if (
				!["claude", "codex", "custom"].includes(agent) ||
				!identifier(payload.request_id) ||
				(agent === "custom" && payload.response_mode !== "allow-deny")
			) {
				send(400);
				return;
			}
			const id = `${agent}:${payload.request_id}`;
			if (this.pending.has(id) || this.pending.size >= 64) {
				send(409);
				return;
			}
			event._request_id = id;
			let settled = false;
			const finish = (reply: unknown, cancelled: boolean) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				this.pending.delete(id);
				if (cancelled) this.options.onCancel(id);
				send(200, reply);
			};
			const timer = setTimeout(() => finish({}, true), 90000);
			timer.unref();
			this.pending.set(id, { session, agent, cancel: () => finish({}, true) });
			response.once("close", () => finish({}, true));
			this.options.onEvent(event, reply => {
				const value = object(reply);
				if (value._request_id !== undefined && value._request_id !== id) return;
				const behavior = value.behavior;
				// No "always", question answers, permission updates or agent-supplied auto-grants.
				if (behavior !== "allow" && behavior !== "deny") {
					finish({}, true);
					return;
				}
				if (!this.options.enabledAgents().includes(agent) || !this.installed.has(agent)) {
					finish({}, true);
					return;
				}
				finish(
					agent === "custom"
						? { decision: behavior, requestId: id }
						: { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior } } },
					false,
				);
			});
		} catch {
			send(400);
		}
	}
	dispose(): void {
		this.disposed = true;
		for (const pending of this.pending.values()) pending.cancel();
		this.server?.close();
		this.server?.closeAllConnections();
		this.sessions.clear();
		this.installed.clear();
		this.token = "";
	}
}
