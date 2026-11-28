#!/usr/bin/env bun
/// <reference types="bun" />
import * as fs from "node:fs";
import { createInterface } from "node:readline";
import type {
	AgentMessage,
	BtwHistoryRecord,
	ExtensionUIResponse,
	RpcCommand,
	RpcLoopModeState,
	RpcSecurityDashboardResult,
	RpcSessionState,
	SubagentSnapshot,
} from "../src/shared/rpc-types";

// A local protocol peer. No provider credentials, external network, or user session files.
if (process.argv.includes("stats")) {
	// Like the real server: a test that force-kills or times out the app must not leave this behind.
	const owner = Number(process.env.PI_STATS_OWNER_PID);
	if (owner > 0) {
		setInterval(() => {
			try {
				process.kill(owner, 0);
			} catch {
				process.exit(0);
			}
		}, 250);
	}
	const binary = process.env.OMP_GUI_TEST_STATS_BINARY;
	if (binary) {
		const child = Bun.spawn([binary, ...process.argv.slice(2)], {
			stdout: "inherit",
			stderr: "inherit",
			env: process.env,
		});
		process.on("SIGTERM", () => child.kill());
		process.on("exit", () => child.kill());
		await child.exited;
	} else {
		// The routes that contract a bare JSON array must actually receive one, so the
		// dashboard renders rows instead of its empty/error state.
		const lists: Record<string, unknown[]> = {
			"/api/stats/errors": [
				{
					id: 1,
					entryId: "err-1",
					sessionFile: "/home/dev/.omp/agent/sessions/2026-09-21-workspace-alpha.jsonl",
					folder: "/home/dev/projects/workspace-alpha",
					model: "claude-opus-4-1",
					provider: "anthropic",
					timestamp: 1758451200000,
					stopReason: "error",
					errorMessage:
						"stream disconn…fter 3 retries: upstream provider returned 529 overloaded_state for this deployment",
					usage: { totalTokens: 18_432 },
				},
			],
			"/api/stats/folders": [
				{
					folder: "/home/dev/projects/workspace-alpha",
					totalRequests: 142,
					failedRequests: 4,
					errorRate: 0.028,
					totalInputTokens: 921_400,
					totalOutputTokens: 148_220,
					totalCacheReadTokens: 4_812_000,
					totalCacheWriteTokens: 302_400,
					totalCost: 41.27,
					avgDuration: 8421,
					avgTokensPerSecond: 61.4,
				},
				{
					folder: "/home/dev/projects/a/much/longer/nested/repository/path/that/should/not/overflow/the/column",
					totalRequests: 9,
					failedRequests: 0,
					errorRate: 0,
					totalInputTokens: 12_400,
					totalOutputTokens: 2_220,
					totalCacheReadTokens: 0,
					totalCacheWriteTokens: 0,
					totalCost: 0.42,
					avgDuration: null,
					avgTokensPerSecond: null,
				},
			],
		};
		const server = Bun.serve({
			port: 0,
			fetch: request => {
				const { pathname } = new URL(request.url);
				return Response.json(lists[pathname] ?? {}, { headers: { "x-omp-stats-dashboard": "1" } });
			},
		});
		process.stdout.write(`http://localhost:${server.port}\n`);
		process.on("SIGTERM", () => {
			server.stop(true);
			process.exit(0);
		});
	}
} else {
	const messages: AgentMessage[] = [];
	const btwRecords: BtwHistoryRecord[] = [];
	const count = Math.min(50_000, Number(process.env.OMP_GUI_TEST_HISTORY ?? 0));
	for (let index = 0; index < count; index++) {
		const common = { timestamp: 1700000000000 + index * 1000, entryId: `history-${index}` };
		if (index > 0 && index % 1000 === 0)
			messages.push({
				...common,
				role: "compactionSummary",
				summary: `Compacted history ${index}`,
				tokensBefore: 90000,
				tokensAfter: 12000,
			});
		else if (index % 1000 === 2)
			messages.push({
				...common,
				role: "user",
				content: [
					{ type: "text", text: `Image question ${index}` },
					{
						type: "image",
						mimeType: "image/png",
						data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6VQAAAAASUVORK5CYII=",
					},
				],
			});
		else if (index % 10 === 5)
			messages.push({
				...common,
				role: "assistant",
				content: [{ type: "toolCall", id: `tool-${index}`, name: "read", arguments: { path: "example.ts" } }],
				stopReason: "toolUse",
			});
		else if (index % 10 === 6)
			messages.push({
				...common,
				role: "toolResult",
				toolCallId: `tool-${index - 1}`,
				toolName: "read",
				content: [{ type: "text", text: `Result ${index}\nconst value = ${index};` }],
				isError: false,
			});
		else if (index % 2 === 0)
			messages.push({ ...common, role: "user", content: [{ type: "text", text: `History question ${index}` }] });
		else
			messages.push({
				...common,
				role: "assistant",
				content: [
					{ type: "thinking", thinking: `Consider context ${index}.` },
					{ type: "text", text: `History answer ${index}. This is a bounded local performance fixture.` },
				],
				stopReason: "stop",
			});
	}

	const model = {
		id: process.env.OMP_GUI_TEST_MODEL_ID ?? "local-fixture",
		name: process.env.OMP_GUI_TEST_MODEL_NAME ?? "Local fixture",
		provider: "fixture",
		reasoning: true,
		contextWindow: 128000,
		maxTokens: 4096,
		input: process.env.OMP_GUI_TEST_VISION === "1" ? ["text", "image"] : ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	};
	const state: RpcSessionState = {
		model,
		thinkingLevel: "medium",
		availableThinkingLevels: ["low", "medium", "high"],
		isStreaming: false,
		isCompacting: false,
		steeringMode: "all",
		followUpMode: "all",
		interruptMode: "immediate",
		sessionFile: null,
		cwd: process.cwd(),
		sessionId: `fixture-${process.pid}`,
		sessionName: "Audit session",
		fastModeEnabled: false,
		fastModeActive: false,
		tokensPerSecond: null,
		autoCompactionEnabled: true,
		autoRetryEnabled: true,
		messageCount: messages.length,
		queuedMessageCount: 0,
		todoPhases: [],
		systemPrompt: [],
		dumpTools: [],
		contextUsage: { tokens: 74_800, contextWindow: 128_000, percent: 58 },
		planModeEnabled: false,
		agentsPaused: false,
	};
	const subagents: SubagentSnapshot[] = [];
	let loopMode: RpcLoopModeState = { enabled: false, state: "off" };
	let vibeModeEnabled = false;
	let queue: { id: string; text: string; lane: string; editable: boolean; timestamp: number }[] = [];
	let securityMode = "disabled";
	let streamTimer: Timer | null = null;
	let streamChunks = 0;
	let holdSettings = false;
	let releaseSettings: (() => void) | undefined;
	let configWarnings: string[] = [];
	const jevFixture = process.env.OMP_GUI_TEST_JEV === "1";
	let typesafeAuthenticated = false;
	let judgeSelector: string | undefined;
	const nativeJudge = {
		provider: "typesafe",
		id: "fixture-native-judge",
		name: "Jev fixture",
		kind: "judge" as const,
	};
	const write = (data: unknown) => process.stdout.write(`${JSON.stringify(data)}\n`);
	const values: Record<string, unknown> = {
		"approval.mode": "ask",
		"theme.dark": "dark",
		"theme.light": "light",
		"theme.mode": "dark",
		"security.enabled": false,
		"task.judgeRouting": false,
		"compaction.reserveTokens": 8192,
	};
	const stats = {
		sessionId: state.sessionId,
		userMessages: 0,
		assistantMessages: 0,
		toolCalls: 0,
		toolResults: 0,
		totalMessages: 0,
		tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		cost: 0,
		premiumRequests: 0,
	};
	write({ type: "ready", protocolVersion: 1, supportedProtocolVersions: [1] });
	const lines = createInterface({ input: process.stdin });
	lines.on("line", line => {
		const command = JSON.parse(line) as RpcCommand | ExtensionUIResponse;
		if (process.env.OMP_GUI_TEST_RECORD)
			fs.appendFileSync(process.env.OMP_GUI_TEST_RECORD, `${JSON.stringify(command)}\n`);
		const ok = (data: unknown = {}) =>
			write({ type: "response", id: command.id, command: command.type, success: true, data });
		switch (command.type) {
			case "get_state":
				ok(state);
				break;
			case "set_thinking_level":
				state.thinkingConfigured = command.level;
				state.thinkingLevel = command.level === "auto" ? undefined : command.level;
				ok({ thinkingLevel: state.thinkingLevel, thinkingConfigured: state.thinkingConfigured });
				break;
			case "get_config_warnings":
				ok({ warnings: configWarnings });
				break;
			case "set_model":
				state.model = { ...model, provider: command.provider, id: command.modelId };
				write({ type: "model_changed" });
				// Startup warnings deliberately remain: this is the stale Core snapshot regression.
				ok(state.model);
				break;
			case "get_messages":
			case "get_transcript":
				ok({ messages });
				break;
			case "get_subagents":
				ok({ subagents });
				break;
			case "get_subagent_messages":
				ok({
					messages: command.fromByte
						? []
						: [
								{ role: "user", content: "Review the **local fixture**." },
								{
									role: "assistant",
									content: [
										{ type: "thinking", thinking: "Private fixture reasoning." },
										{ type: "text", text: "The first review is complete." },
									],
								},
							],
					nextByte: 42,
				});
				break;
			case "get_queue":
				ok({
					steering: queue.filter(item => item.lane === "steering"),
					followUp: queue.filter(item => item.lane === "followUp"),
					entries: queue,
				});
				break;
			case "get_available_models":
				ok({ models: [model], discoveryStates: [], refreshPending: false, generation: 1 });
				break;
			case "get_providers":
				ok({
					providers: [
						{ id: "fixture", name: "Local fixture", hasAuth: true, authenticated: true, modelCount: 1 },
						...(jevFixture
							? [
									{
										id: "typesafe",
										name: "TypeSafe",
										authenticated: typesafeAuthenticated,
										loginAvailable: true,
										apiKeyLogin: true,
										disabled: false,
										modelCount: typesafeAuthenticated ? 1 : 0,
									},
								]
							: []),
					],
					models: [model],
					discoveryStates: [],
					refreshPending: false,
					generation: 1,
				});
				break;
			case "get_login_providers":
				ok({ providers: [] });
				break;
			case "get_model_roles":
				ok({
					roles: [
						{
							id: "default",
							name: "Default",
							section: "chat",
							source: "settings",
							model: `${model.provider}/${model.id}`,
							candidates: [{ ...model, kind: "chat" }],
						},
						...(jevFixture
							? [
									{ id: "smol", name: "Fast", section: "chat" },
									{ id: "slow", name: "Thinking", section: "chat" },
									{ id: "vision", name: "Vision", section: "chat" },
									{ id: "plan", name: "Architect", section: "chat" },
									{ id: "commit", name: "Commit", section: "chat" },
									{ id: "tiny", name: "Tiny", section: "chat" },
									{ id: "memory", name: "Memory", section: "chat" },
									{ id: "task", name: "Subtask", section: "chat" },
									{ id: "advisor", name: "Advisor", section: "chat" },
									{ id: "widget", name: "Job widgets", section: "chat" },
									{ id: "image", name: "Image generation", section: "kind" },
									{ id: "web", name: "Web search", section: "kind" },
									{ id: "speech", name: "Speech", section: "kind" },
									{ id: "dictation", name: "Dictation", section: "kind" },
								].map(role => ({
									...role,
									tag: role.id.toUpperCase(),
									source: "default",
									candidates: role.section === "chat" ? [{ ...model, kind: "chat" }] : [],
								}))
							: []),
						{
							id: "judge",
							name: "Judge",
							section: "kind",
							source: judgeSelector ? "settings" : "default",
							model: judgeSelector,
							selected: judgeSelector ? { provider: nativeJudge.provider, id: nativeJudge.id } : undefined,
							candidates: jevFixture && typesafeAuthenticated ? [nativeJudge] : [],
						},
					],
				});
				break;
			case "set_api_key":
				if (!jevFixture || command.providerId !== "typesafe" || !command.apiKey.trim()) {
					write({
						type: "response",
						id: command.id,
						command: command.type,
						success: false,
						error: "Unsupported fixture credential",
					});
					break;
				}
				typesafeAuthenticated = true;
				ok({ providerId: command.providerId });
				break;
			case "set_model_role":
				if (
					!jevFixture ||
					!typesafeAuthenticated ||
					command.role !== "judge" ||
					command.modelId !== `${nativeJudge.provider}/${nativeJudge.id}`
				) {
					write({
						type: "response",
						id: command.id,
						command: command.type,
						success: false,
						error: "Unsupported fixture role",
					});
					break;
				}
				judgeSelector = command.modelId;
				ok({ role: command.role, modelId: judgeSelector });
				break;
			case "get_settings":
				if (holdSettings && !command.paths) {
					holdSettings = false;
					const snapshot = { ...values };
					releaseSettings = () => ok({ values: snapshot, advisorEnabled: false, advisorActive: false });
					break;
				}
				ok({ values, advisorEnabled: false, advisorActive: false });
				break;
			case "set_session_compaction":
				if (command.sessionId !== state.sessionId) throw new Error("The session changed");
				Object.assign(values, command.values);
				if (typeof command.values["compaction.enabled"] === "boolean") {
					state.autoCompactionEnabled = command.values["compaction.enabled"];
				}
				write({ type: "config_update", model: state.model, autoCompactionEnabled: state.autoCompactionEnabled });
				ok();
				break;
			case "set_setting":
				values[command.path] = command.value;
				if (command.path === "fixture.missingModel") {
					state.model = command.value ? null : model;
					configWarnings = command.value
						? [
								"No default model selected. Use /login, set an API key environment variable, or select a local model with /model or --model.",
							]
						: [];
					write({ type: "model_changed" });
					write({ type: "config_warnings_changed" });
				}
				ok({ path: command.path, value: command.value });
				break;
			case "get_settings_schema":
				ok({
					tabs: ["context", "model", "providers", "tasks", "files", "shell", "tools", "memory", "interaction"].map(
						id => ({ id, label: id, groups: [] }),
					),
					entries: [
						...["context", "model", "providers", "tasks", "files", "shell", "tools", "memory", "interaction"].map(
							tab => ({
								path: tab === "context" ? "compaction.enabled" : `fixture.${tab}`,
								type: "boolean",
								tab,
								label: tab === "context" ? "Auto compaction" : `Fixture ${tab}`,
								description: "Isolated audit setting",
								default: true,
							}),
						),
						{
							path: "compaction.reserveTokens",
							type: "number",
							tab: "context",
							label: "Reserve tokens",
							description: "Isolated numeric audit setting",
							default: 8192,
						},
					],
				});
				break;
			case "get_goal":
				ok({ enabled: false, status: "none" });
				break;
			case "guided_goal":
				ok({ started: true });
				break;
			case "get_loop_mode":
				ok(loopMode);
				break;
			case "set_loop_mode":
				loopMode = {
					enabled: command.enabled,
					state: command.enabled ? "waiting" : "off",
					prompt: command.args,
				};
				ok(loopMode);
				break;
			case "get_vibe_mode":
				ok({ enabled: vibeModeEnabled });
				break;
			case "set_vibe_mode":
				vibeModeEnabled = command.enabled;
				ok({ enabled: command.enabled });
				break;
			case "get_gui_themes":
			case "get_themes":
				ok({ themes: [] });
				break;
			case "get_available_commands":
				ok({
					commands: [
						"jobs",
						"share",
						"live",
						"btw",
						"settings",
						"stats",
						"theme",
						"benchmark",
						"collab",
						"import",
						"context",
						"debug",
						"tools",
						"models",
						"providers",
						"modes",
						"hotkeys",
					].map(name => ({ name, source: "builtin", textModeExecutable: false, description: name })),
				});
				break;
			case "get_context_report":
				ok({
					contextWindow: 128_000,
					model: model.id,
					breakdown: {
						contextWindow: 128_000,
						anchored: true,
						usedTokens: 74_800,
						systemPromptTokens: 4_100,
						systemToolsTokens: 6_900,
						systemContextTokens: 1_450,
						skillsTokens: 820,
						messagesTokens: 61_530,
					},
				});
				break;
			case "get_session_stats":
				ok(stats);
				break;
			case "get_git_changes":
				ok({ isRepo: false, root: null, base: null, files: [], truncated: false });
				break;
			case "get_git_status":
				ok({ isRepo: false, branch: null, staged: 0, unstaged: 0, untracked: 0 });
				break;
			case "get_active_tools":
				ok({ tools: [] });
				break;
			case "get_jobs":
				ok({
					jobs: [
						{
							id: "done",
							type: "bash",
							label: "Completed local job",
							status: "completed",
							startTime: 1000,
							endedAt: 3000,
						},
					],
				});
				break;
			case "preview_share_session":
				ok({
					snapshotId: "fixture",
					preview: JSON.stringify({ messages }),
					serverUrl: "http://127.0.0.1/local-share",
					store: "blob",
					redactionEnabled: true,
				});
				break;
			case "share_session":
				ok({ url: "http://127.0.0.1/shared#local" });
				break;
			case "live_start":
				write({ type: "live_phase", phase: "connecting" });
				write({ type: "live_phase", phase: "listening" });
				ok({ voice: command.voice ?? "marin" });
				break;
			case "live_mute":
				ok({ muted: command.muted ?? true });
				break;
			case "live_stop":
				write({ type: "live_end" });
				ok();
				break;
			case "btw": {
				const now = Date.now();
				const turn = {
					question: command.question,
					...(command.images?.length ? { images: command.images } : {}),
					answer: "Local side answer",
					status: "complete" as const,
					createdAt: now,
					updatedAt: now,
				};
				const previous = btwRecords.find(record => record.id === command.recordId);
				const record: BtwHistoryRecord = previous
					? { ...previous, followUps: [...(previous.followUps ?? []), turn] }
					: { ...turn, id: `btw-${btwRecords.length + 1}`, leafId: null };
				if (previous) btwRecords.splice(btwRecords.indexOf(previous), 1);
				btwRecords.unshift(record);
				ok({ record });
				break;
			}
			case "get_btw_history":
				ok({ records: btwRecords });
				break;
			case "get_plugins":
				ok({ plugins: [] });
				break;
			case "get_marketplaces":
				ok({ marketplaces: [] });
				break;
			case "get_prompt_templates":
				ok({ templates: [] });
				break;
			case "get_hooks":
				ok({ hooks: [] });
				break;
			case "get_mcp_servers":
				ok({ servers: [] });
				break;
			case "get_skills":
				ok({ skills: [] });
				break;
			case "get_security_dashboard": {
				if (securityMode === "unavailable") {
					write({
						type: "response",
						id: command.id,
						command: command.type,
						success: false,
						error: "Isolated dashboard unavailable",
					});
					break;
				}
				const dashboard: RpcSecurityDashboardResult = {
					enabled: securityMode !== "disabled",
					modelReady: true,
					modelLabel: "Local fixture",
					repositoryRoot: process.cwd(),
					scans: [],
					operations: [],
				};
				if (!["disabled", "unscanned"].includes(securityMode)) {
					const now = new Date().toISOString();
					const scan = {
						id: "scan",
						status:
							securityMode === "failed"
								? ("failed" as const)
								: securityMode === "incomplete"
									? ("partial" as const)
									: ("completed" as const),
						createdAt: now,
						producer: "fixture",
						findingCount: securityMode === "findings" ? 1 : 0,
						target: { kind: "working_tree" as const, displayName: "Working tree" },
					};
					dashboard.scans = [scan];
					dashboard.latest = {
						scan,
						findings:
							securityMode === "findings"
								? [
										{
											id: "f1",
											scanId: "scan",
											title: "Untrusted path reaches file access",
											summary: "Isolated finding",
											severity: "high",
											confidence: "high",
											disposition: "open",
											validation: "unvalidated",
											evidence: [],
										},
									]
								: [],
					};
					if (securityMode === "running")
						dashboard.operations = [
							{
								operationId: "op",
								planId: "plan",
								scanId: "scan",
								phase: "reviewing",
								createdAt: now,
								updatedAt: now,
								findingCount: 0,
							},
						];
				}
				ok(dashboard);
				break;
			}
			case "set_subagent_subscription":
			case "set_host_tools":
			case "set_host_uri_schemes":
				ok();
				break;
			case "extension_ui_response":
				state.isStreaming = false;
				ok();
				write({ type: "agent_end", messages: [], isTerminal: true });
				break;
			case "get_collab_state":
				ok(state.collab ?? { role: null, readOnly: false, participants: [] });
				break;
			case "collab_start":
				// A real room is a relay connection; the fixture hands back the shape
				// the GUI renders (both browser links, one participant).
				state.collab = {
					role: "host",
					readOnly: false,
					link: "omp://relay.test/room#key",
					viewLink: "omp://relay.test/room",
					webLink: "https://my.omp.sh/#fixture-room-key",
					webViewLink: "https://my.omp.sh/#",
					participants: [{ name: "fixture", role: "host", readOnly: false }],
				};
				ok(state.collab);
				write({ type: "collab_state", state: state.collab });
				break;
			case "collab_leave":
				state.collab = undefined;
				ok({ role: null, readOnly: false, participants: [] });
				write({ type: "collab_state", state: { role: null, readOnly: false, participants: [] } });
				break;
			case "bash": {
				if (command.command === "fixture:progress") {
					ok({ chunks: streamChunks });
					break;
				}
				if (command.command === "fixture:large-tool") {
					const tool = { toolCallId: "large-tool", toolName: "bash" };
					write({ type: "tool_execution_start", ...tool, args: { command: "local audit fixture" } });
					write({
						type: "tool_execution_end",
						...tool,
						result: { content: [{ type: "text", text: "bounded output line\n".repeat(25000) }] },
						isError: false,
					});
					ok();
					break;
				}
				if (command.command.startsWith("fixture:security:")) {
					securityMode = command.command.slice("fixture:security:".length);
					ok();
					break;
				}
				state.collab = {
					role: command.command === "fixture:readonly" ? "guest" : null,
					readOnly: command.command === "fixture:readonly",
					participants: [],
				};
				ok();
				write({ type: "collab_state", state: state.collab });
				break;
			}
			case "get_ssh_hosts":
				ok({ hosts: [], warnings: [], openSshAvailable: true });
				break;
			case "list_foreign_sessions":
				ok({ sessions: [] });
				break;
			case "set_plan_mode":
				state.planModeEnabled = command.enabled;
				ok({ enabled: command.enabled });
				break;
			case "queue_remove":
				queue = queue.filter(item => item.id !== command.queueId);
				ok({ removed: true });
				write({
					type: "queue_update",
					steering: queue.filter(item => item.lane === "steering"),
					followUp: queue.filter(item => item.lane === "followUp"),
				});
				break;
			case "steer":
			case "follow_up":
				queue = [
					...queue,
					{
						id: crypto.randomUUID(),
						text: command.message,
						lane: command.type === "steer" ? "steering" : "followUp",
						editable: true,
						timestamp: Date.now(),
					},
				];
				ok();
				write({
					type: "queue_update",
					steering: queue.filter(item => item.lane === "steering"),
					followUp: queue.filter(item => item.lane === "followUp"),
				});
				break;
			case "abort":
				if (streamTimer) clearInterval(streamTimer);
				streamTimer = null;
				state.isStreaming = false;
				ok();
				write({ type: "agent_end", messages: [], isTerminal: true });
				break;
			case "prompt": {
				if (command.message === "fixture handoff output") {
					const text = "Compaction complete. Tokens: 194693 -> 32316 (saved 162377).";
					messages.push(
						{
							role: "compactionSummary", method: "handoff", summary: "Context carried forward",
							tokensBefore: 194693, tokensAfter: 32316, entryId: crypto.randomUUID(),
						},
						{ role: "custom", customType: "command", content: text, entryId: crypto.randomUUID(), timestamp: Date.now() },
					);
					ok({ agentInvoked: false });
					write({ type: "command_output", text });
					write({ type: "prompt_result", agentInvoked: false });
					break;
				}
				if (command.message === "fixture hold settings") {
					holdSettings = true;
					ok();
					break;
				}
				if (command.message === "fixture release settings") {
					releaseSettings?.();
					releaseSettings = undefined;
					ok();
					break;
				}
				if (command.message === "fixture uncertain")
					write({
						type: "response",
						id: command.id,
						command: command.type,
						success: false,
						code: "rpc_delivery_unknown",
						error: "Isolated lost acknowledgement",
					});
				else ok();
				state.isStreaming = true;
				const user: AgentMessage = {
					role: "user",
					content: [{ type: "text", text: command.message }],
					timestamp: Date.now(),
					entryId: crypto.randomUUID(),
				};
				messages.push(user);
				write({ type: "agent_start" });
				write({ type: "message_end", message: user });
				if (command.message === "fixture stream") {
					const answer: AgentMessage = {
						role: "assistant",
						content: [],
						timestamp: Date.now(),
						entryId: crypto.randomUUID(),
					};
					write({ type: "message_start", message: answer });
					streamChunks = 0;
					if (streamTimer) clearInterval(streamTimer);
					streamTimer = setInterval(() => {
						streamChunks++;
						write({
							type: "message_update",
							message: answer,
							assistantMessageEvent: {
								type: "text_delta",
								contentIndex: 0,
								// One paragraph per chunk: the live tail renders as Markdown, where
								// single newlines are soft breaks that join lines into one paragraph.
								delta: `Stream chunk ${streamChunks}.\n\n`,
								partial: answer,
							},
						});
					}, 16);
				} else if (command.message === "fixture approval") {
					write({
						type: "extension_ui_request",
						id: "approval",
						method: "select",
						title: `Allow tool: bash\n${"x".repeat(2200)}\ncritical final argument`,
						options: ["Approve", "Deny"],
					});
				} else if (command.message === "fixture computer approval") {
					write({
						type: "extension_ui_request",
						id: "computer-approval",
						method: "select",
						title: 'Allow tool: computer\nReason: Desktop input or mutation\nTarget: Code — Editor (42)\nAction: window("42").click(1, 2)',
						options: ["Approve", "Deny"],
					});
				} else if (command.message === "fixture no reply") {
					const answer: AgentMessage = {
						role: "assistant",
						content: [{ type: "thinking", thinking: "Check the changes before writing a report." }],
						timestamp: Date.now(),
						entryId: crypto.randomUUID(),
						stopReason: "stop",
					};
					messages.push(answer);
					write({ type: "message_end", message: answer });
					state.isStreaming = false;
					write({ type: "agent_end", messages: [user, answer], isTerminal: true });
				} else if (command.message === "fixture todo continuation") {
					const assistant = (content: AgentMessage["content"], stopReason: string): AgentMessage => ({
						role: "assistant",
						content,
						stopReason,
						timestamp: Date.now(),
						entryId: crypto.randomUUID(),
					});
					const first = assistant([{ type: "text", text: "I fixed the two buttons." }], "stop");
					messages.push(first);
					write({ type: "message_end", message: first });
					write({
						type: "todo_reminder",
						todos: [{ content: "Verify the buttons", status: "pending" }],
						attempt: 1,
						maxAttempts: 3,
					});
					messages.push({
						role: "developer",
						attribution: "agent",
						content: "<system-reminder>\nYou stopped with 1 incomplete todo item(s):\n- Checks\n  - Verify the buttons\n\nPlease continue working on these tasks or mark them complete if finished.\n(Reminder 1/3)\n</system-reminder>",
						timestamp: Date.now(),
						entryId: crypto.randomUUID(),
					});
					const check = assistant([{ type: "toolCall", id: "verify-buttons", name: "bash", arguments: {} }], "toolUse");
					const last = assistant([{ type: "text", text: "I verified the buttons in Electron." }], "stop");
					messages.push(check, last);
					write({ type: "message_end", message: check });
					write({ type: "message_end", message: last });
					state.isStreaming = false;
					write({ type: "agent_end", messages: [user, first, check, last], isTerminal: true });
				} else if (command.message === "fixture delegate" || command.message === "fixture reuse") {
					const reused = command.message === "fixture reuse";
					const id = "fixture-review";
					const toolCallId = reused ? "send-review" : "spawn-review";
					const toolName = reused ? "write" : "task";
					const time = Date.now();
					const narration: AgentMessage = {
						role: "assistant",
						stopReason: "toolUse",
						timestamp: time,
						content: [
							{
								type: "text",
								text: reused ? "I'll ask the same agent for another pass." : "I'll delegate the first review.",
							},
							{
								type: "toolCall",
								id: toolCallId,
								name: toolName,
								arguments: reused ? { path: `agent://${id}`, content: "Check once more." } : { agent: "scout" },
							},
						],
					};
					if (!reused) {
						const agent = { id, agent: "scout", index: 0, description: "Fixture reviewer", status: "completed" };
						subagents.push({ ...agent, spawnedAt: time, lastUpdate: time });
						write({
							type: "subagent_lifecycle",
							payload: { ...agent, agentSource: "bundled", parentToolCallId: toolCallId },
						});
					}
					const turn: AgentMessage[] = [
						narration,
						{
							role: "toolResult",
							timestamp: time + 1,
							toolCallId,
							toolName,
							isError: false,
							details: reused ? { message: { op: "send", from: "Main", to: id } } : undefined,
						},
						{
							role: "custom",
							customType: "irc:incoming",
							timestamp: time + 2,
							display: true,
							details: { from: id },
							content: "Review complete.",
						},
						{
							role: "assistant",
							timestamp: time + 3,
							stopReason: "stop",
							content: [{ type: "text", text: reused ? "Follow-up complete." : "Delegation complete." }],
						},
					];
					for (const message of turn) {
						message.entryId = crypto.randomUUID();
						messages.push(message);
						if (message.role === "toolResult") {
							write({ type: "tool_execution_end", toolCallId, toolName, result: { details: message.details }, isError: false });
						}
						if (message.customType === "irc:incoming") write({ type: "irc_message", message });
						write({ type: "message_end", message });
					}
					state.isStreaming = false;
					write({ type: "agent_end", messages: [user, ...turn], isTerminal: true });
				} else if (command.message === "fixture background cards") {
					const deliveries: AgentMessage[] = [
						{
							role: "custom",
							customType: "async-notify",
							details: { reports: [{ id: "bg_62" }] },
							content: "<system-notice>Waiting for the desktop build.</system-notice>",
						},
						{
							role: "assistant",
							content: [
								{ type: "thinking", thinking: "Review the background build output." },
								{ type: "text", text: "The desktop build is running." },
							],
						},
						{
							role: "custom",
							customType: "async-notify",
							details: { reports: [{ id: "bg_63" }] },
							content: "<system-notice>Watching the desktop build.</system-notice>",
						},
						{
							role: "custom",
							customType: "async-result",
							details: { jobs: [{ jobId: "bg_63", type: "bash", label: "bun run build", durationMs: 15_800 }] },
							content: "<system-notice>Background job bg_63 completed.\nDesktop build passed.</system-notice>",
						},
						{
							role: "assistant",
							content: [{ type: "thinking", thinking: "Check the audit result too." }],
						},
						{
							role: "custom",
							customType: "launch-completion",
							content: "The audit failed with exit code 1.",
							details: { daemons: [{ name: "desktop-audit", state: "failed", exitCode: 1 }] },
						},
						{
							role: "assistant",
							stopReason: "stop",
							content: [{ type: "text", text: "The desktop build passed; review the audit failure." }],
						},
					];
					const delivered = deliveries.map((message, index) => ({
						...message,
						timestamp: Number(user.timestamp) + index + 1,
						entryId: crypto.randomUUID(),
					}));
					for (const message of delivered) {
						messages.push(message);
						write({ type: "message_end", message });
					}
					state.isStreaming = false;
					write({ type: "agent_end", messages: delivered, isTerminal: true });
				} else if (command.message !== "fixture running") {
					const answer: AgentMessage = {
						role: "assistant",
						content: [
							{
								type: "text",
								text:
									command.message === "fixture math"
										? `只有统计口径相同时，才有：

\\[\\boxed{TPM = TPS \\times 60}\\]

- \\(P\\)：参数数量，例如 \\(8\\times10^9\\)。

那么，纯权重带宽模型下：

\\[
\\boxed{TPS_{\\text{decode}}\\approx \\frac{\\text{显存有效带宽，byte/s}}{\\text{每步读取的权重，byte}}}
\\]

纯生成阶段 TPS：

\\[
TPS_{\\text{decode}}
=
\\frac{500-1}{12-2}
=
49.9
\\]

减 1 是因为，第一个 token 已经在第 2 秒收到。

\\[
T_{\\text{请求}} = T_{\\text{排队等待}} + T_{\\text{网络传输}} + T_{\\text{输入预处理}} + T_{\\text{输入分词}} + T_{\\text{首令牌等待}} + \\frac{N_{\\text{输出令牌总数}}-1}{TPS_{\\text{decode}}} + T_{\\text{结果后处理}}
\\]`
										: "Local fixture reply",
							},
						],
						timestamp: Date.now(),
						entryId: crypto.randomUUID(),
						stopReason: "stop",
					};
					messages.push(answer);
					write({ type: "message_end", message: answer });
					state.isStreaming = false;
					write({ type: "agent_end", messages: [answer], isTerminal: true });
				}
				break;
			}
			default:
				write({
					type: "response",
					id: command.id,
					command: command.type,
					success: false,
					error: `Fixture does not implement ${command.type}`,
				});
		}
	});
}
