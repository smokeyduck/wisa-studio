import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentDir, configureAgentProfile } from "./agent-paths";
import { BenchmarkRunner } from "./benchmark-runner";
import { agentSpawnEnv, applyAppProfile, appProfilePaths } from "./dev-profile";
import { listModelsProviders } from "./models-config";
import { SessionIndex } from "./session-index";
import { SidecarManager } from "./sidecar";
import { StatsServerManager } from "./stats-server";

const electron = vi.hoisted(() => ({
	paths: {} as Record<string, string>,
	calls: [] as string[],
	packaged: true,
}));
vi.mock("electron", () => {
	const app = {
		get isPackaged() {
			return electron.packaged;
		},
		setName: () => electron.calls.push("name"),
		setAppUserModelId: (id: string) => electron.calls.push(id),
		getPath: (name: string) => electron.paths[name],
		setPath: (name: string, value: string) => {
			electron.calls.push(name);
			electron.paths[name] = value;
		},
		setAppLogsPath: (value: string) => {
			electron.calls.push("logs");
			electron.paths.logs = value;
		},
		getVersion: () => "0.0.0",
		commandLine: { removeSwitch: vi.fn(), appendSwitch: vi.fn() },
	};
	const ipcMain = { on: vi.fn() };
	return { app, ipcMain, default: { app, ipcMain } };
});

