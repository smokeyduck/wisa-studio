import { EventEmitter, once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { agentDir, configureAgentProfile } from "./agent-paths";
import { defaultWorkspacePath } from "./default-workspace";
import { RPC_MAX_FRAME_BYTES, RPC_MAX_REASSEMBLED_BYTES } from "./rpc-bridge";
import { SidecarManager } from "./sidecar";

const fixture = vi.hoisted(() => ({
	prefs: new Map<string, unknown>(),
	spawn: vi.fn((_command: string, _args: string[], _options: { cwd: string; env: NodeJS.ProcessEnv }) =>
		Object.assign(new EventEmitter(), { kill: vi.fn() }),
	),
}));
vi.mock("electron-store", () => ({
	default: class {
		get(key: string) {
			return fixture.prefs.get(key);
		}
	},
}));
vi.mock("node:child_process", async importOriginal => ({
	...(await importOriginal<Record<string, unknown>>()),
	spawn: fixture.spawn,
}));

const originalAgentDir = agentDir();
const sidecars: SidecarManager[] = [];
afterEach(() => {
	for (const sidecar of sidecars.splice(0)) sidecar.dispose();
	configureAgentProfile(originalAgentDir);
	fixture.prefs.clear();
	fixture.spawn.mockClear();
	vi.unstubAllEnvs();
});

it("shortens silent model streams only for interactive tabs without overriding explicit settings", () => {
	const root = join(tmpdir(), "wisa-host-mode-fixture");
	configureAgentProfile(join(root, "agent"));
	vi.stubEnv("PI_STREAM_FIRST_EVENT_TIMEOUT_MS", undefined);
	vi.stubEnv("PI_STREAM_IDLE_TIMEOUT_MS", undefined);
	vi.stubEnv("PI_OPENAI_STREAM_IDLE_TIMEOUT_MS", undefined);
	const interactive = new SidecarManager({ binaryPath: "fixture-omp", cwd: root });
	const scheduled = new SidecarManager({
		binaryPath: "fixture-omp",
		cwd: root,
		runPolicy: { flags: ["--no-tools"], deny: { names: {}, withValue: {} } },
	});
	sidecars.push(interactive, scheduled);
	const env = () => fixture.spawn.mock.lastCall?.[2].env;
	interactive.start();
	expect(env()).toMatchObject({ PI_STREAM_FIRST_EVENT_TIMEOUT_MS: "300000", PI_STREAM_IDLE_TIMEOUT_MS: "180000" });
	scheduled.start();
	expect(env()?.PI_STREAM_FIRST_EVENT_TIMEOUT_MS).toBeUndefined();
	expect(env()?.PI_STREAM_IDLE_TIMEOUT_MS).toBeUndefined();
	vi.stubEnv("PI_STREAM_FIRST_EVENT_TIMEOUT_MS", "0");
	vi.stubEnv("PI_OPENAI_STREAM_IDLE_TIMEOUT_MS", "600000");
	interactive.restart();
	expect(env()).toMatchObject({ PI_STREAM_FIRST_EVENT_TIMEOUT_MS: "0", PI_OPENAI_STREAM_IDLE_TIMEOUT_MS: "600000" });
	expect(env()?.PI_STREAM_IDLE_TIMEOUT_MS).toBeUndefined();
});

it("selects the Work host policy without changing Coding, Chat, or scheduled launch profiles", () => {
	const root = join(tmpdir(), "wisa-host-mode-fixture");
	const studioConfig = join(root, "studio.yml");
	configureAgentProfile(join(root, "agent"));
	const work = new SidecarManager({ binaryPath: "fixture-omp", cwd: defaultWorkspacePath(), studioConfig });
	const coding = new SidecarManager({ binaryPath: "fixture-omp", cwd: join(root, "repo"), studioConfig });
	const chat = new SidecarManager({ binaryPath: "fixture-omp", cwd: join(root, "repo"), kind: "chat", studioConfig });
	const runPolicy = { flags: ["--no-tools"], deny: { names: {}, withValue: {} } };
	const scheduled = new SidecarManager({ binaryPath: "fixture-omp", cwd: work.cwd, runPolicy, studioConfig });
	const hostOnly = new SidecarManager({
		binaryPath: "fixture-omp",
		cwd: work.cwd,
		studioConfig,
		runPolicy: { ...runPolicy, hostToolsOnly: true },
	});
	sidecars.push(work, coding, chat, scheduled, hostOnly);
	fixture.prefs.set("launchProfiles", { [work.cwd]: { tools: ["bash", "write"] } });
	const launch = () => {
		const [, args, { env }] = fixture.spawn.mock.lastCall!;
		return {
			args,
			mode: env.WISA_RPC_HOST_MODE,
			defaults: env.WISA_STUDIO_DEFAULTS,
			btw: env.WISA_BTW_WORKSPACE_READ,
			computer: env.WISA_RPC_INTERACTIVE_COMPUTER,
		};
	};
	const baseArgs = ["--mode", "rpc-ui"];
	const overlay = ["--config", studioConfig];

	work.start();
	expect(launch()).toEqual({ args: [...baseArgs, ...overlay], mode: "work", defaults: "1", btw: "1", computer: "1" });
	expect(work.allowsInteractiveHostTools).toBe(true);

	coding.start();
	expect(launch()).toEqual({ args: [...baseArgs, ...overlay], mode: "", defaults: "1", btw: "1", computer: "1" });
	expect(coding.allowsInteractiveHostTools).toBe(true);
	fixture.prefs.set("launchProfiles", { [coding.cwd]: { tools: ["read"] }, [work.cwd]: { tools: ["bash", "write"] } });
	coding.restart();
	expect(launch()).toMatchObject({ args: [...baseArgs, "--tools", "read", ...overlay], computer: "0" });
	expect(coding.allowsInteractiveHostTools).toBe(false);

	fixture.prefs.delete("launchProfiles");
	chat.start();
	expect(launch()).toEqual({ args: [...baseArgs, "--chat", ...overlay], mode: "", defaults: "1", btw: "0", computer: "0" });
	expect(chat.allowsInteractiveHostTools).toBe(false);

	fixture.prefs.set("launchProfiles", { [work.cwd]: { tools: ["read"] } });
	scheduled.start();
	expect(launch()).toEqual({
		args: [...baseArgs, "--no-tools", "--tools", "read", ...overlay],
		mode: "",
		defaults: "0",
		btw: "1",
		computer: "0",
	});
	expect(scheduled.allowsInteractiveHostTools).toBe(false);
	hostOnly.start();
	expect(launch()).toEqual({
		args: [...baseArgs, "--no-tools", ...overlay],
		mode: "host-tools-only",
		defaults: "0",
		btw: "0",
		computer: "0",
	});
	expect(hostOnly.allowsInteractiveHostTools).toBe(false);
});

it("lets Work disable built-ins, the agent terminal tool, and interactive host tools with --no-tools", async () => {
	const stdout = new PassThrough();
	const commands: unknown[] = [];
	const stdin = {
		writable: true,
		write(line: string) {
			const command = JSON.parse(line) as { id: string; type: string };
			commands.push(command);
			stdout.write(`${JSON.stringify({ type: "response", id: command.id, command: command.type, success: true })}\n`);
		},
	};
	fixture.spawn.mockImplementationOnce(() => Object.assign(new EventEmitter(), { kill: vi.fn(), stdin, stdout }));
	const sidecar = new SidecarManager({
		binaryPath: "fixture-omp",
		cwd: defaultWorkspacePath(),
		studioConfig: "studio.yml",
		extraFlags: ["--no-tools"],
	});
	sidecars.push(sidecar);
	sidecar.start();
	expect(fixture.spawn.mock.lastCall?.[1]).toEqual(["--mode", "rpc-ui", "--no-tools", "--config", "studio.yml"]);
	expect(sidecar.allowsInteractiveHostTools).toBe(false);
	const ready = once(sidecar, "status");
	stdout.write(`${JSON.stringify({
		type: "ready",
		protocolVersion: 2,
		supportedProtocolVersions: [1, 2],
		maxFrameBytes: RPC_MAX_FRAME_BYTES,
		maxReassembledFrameBytes: RPC_MAX_REASSEMBLED_BYTES,
	})}\n`);
	await ready;
	expect(commands).toContainEqual(expect.objectContaining({ type: "terminal_configure", agentTools: false }));
	stdout.end();
});
