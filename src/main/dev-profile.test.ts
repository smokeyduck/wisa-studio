import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { agentDir, configureAgentProfile } from "./agent-paths";
import { agentSpawnEnv, appProfilePaths } from "./dev-profile";

describe("WISA profile isolation", () => {
	it.each([true, false])("pins all storage independently, packaged=%s", packaged => {
		const name = packaged ? "wisa-studio" : "wisa-studio-dev";
		const paths = appProfilePaths("/home/u/.config", "/home/u", packaged);
		expect(paths).toEqual({
			userData: `/home/u/.config/${name}`,
			configDir: `.${name}`,
			agentDir: `/home/u/.${name}/agent`,
		});
		const previous = agentDir();
		const fixture = mkdtempSync(join(tmpdir(), "wisa-env-"));
		configureAgentProfile(join(fixture, paths.configDir, "agent"));
		try {
			const inherited = {
				HOME: "/home/u",
				PATH: "/bin",
				OPENAI_API_KEY: "explicit-os-key",
				SSH_AUTH_SOCK: "/ssh/socket",
				PI_CODING_AGENT_DIR: "/old/agent",
				PI_CONFIG_DIR: ".omp",
				OMP_PROFILE: "old",
				PI_PROFILE: "old",
				PI_SESSION_FILE: "/old/session",
				PI_SESSION_ID: "old",
				PI_CODING_AGENT_SESSION_DIR: "/old/sessions",
				PI_ARTIFACTS_DIR: "/old/artifacts",
				PI_TOOL_BRIDGE_TOKEN: "old",
				PI_BROWSER_RELAY_URL: "old",
				OMP_AUTH_BROKER_URL: "old",
				OMP_WORKTREE_DIR: "/old/wt",
				XDG_CACHE_HOME: "/old/cache",
			};
			const original = { ...inherited };
			const env = agentSpawnEnv(inherited);
			expect(inherited).toEqual(original);
			expect(env).toMatchObject({
				HOME: "/home/u",
				PATH: "/bin",
				OPENAI_API_KEY: "explicit-os-key",
				SSH_AUTH_SOCK: "/ssh/socket",
				PI_CODING_AGENT_DIR: join(fixture, paths.configDir, "agent"),
				PI_CONFIG_DIR: paths.configDir,
				PI_PROJECT_CONFIG_DIR: paths.configDir,
				PI_CONFIG_SOURCES: "native",
			});
			for (const key of [
				"OMP_PROFILE",
				"PI_PROFILE",
				"PI_SESSION_FILE",
				"PI_SESSION_ID",
				"PI_CODING_AGENT_SESSION_DIR",
				"PI_ARTIFACTS_DIR",
				"PI_TOOL_BRIDGE_TOKEN",
				"PI_BROWSER_RELAY_URL",
				"OMP_AUTH_BROKER_URL",
				"OMP_WORKTREE_DIR",
			])
				expect(env[key]).toBeUndefined();
			for (const kind of ["CONFIG", "DATA", "STATE", "CACHE"])
				expect(env[`XDG_${kind}_HOME`]).toBe(join(fixture, paths.configDir, "xdg", kind.toLowerCase()));
			expect(env.PI_NATIVES_DIR).toBe(join(fixture, paths.configDir, "natives"));
		} finally {
			configureAgentProfile(previous);
			rmSync(fixture, { recursive: true, force: true });
		}
	});
	it("ignores a parent omp profile in desktop readers", () => {
		const previous = agentDir();
		configureAgentProfile("/wisa/agent");
		vi.stubEnv("PI_CODING_AGENT_DIR", "/old/agent");
		try {
			expect(agentDir()).toBe("/wisa/agent");
		} finally {
			vi.unstubAllEnvs();
			configureAgentProfile(previous);
		}
	});
	it("strips mixed-case Windows aliases before pinning directories and runtime endpoints", () => {
		const previous = agentDir();
		const root = mkdtempSync(join(tmpdir(), "wisa-win-env-"));
		configureAgentProfile(join(root, ".wisa-studio", "agent"));
		try {
			const env = agentSpawnEnv({
				Pi_Coding_Agent_Dir: "/old/agent",
				Pi_Config_Dir: ".omp",
				Pi_Config_Sources: "all",
				Omp_Profile: "foreign",
				Pi_Natives_Dir: "/old/native",
				Pi_Browser_Relay_Url: "http://127.0.0.1:1234",
				Omp_Daemon_Tcp: "127.0.0.1:1235",
				Xdg_Data_Home: "/old/data",
				Tmp: "/old/tmp",
				CMUX_RELAY_ID: "old-id",
				CMUX_RELAY_TOKEN: "old-token",
				Path: "/os/bin",
			});
			expect(Object.keys(env).filter(key => key !== key.toUpperCase())).toEqual(["Path"]);
			expect(env.OMP_PROFILE).toBeUndefined();
			expect(env.CMUX_RELAY_TOKEN).toBeUndefined();
			expect(env.PI_NATIVES_DIR).toBe(join(root, ".wisa-studio", "natives"));
			expect(env.XDG_DATA_HOME).toBe(join(root, ".wisa-studio", "xdg", "data"));
			expect(env.Path).toBe("/os/bin");
		} finally {
			configureAgentProfile(previous);
			rmSync(root, { recursive: true, force: true });
		}
	});
	it.runIf(process.platform === "win32")("preserves inherited Git options when enabling long paths", () => {
		const inherited = {
			Git_Config_Count: "1",
			GIT_CONFIG_KEY_0: "http.version",
			GIT_CONFIG_VALUE_0: "HTTP/1.1",
			Git_Config_Value_1: "unused value outside the configured count",
		};
		const env = agentSpawnEnv(inherited);
		expect(env).toMatchObject({
			GIT_CONFIG_COUNT: "2",
			GIT_CONFIG_KEY_0: "http.version",
			GIT_CONFIG_VALUE_0: "HTTP/1.1",
			GIT_CONFIG_KEY_1: "core.longpaths",
			GIT_CONFIG_VALUE_1: "true",
		});
		expect(env.Git_Config_Count).toBeUndefined();
		expect(env.Git_Config_Value_1).toBeUndefined();
		expect(inherited.Git_Config_Count).toBe("1");
	});
});