const previousAgentDir = agentDir();
const temporary: string[] = [];
afterEach(async () => {
	configureAgentProfile(previousAgentDir);
	vi.unstubAllEnvs();
	await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

function put(file: string, contents: string): void {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, contents);
}
function session(file: string, id: string, cwd: string): void {
	put(
		file,
		`${JSON.stringify({ type: "title", v: 1, title: id })}\n${JSON.stringify({ type: "session", version: 3, id, timestamp: "2026-11-22T00:00:00Z", cwd })}\n`,
	);
}

describe("consumer-visible profile isolation", () => {
	it("preserves WISA settings in each mode without importing old Electron, models or sessions", async () => {
		const home = await mkdtemp(join(tmpdir(), "wisa-profile-"));
		temporary.push(home);
		vi.stubEnv("HOME", home);
		vi.stubEnv("PI_CODING_AGENT_DIR", join(home, ".omp", "agent"));
		put(
			join(home, ".omp", "agent", "models.yml"),
			"providers:\n  old-sentinel:\n    baseUrl: https://old.invalid/v1\n",
		);
		session(join(home, ".omp", "agent", "sessions", "project", "old.jsonl"), "old-sentinel", home);
		put(join(home, "appData", "omp", "prefs.json"), '{"sentinel":"old"}');
		for (const packaged of [true, false]) {
			const profile = appProfilePaths(join(home, "appData"), home, packaged);
			const id = packaged ? "wisa-prod" : "wisa-dev";
			put(join(profile.userData, "prefs.json"), JSON.stringify({ sentinel: id }));
			put(join(profile.agentDir, "models.yml"), `providers:\n  ${id}:\n    baseUrl: https://wisa.invalid/v1\n`);
			session(join(profile.agentDir, "sessions", "project", `${id}.jsonl`), id, home);
			electron.paths = { appData: join(home, "appData") };
			electron.calls = [];
			electron.packaged = packaged;
			applyAppProfile();
			expect(electron.calls.slice(0, 2)).toEqual(["name", packaged ? "org.wisa.studio" : "org.wisa.studio.dev"]);
			expect(electron.paths).toMatchObject({
				userData: profile.userData,
				sessionData: profile.userData,
				logs: join(profile.userData, "logs"),
				crashDumps: join(profile.userData, "Crashpad"),
			});
			expect(JSON.parse(readFileSync(join(profile.userData, "prefs.json"), "utf8"))).toEqual({ sentinel: id });
			expect(listModelsProviders().map(provider => provider.id)).toEqual([id]);
			expect((await new SessionIndex(undefined, profile.userData).list("global")).map(info => info.id)).toEqual([
				id,
			]);
		}
		expect(readFileSync(join(home, "appData", "omp", "prefs.json"), "utf8")).toBe('{"sentinel":"old"}');
	});
	it.each([true, false])(
		"anchors explicit automation profiles without borrowing OS appData, packaged=%s",
		packaged => {
			const root = join(tmpdir(), `wisa-automation-${process.pid}-${packaged}`);
			temporary.push(root);
			vi.stubEnv("WISA_PROFILE_ROOT", root);
			electron.paths = { appData: "/foreign/appData" };
			electron.packaged = packaged;
			const paths = applyAppProfile();
			const expected = appProfilePaths(join(root, "appData"), root, packaged);
			expect(paths).toEqual(expected);
			const env = agentSpawnEnv({
				HOME: "/foreign/home",
				USERPROFILE: "/foreign/home",
				Home: "/foreign/mixed-home",
				UserProfile: "/foreign/mixed-profile",
			});
			expect(env).not.toHaveProperty("Home");
			expect(env).not.toHaveProperty("UserProfile");
			expect(env).toMatchObject({
				HOME: root,
				USERPROFILE: root,
				PI_CODING_AGENT_DIR: expected.agentDir,
				PI_NATIVES_DIR: join(root, expected.configDir, "natives"),
			});
		},
	);

	it("rejects relative automation roots before writing profile paths", () => {
		vi.stubEnv("WISA_PROFILE_ROOT", "../foreign");
		electron.paths = { appData: "/foreign/appData" };
		expect(() => applyAppProfile()).toThrow("WISA_PROFILE_ROOT must be absolute");
		expect(electron.paths).toEqual({ appData: "/foreign/appData" });
	});

	it.each([true, false])(
		"uses the same isolated settings across RPC, stats and benchmarks, packaged=%s",
		async packaged => {
			const home = await mkdtemp(join(tmpdir(), "wisa-child-profile-"));
			temporary.push(home);
			vi.stubEnv("HOME", home);
			const report = join(home, "children.jsonl");
			vi.stubEnv("WISA_FIXTURE_REPORT", report);
			vi.stubEnv("PI_CODING_AGENT_DIR", join(home, ".omp", "agent"));
			vi.stubEnv("PI_SESSION_FILE", join(home, ".omp", "parent.jsonl"));
			vi.stubEnv("OMP_PROFILE", "foreign");
			const profile = appProfilePaths(join(home, "appData"), home, packaged);
			electron.paths = { appData: join(home, "appData") };
			electron.packaged = packaged;
			applyAppProfile();
			put(join(home, ".omp", "agent", "marker"), "old-sentinel");
			put(join(profile.agentDir, "marker"), packaged ? "wisa-prod" : "wisa-dev");
			const binary = join(home, "fake-omp.ts");
			put(
				binary,
				`#!/usr/bin/env bun
import { readFileSync, appendFileSync, watch } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
appendFileSync(process.env.WISA_FIXTURE_REPORT!, JSON.stringify({ marker: readFileSync(join(process.env.PI_CODING_AGENT_DIR!, "marker"), "utf8"), config: process.env.PI_CONFIG_DIR, project: process.env.PI_PROJECT_CONFIG_DIR, sources: process.env.PI_CONFIG_SOURCES, natives: process.env.PI_NATIVES_DIR, session: process.env.PI_SESSION_FILE, profile: process.env.OMP_PROFILE }) + "\\n");
if (args.includes("--help")) { console.log("--no-open"); process.exit(0); }
if (args.some(arg => arg.startsWith("--mode="))) process.exit(1);
if (args[0] === "bench") { console.log('{"runs":1,"models":[],"failures":0}'); process.exit(0); }
if (args[0] === "stats") console.log("Dashboard available at: http://127.0.0.1:55129");
else console.log(JSON.stringify({ type: "ready", protocolVersion: 1, supportedProtocolVersions: [1] }));
process.stdin.resume();
watch(process.env.HOME!, () => {});
`,
			);
			await chmod(binary, 0o755);
			const rpc = new SidecarManager({
				binaryPath: binary,
				cwd: home,
				shellEnv: async () => ({
					PI_CODING_AGENT_DIR: "/shell/foreign",
					PI_CONFIG_DIR: ".omp",
					PI_SESSION_FILE: "/shell/parent",
				}),
			});
			const stats = new StatsServerManager(binary);
			try {
				rpc.start();
				stats.start();
				await expect.poll(() => rpc.status, { timeout: 5000 }).toBe("ready");
				await expect.poll(() => stats.port, { timeout: 5000 }).toBe(55129);
				expect(
					(
						await new BenchmarkRunner().run(
							binary,
							home,
							{ models: ["local/model"], profile: "chat", runs: 1, parallel: 1 },
							agentSpawnEnv(),
						)
					).success,
				).toBe(true);
				const children = readFileSync(report, "utf8")
					.trim()
					.split("\n")
					.map(line => JSON.parse(line));
				expect(children).toHaveLength(3);
				for (const child of children)
					expect(child).toEqual({
						marker: packaged ? "wisa-prod" : "wisa-dev",
						config: profile.configDir,
						project: profile.configDir,
						sources: "native",
						natives: join(profile.agentDir, "..", "natives"),
					});
			} finally {
				rpc.dispose();
				stats.kill();
			}
		},
	);
});
