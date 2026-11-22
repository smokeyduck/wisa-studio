// Sidecar deadlock smoke probe (dev only — requires the native addon at
// packages/natives/native/pi_natives.darwin-arm64.node).
//
// Boots the SAME spawn the GUI uses for source sidecars —
//   `bun packages/coding-agent/src/cli.ts --mode rpc-ui`
// then replays the deadlock sequence:
//   get_state → get_available_models (the command that wedged the serial queue)
//   → get_state (must still answer) → set_thinking_level (mutating).
//
// Wedge signal is post-discovery LATENCY: a bricked serial queue returns
// nothing, so any post-discovery command exceeding WEDGE_MS means the queue is
// still bricked. Run: `bun run packages/gui/scripts/smoke-sidecar.mjs`.
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
const spawnArgs = exe ? ["--mode", "rpc-ui"] : [CLI, "--mode", "rpc-ui"];
console.log(`probing: ${spawnCmd} ${spawnArgs.join(" ")}`);

// Isolated home: this probe sends mutating RPCs (set_thinking_level), so it must
// never reach the user's real agent profile. Only the allowlisted process
// variables are inherited; every OMP_* / PI_* value from the caller is dropped.
const home = await mkdtemp(join(tmpdir(), "omp-smoke-"));
// Fixture project. Never run in the repo: an old binary would read its .omp/.claude.
// Sentinels: legacy .omp compaction.enabled=true; ambient .claude display.showTokenUsage=true.
// WISA project compaction.enabled=false, no display key. Expected: compaction.enabled=false
// (WISA project loaded), display.showTokenUsage=false (schema default off; .claude ignored).
const project = join(home, "project");
await mkdir(join(project, ".omp"), { recursive: true });
await mkdir(join(project, ".wisa-studio"), { recursive: true });
await mkdir(join(project, ".claude"), { recursive: true });
await writeFile(join(project, ".omp", "config.yml"), "compaction:\n  enabled: true\n");
await writeFile(join(project, ".wisa-studio", "config.yml"), "compaction:\n  enabled: false\n");
await writeFile(join(project, ".claude", "settings.json"), JSON.stringify({ display: { showTokenUsage: true } }));
// Ambient dotenv sentinel: if loaded, mutating RPCs would write under the legacy agent dir.
await writeFile(join(project, ".env"), `PI_CODING_AGENT_DIR=${join(home, ".omp", "agent")}\n`);
const inherited = Object.fromEntries(
	["PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "LD_LIBRARY_PATH"]
		.filter(name => process.env[name] !== undefined)
		.map(name => [name, process.env[name]]),
);
const child = spawn(spawnCmd, spawnArgs, {
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
		TMPDIR: join(home, "tmp"),
		TMP: join(home, "tmp"),
		TEMP: join(home, "tmp"),
		PI_CODING_AGENT_DIR: join(home, ".wisa-studio", "agent"),
		PI_NATIVES_DIR: join(home, ".wisa-studio", "natives"),
		PI_CONFIG_DIR: ".wisa-studio",
		PI_PROJECT_CONFIG_DIR: ".wisa-studio",
		PI_CONFIG_SOURCES: "native",
		PI_RPC_EMIT_TITLE: "1",
		PI_NO_PTY: "1",
		PI_NOTIFICATIONS: "off",
	},
});

const pending = new Map();
const results = [];
let readyDone = false;
let finished = false;
let seq = 0;

const send = (type, extra = {}) => {
	const id = `probe-${++seq}`;
	const t0 = Date.now();
	const p = new Promise(res => pending.set(id, { res, t0 }));
	child.stdin.write(`${JSON.stringify({ id, type, ...extra })}\n`);
	return p;
};

const rl = createInterface({ input: child.stdout });
rl.on("line", line => {
	let f;
	try {
		f = JSON.parse(line);
	} catch {
		return;
	}
	if (f.type === "response" && f.id && pending.has(f.id)) {
		const { res, t0 } = pending.get(f.id);
		pending.delete(f.id);
		results.push({ id: f.id, ok: f.success, ms: Date.now() - t0 });
		res(f);
	}
});
child.stderr.on("data", d => {
	const t = d.toString().trim();
	if (t) process.stderr.write(`[sidecar] ${t.slice(0, 200)}\n`);
});

const hardKill = setTimeout(() => {
	console.log(`HARD_TIMEOUT — sidecar wedged past ${HARD_TIMEOUT_MS}ms`);
	child.kill("SIGKILL");
}, HARD_TIMEOUT_MS);
child.on("exit", code => {
	if (finished) return;
	console.log(`SIDECAR_EXIT code=${code} readyDone=${readyDone} — aborting`);
	clearTimeout(hardKill);
	process.exit(code || 3);
});

(async () => {
	const ready = await new Promise(res => {
		const onLine = line => {
			try {
				const f = JSON.parse(line);
				if (f.type === "ready") {
					readyDone = true;
					rl.off("line", onLine);
					res(f);
				}
			} catch {}
		};
		rl.on("line", onLine);
	});
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
	// Namespace + native-filter check on the parsed response. Only WISA's false and the
	// default true are accepted; a missing key or any other value fails the probe.
	const profile = await send("get_settings", { paths: ["compaction.enabled", "display.showTokenUsage"] });
	const profileValues = profile.data?.values ?? {};
	const wisaProjectLoaded =
		profile.success && profileValues["compaction.enabled"] === false && profileValues["display.showTokenUsage"] === false;
	console.log(`project config loaded  ${wisaProjectLoaded ? "ok " : "ERR"}  values=${JSON.stringify(profileValues)}`);

	let settingsPersisted = false;
	if (settingsReadable) {
		const toggledColorBlindMode = !originalColorBlindMode;
		const toggle = await send("set_setting", { path: "colorBlindMode", value: toggledColorBlindMode });
		const settingsAfter = await send("get_settings", { paths: ["colorBlindMode"] });
		settingsPersisted = toggle.success && settingsAfter.data?.values?.colorBlindMode === toggledColorBlindMode;
		console.log(`set_setting round-trip  ${settingsPersisted ? "ok " : "ERR"} ${results.at(-2).ms + results.at(-1).ms}ms`);
		await send("set_setting", { path: "colorBlindMode", value: originalColorBlindMode });
	}

	const postDiscovery = [follow, mutate];
	const wedged = postDiscovery.some(r => r.ms > WEDGE_MS);
	const modelsReturned = models.ms <= WEDGE_MS;
	const legacyAgentWritten = existsSync(join(home, ".omp", "agent"));
	console.log(`legacy agent write     ${legacyAgentWritten ? "ERR" : "ok "}`);
	const pass = !wedged && modelsReturned && settingsReadable && settingsPersisted && wisaProjectLoaded && !legacyAgentWritten;
	console.log(
		`\nVERDICT ${pass ? "PASS" : "FAIL"}  postDiscoveryMax=${Math.max(...postDiscovery.map(r => r.ms))}ms  models=${models.ms}ms  commands=${results.length}`,
	);
	if (!modelsReturned) console.log("FAIL get_available_models hung past the bound — discovery await not bounded");
	if (wedged) console.log("FAIL a post-discovery command wedged — serial queue still bricked");

	finished = true;
	clearTimeout(hardKill);
	child.kill("SIGTERM");
	setTimeout(() => child.kill("SIGKILL"), 1500);
})();
