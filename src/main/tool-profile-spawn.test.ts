import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { CODING_TOOL_PROFILE_PREF, WORK_TOOL_PROFILE_PREF } from "../shared/tool-profiles";
import { agentDir, configureAgentProfile } from "./agent-paths";
import { defaultWorkspacePath } from "./default-workspace";
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
});

it("refreshes Work choices on restart and leaves Coding, Chat, and scheduled runs separate", () => {
	const root = join(tmpdir(), "wisa-tool-profile-fixture");
	configureAgentProfile(join(root, "agent"));
	const work = new SidecarManager({ binaryPath: "fixture-omp", cwd: defaultWorkspacePath() });
	const coding = new SidecarManager({ binaryPath: "fixture-omp", cwd: join(root, "repo") });
	const chat = new SidecarManager({ binaryPath: "fixture-omp", cwd: join(root, "repo"), kind: "chat" });
	const scheduled = new SidecarManager({
		binaryPath: "fixture-omp",
		cwd: defaultWorkspacePath(),
		runPolicy: { flags: ["--no-tools"], deny: { names: {}, withValue: {} } },
	});
	sidecars.push(work, coding, chat, scheduled);
	fixture.prefs.set("launchProfiles", { [work.cwd]: { tools: ["bash", "write"] } });
	fixture.prefs.set(CODING_TOOL_PROFILE_PREF, { disabled: ["bash", "grep"], editMode: "replace" });
	const launch = () => {
		const [, args, { env }] = fixture.spawn.mock.lastCall!;
		return {
			args,
			profile: env.WISA_GUI_TOOL_PROFILE,
			edit: env.WISA_GUI_EDIT_MODE,
			btw: env.WISA_BTW_WORKSPACE_READ,
		};
	};

	work.start();
	expect(fixture.spawn.mock.lastCall?.[2].env.WISA_STUDIO_DEFAULTS).toBe("1");
	expect(launch()).toEqual({
		args: ["--mode", "rpc-ui"],
		profile: "work:computer,read,glob,grep,ask,web_search,todo",
		edit: "",
		btw: "1",
	});
	fixture.prefs.set(WORK_TOOL_PROFILE_PREF, { tools: ["bash", "write", "write", "ask"] });
	work.restart();
	expect(launch()).toEqual({ args: ["--mode", "rpc-ui"], profile: "work:computer,ask,write", edit: "", btw: "0" });
	fixture.prefs.set(WORK_TOOL_PROFILE_PREF, { tools: [] });
	work.restart();
	expect(launch().profile).toBe("work:computer");

	coding.start();
	expect(fixture.spawn.mock.lastCall?.[2].env.WISA_STUDIO_DEFAULTS).toBe("1");
	expect(launch()).toEqual({ args: ["--mode", "rpc-ui"], profile: "coding:grep,bash", edit: "replace", btw: "1" });
	chat.start();
	expect(fixture.spawn.mock.lastCall?.[2].env.WISA_STUDIO_DEFAULTS).toBe("1");
	expect(launch()).toEqual({ args: ["--mode", "rpc-ui", "--chat"], profile: "", edit: "", btw: "0" });
	fixture.prefs.delete("launchProfiles");
	scheduled.start();
	expect(fixture.spawn.mock.lastCall?.[2].env.WISA_STUDIO_DEFAULTS).toBe("0");
	expect(launch()).toEqual({ args: ["--mode", "rpc-ui", "--no-tools"], profile: "", edit: "", btw: "1" });
});
