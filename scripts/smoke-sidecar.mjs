// Release sidecar probe: RPC readiness, discovery latency, profile isolation,
// settings round-trip, and persistence across a process restart in one profile.
// Pass the packaged executable, or omit it to probe the source CLI with Bun.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

// `URL.pathname` keeps a leading slash on Windows (`/E:/…`), which `spawn`
// rejects as a missing cwd — the probe would ENOENT on a healthy binary.
const CLI = fileURLToPath(new URL("../../coding-agent/src/cli.ts", import.meta.url));
const WEDGE_MS = 6000;
const HARD_TIMEOUT_MS = Number(process.env.OMP_SIDECAR_SMOKE_TIMEOUT_MS ?? 40_000);

// Optional: pass an executable to probe the bundled binary instead of source.
//   bun run packages/gui/scripts/smoke-sidecar.mjs
//   bun run packages/gui/scripts/smoke-sidecar.mjs packages/gui/resources/omp
const exe = process.argv[2];
const spawnCmd = exe ? resolve(exe) : "bun";
const spawnArgs = [...(exe ? [] : [CLI]), "--mode", "rpc-ui", "--no-auto-resume"];
console.log(`probing: ${spawnCmd} ${spawnArgs.join(" ")}`);

// Isolated home: this probe sends mutating RPCs (set_thinking_level), so it must
// never reach the user's real agent profile. Only the allowlisted process
// variables are inherited; every OMP_* / PI_* value from the caller is dropped.
const home = await mkdtemp(join(tmpdir(), "omp-smoke-"));
const childTmp = join(home, "tmp");
await mkdir(childTmp);
// Fixture project. Never run in the repo: an old binary would read its .omp/.claude.
// Sentinels: legacy .omp compaction.enabled=true and thresholdPercent=75; ambient .claude showTokenUsage=true.
// WISA project compaction.enabled=false, no threshold or display key. Expected: enabled=false
// (WISA project loaded), thresholdPercent=20 and showTokenUsage=false (legacy sentinels ignored).
const project = join(home, "project");
await mkdir(join(project, ".omp"), { recursive: true });
await mkdir(join(project, ".wisa-studio"), { recursive: true });
await mkdir(join(project, ".claude"), { recursive: true });
await writeFile(join(project, ".omp", "config.yml"), "compaction:\n  enabled: true\n  thresholdPercent: 75\n");
await writeFile(join(project, ".wisa-studio", "config.yml"), "compaction:\n  enabled: false\n");
await writeFile(join(project, ".claude", "settings.json"), JSON.stringify({ display: { showTokenUsage: true } }));
// Ambient dotenv sentinel: if loaded, mutating RPCs would write under the legacy agent dir.
await writeFile(join(project, ".env"), `PI_CODING_AGENT_DIR=${join(home, ".omp", "agent")}\n`);
const inherited = Object.fromEntries(
	["PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "LD_LIBRARY_PATH"]
		.filter(name => process.env[name] !== undefined)
		.map(name => [name, process.env[name]]),
);
const spawnOptions = {
	cwd: project,
	stdio: ["pipe", "pipe", "pipe"],
	env: {
		...inherited,
		HOME: home,
		WISA_PROFILE_ROOT: home,
		USERPROFILE: home,
		APPDATA: join(home, "appData"),
		LOCALAPPDATA: join(home, "AppData", "Local"),
		XDG_CONFIG_HOME: join(home, "xdg", "config"),
		XDG_DATA_HOME: join(home, "xdg", "data"),
		XDG_STATE_HOME: join(home, "xdg", "state"),
		XDG_CACHE_HOME: join(home, "xdg", "cache"),
		TMPDIR: childTmp,
		TMP: childTmp,
		TEMP: childTmp,
		PI_CODING_AGENT_DIR: join(home, ".wisa-studio", "agent"),
		PI_NATIVES_DIR: join(home, ".wisa-studio", "natives"),
		PI_CONFIG_DIR: ".wisa-studio",
		PI_PROJECT_CONFIG_DIR: ".wisa-studio",
		PI_CONFIG_SOURCES: "native",
		PI_RPC_EMIT_TITLE: "1",
		PI_NO_PTY: "1",
		PI_NOTIFICATIONS: "off",
		WISA_STUDIO_DEFAULTS: "1",
	},
};
const memoryPaths = ["memory.backend", "autolearn.enabled", "autolearn.autoContinue"];

const pending = new Map();
const results = [];
let readyDone = false;
let finished = false;
let seq = 0;
let child;
let stopping = false;

const send = (type, extra = {}) => {
	const id = `probe-${++seq}`;
	const t0 = Date.now();
	const p = new Promise(res => pending.set(id, { res, t0 }));
	child.stdin.write(`${JSON.stringify({ id, type, ...extra })}\n`);
	return p;
};

const startChild = (args = spawnArgs) => {
	stopping = false;
	readyDone = false;
	child = spawn(spawnCmd, args, spawnOptions);
	const rl = createInterface({ input: child.stdout });
	let startupLines = 0;
	const ready = new Promise(resolve => {
		rl.on("line", line => {
			let f;
			try {
				f = JSON.parse(line);
			} catch {
				if (!readyDone && startupLines++ < 4) {
					process.stderr.write(`[sidecar stdout] ${line.slice(0, 200)}\n`);
				}
				return;
			}
			if (!readyDone && f?.type !== "ready" && f?.type !== "response" && startupLines++ < 4) {
				process.stderr.write(`[sidecar startup] ${line.slice(0, 200)}\n`);
			}
			if (f.type === "ready") {
				readyDone = true;
				resolve(f);
			}
			if (f.type === "response" && f.id && pending.has(f.id)) {
				const { res, t0 } = pending.get(f.id);
				pending.delete(f.id);
				results.push({ id: f.id, ok: f.success, ms: Date.now() - t0 });
				res(f);
			}
		});
	});
	child.stderr.on("data", d => {
		const t = d.toString().trim();
		if (t) process.stderr.write(`[sidecar] ${t.slice(0, 200)}\n`);
	});
	child.on("error", error => {
		console.error(error);
		clearTimeout(hardKill);
		process.exit(1);
	});
	// 'exit' can precede the final stdout/stderr data; wait until pipes drain.
	child.on("close", code => {
		if (finished || stopping) return;
		console.log(`SIDECAR_EXIT code=${code} readyDone=${readyDone} — aborting`);
		clearTimeout(hardKill);
		process.exit(code || 3);
	});
	return ready;
};

const stopChild = async () => {
	stopping = true;
	const exited = new Promise(resolve => child.once("close", resolve));
	const forceKill = setTimeout(() => child.kill("SIGKILL"), 1500);
	child.kill("SIGTERM");
	await exited;
	clearTimeout(forceKill);
};

const hardKill = setTimeout(() => {
	console.log(`HARD_TIMEOUT — sidecar wedged past ${HARD_TIMEOUT_MS}ms`);
	child.kill("SIGKILL");
}, HARD_TIMEOUT_MS);
const initialReady = startChild();

(async () => {
	const ready = await initialReady;
	console.log(`READY protocolVersion=${ready.protocolVersion}`);

	await send("negotiate_protocol", { protocolVersion: 2 });

	await send("get_state");
	console.log(`get_state[boot]         ${results.at(-1).ok ? "ok " : "ERR"} ${results.at(-1).ms}ms`);

	await send("get_available_models");
	const models = results.at(-1);
	console.log(`get_available_models    ${models.ok ? "ok " : "ERR"} ${models.ms}ms`);

	await send("get_state");
	const follow = results.at(-1);
	console.log(`get_state[after-models] ${follow.ok ? "ok " : "ERR"} ${follow.ms}ms`);

	await send("set_thinking_level", { level: "off" });
	const mutate = results.at(-1);
	console.log(`set_thinking_level      ${mutate.ok ? "ok " : "ERR"} ${mutate.ms}ms`);

	const settingsBefore = await send("get_settings", { paths: ["colorBlindMode"] });
	const originalColorBlindMode = settingsBefore.data?.values?.colorBlindMode;
	const settingsReadable = settingsBefore.success && typeof originalColorBlindMode === "boolean";
	console.log(`get_settings            ${settingsReadable ? "ok " : "ERR"} ${results.at(-1).ms}ms`);
	// Namespace, native-filter and effective desktop compaction-default checks.
	const profile = await send("get_settings", {
		paths: ["compaction.enabled", "compaction.thresholdPercent", "display.showTokenUsage"],
	});
	const profileValues = profile.data?.values ?? {};
	const wisaProjectLoaded =
		profile.success &&
		profileValues["compaction.enabled"] === false &&
		profileValues["compaction.thresholdPercent"] === 20 &&
		profileValues["display.showTokenUsage"] === false;
	console.log(`project config loaded  ${wisaProjectLoaded ? "ok " : "ERR"}  values=${JSON.stringify(profileValues)}`);
	const thresholdPath = "compaction.thresholdPercent";
	const explicitThreshold = await send("set_setting", { path: thresholdPath, value: 30 });
	const thresholdAfter = await send("get_settings", { paths: [thresholdPath] });
	const thresholdOverrideMatches =
		explicitThreshold.success && thresholdAfter.success && thresholdAfter.data?.values?.[thresholdPath] === 30;
	console.log(`explicit threshold     ${thresholdOverrideMatches ? "ok " : "ERR"}`);

	// Check the effective values that Settings and Skills consume, not just
	// schema metadata. Enabling the guidance must not opt into an extra turn.
	const memoryDefaults = await send("get_settings", { paths: memoryPaths });
	const memoryValues = memoryDefaults.data?.values;
	const memoryDefaultsMatch =
		memoryDefaults.success &&
		memoryValues?.["memory.backend"] === "local" &&
		memoryValues?.["autolearn.enabled"] === true &&
		memoryValues?.["autolearn.autoContinue"] === false;
	console.log(`desktop memory defaults ${memoryDefaultsMatch ? "ok " : "ERR"}  values=${JSON.stringify(memoryValues)}`);
	const memoryOff = await send("set_setting", { path: "memory.backend", value: "off" });
	const autolearnOff = await send("set_setting", { path: "autolearn.enabled", value: false });
	const memoryOverrides = await send("get_settings", { paths: memoryPaths });
	const memoryOptOutsMatch =
		memoryOff.success &&
		autolearnOff.success &&
		memoryOverrides.success &&
		memoryOverrides.data?.values?.["memory.backend"] === "off" &&
		memoryOverrides.data?.values?.["autolearn.enabled"] === false;
	console.log(`desktop memory opt-outs ${memoryOptOutsMatch ? "ok " : "ERR"}`);

	let settingsPersisted = false;
	if (settingsReadable) {
		const toggledColorBlindMode = !originalColorBlindMode;
		const toggle = await send("set_setting", { path: "colorBlindMode", value: toggledColorBlindMode });
		const settingsAfter = await send("get_settings", { paths: ["colorBlindMode"] });
		settingsPersisted = toggle.success && settingsAfter.data?.values?.colorBlindMode === toggledColorBlindMode;
		console.log(`set_setting round-trip  ${settingsPersisted ? "ok " : "ERR"} ${results.at(-2).ms + results.at(-1).ms}ms`);
		await stopChild();
		await startChild();
		await send("negotiate_protocol", { protocolVersion: 2 });
		const settingsRestarted = await send("get_settings", { paths: ["colorBlindMode"] });
		settingsPersisted = settingsPersisted && settingsRestarted.success &&
			settingsRestarted.data?.values?.colorBlindMode === toggledColorBlindMode;
		console.log(`settings after restart ${settingsPersisted ? "ok " : "ERR"}`);
		const restore = await send("set_setting", { path: "colorBlindMode", value: originalColorBlindMode });
		settingsPersisted = settingsPersisted && restore.success;
	}

	const postDiscovery = [follow, mutate];
	const wedged = postDiscovery.some(r => r.ms > WEDGE_MS);
	const modelsReturned = models.ms <= WEDGE_MS;
	const legacyAgentWritten = existsSync(join(home, ".omp", "agent"));
	console.log(`legacy agent write     ${legacyAgentWritten ? "ERR" : "ok "}`);
	// Keep the saved opt-outs, override memory at project scope and opt out
	// of Auto-Learn again with an explicit overlay on the restarted sidecar.
	await stopChild();
	await writeFile(
		join(project, ".wisa-studio", "config.yml"),
		"compaction:\n  enabled: false\nmemory:\n  backend: local\nautolearn:\n  enabled: true\n",
	);
	const overlay = join(home, "overrides.yml");
	await writeFile(overlay, "autolearn:\n  enabled: false\n");
	await startChild([...spawnArgs, "--config", overlay]);
	await send("negotiate_protocol", { protocolVersion: 2 });
	const precedence = await send("get_settings", { paths: memoryPaths });
	const { values, provenance } = precedence.data ?? {};
	const memoryPrecedenceMatch =
		precedence.success &&
		values?.["memory.backend"] === "local" &&
		values?.["autolearn.enabled"] === false &&
		provenance?.["memory.backend"]?.layers?.join(",") === "global,project" &&
		provenance?.["autolearn.enabled"]?.layers?.join(",") === "global,project,overlay";
	console.log(`memory override order  ${memoryPrecedenceMatch ? "ok " : "ERR"}  values=${JSON.stringify(values)}`);
	const pass =
		!wedged &&
		modelsReturned &&
		settingsReadable &&
		settingsPersisted &&
		wisaProjectLoaded &&
		thresholdOverrideMatches &&
		memoryDefaultsMatch &&
		memoryOptOutsMatch &&
		memoryPrecedenceMatch &&
		!legacyAgentWritten;
	console.log(
		`\nVERDICT ${pass ? "PASS" : "FAIL"}  postDiscoveryMax=${Math.max(...postDiscovery.map(r => r.ms))}ms  models=${models.ms}ms  commands=${results.length}`,
	);
	if (!modelsReturned) console.log("FAIL get_available_models hung past the bound — discovery await not bounded");
	if (wedged) console.log("FAIL a post-discovery command wedged — serial queue still bricked");

	process.exitCode = pass ? 0 : 1;
	finished = true;
	clearTimeout(hardKill);
	await stopChild();
})();
