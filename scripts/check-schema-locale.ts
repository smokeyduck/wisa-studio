/**
 * Check the actual bundled Core schema against a locale's translation tables,
 * using an isolated agent profile.
 *
 * Usage: bun scripts/check-schema-locale.ts [--lang ru|vi] [--sidecar path]
 */
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { bundledOmpFilename, resolveOmpCandidate } from "../src/main/bundled-omp-path";
import { RU_SCHEMA_OPTION_TEXT } from "../src/renderer/components/settings/schema-option-ru";
import { VI_SCHEMA_OPTION_TEXT } from "../src/renderer/components/settings/schema-option-vi";
import { RU_GROUP_TITLES, RU_SETTINGS } from "../src/renderer/components/settings/schema-ru";
import { VI_GROUP_TITLES, VI_SETTINGS } from "../src/renderer/components/settings/schema-vi";
import type { SettingEntry } from "../src/shared/rpc-types";

const LOCALES = {
	ru: {
		name: "Russian",
		settings: RU_SETTINGS as Record<string, { label?: string; description?: string }>,
		groups: RU_GROUP_TITLES as Record<string, string>,
		options: RU_SCHEMA_OPTION_TEXT as Record<string, string>,
	},
	vi: {
		name: "Vietnamese",
		settings: VI_SETTINGS as Record<string, { label?: string; description?: string }>,
		groups: VI_GROUP_TITLES as Record<string, string>,
		options: VI_SCHEMA_OPTION_TEXT as Record<string, string>,
	},
} as const;

type LocaleId = keyof typeof LOCALES;

const args = process.argv.slice(2);
const langIndex = args.indexOf("--lang");
const lang = (langIndex === -1 ? "ru" : args[langIndex + 1]) as LocaleId;
const sidecarIndex = args.indexOf("--sidecar");
const sidecarArg = args[sidecarIndex + 1];
if (!(lang in LOCALES) || (sidecarIndex !== -1 && (!sidecarArg || sidecarArg.startsWith("--")))) {
	throw new Error("Usage: bun scripts/check-schema-locale.ts [--lang ru|vi] [--sidecar path]");
}

// Pinned sidecar only: the check runs the Core schema this checkout ships, never
// an installed binary or a global CLI.
const sidecarPath = sidecarIndex === -1
	? join(import.meta.dir, "..", "resources", bundledOmpFilename())
	: resolve(sidecarArg);
const sidecar = resolveOmpCandidate(sidecarPath);
if (!sidecar) throw new Error(`No pinned sidecar at ${sidecarPath}. Build the matching sidecar before checking locales.`);
const locale = LOCALES[lang];

const temporary = await mkdtemp(join(tmpdir(), `omp-${lang}-schema-`));
// Fully isolated: the sidecar resolves global engine metadata from HOME, XDG,
// APPDATA and TEMP, so each of those points inside `temporary`. The child gets
// only the allowlisted process variables below; every inherited OMP_* / PI_*
// value (profile, session, cache, artifact overrides) is dropped. PI_CONFIG_DIR
// and PI_PROJECT_CONFIG_DIR are relative names, as the sidecar requires.
const home = join(temporary, "home");
const tmp = join(temporary, "tmp");
await mkdir(home, { recursive: true });
await mkdir(tmp, { recursive: true });
const xdg = (name: string) => join(temporary, "xdg", name);
const INHERITED = ["PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "LD_LIBRARY_PATH"];
const windows = process.platform === "win32";
const allowed = new Set(INHERITED.map(name => (windows ? name.toUpperCase() : name)));
const env: Record<string, string> = {};
for (const [name, value] of Object.entries(process.env)) {
	if (value !== undefined && allowed.has(windows ? name.toUpperCase() : name)) env[name] = value;
}
Object.assign(env, {
	HOME: home,
	USERPROFILE: home,
	APPDATA: join(home, "AppData", "Roaming"),
	LOCALAPPDATA: join(home, "AppData", "Local"),
	XDG_CONFIG_HOME: xdg("config"),
	XDG_DATA_HOME: xdg("data"),
	XDG_CACHE_HOME: xdg("cache"),
	XDG_STATE_HOME: xdg("state"),
	TMPDIR: tmp,
	TMP: tmp,
	TEMP: tmp,
	PI_CODING_AGENT_DIR: join(temporary, ".wisa-studio", "agent"),
	PI_CONFIG_DIR: ".wisa-studio",
	PI_PROJECT_CONFIG_DIR: ".wisa-studio",
	PI_CONFIG_SOURCES: "native",
	PI_NO_PTY: "1",
	PI_NOTIFICATIONS: "off",
});
const child = spawn(sidecar, ["--mode", "rpc-ui"], {
	cwd: temporary,
	env,
	stdio: ["pipe", "pipe", "pipe"],
});
/**
 * The Core schema is authored upstream and its option text carries em dashes
 * (`cell — extra spacing`); this project's tables are keyed with hyphens, since
 * no keyboard produces an em dash. Normalize before every lookup so a Core
 * update that adds a dashed description reports a real gap, not a spelling one.
 */
function normalize(text: string): string {
	return text.replace(/[\u2014\u2013\u00b7]/g, "-");
}

/** Exact key first, then the dash-normalized one. */
function translate(table: Record<string, string>, key: string | undefined): string | undefined {
	if (!key) return undefined;
	return table[key] ?? table[normalize(key)];
}

const missing = new Set<string>();
let diagnostics = "";
child.stderr.on("data", data => {
	diagnostics = (diagnostics + String(data)).slice(-2000);
});
try {
	const schema = Promise.withResolvers<SettingEntry[]>();
	const timer = setTimeout(() => schema.reject(new Error(`Schema RPC timed out: ${diagnostics}`)), 45_000);
	const lines = createInterface({ input: child.stdout });
	const fail = (error: Error) => {
		clearTimeout(timer);
		schema.reject(error);
	};
	child.once("error", fail);
	child.once("exit", code => fail(new Error(`Sidecar exited before schema response (${code}): ${diagnostics}`)));
	lines.on("line", line => {
		let frame: {
			type?: string;
			id?: string;
			success?: boolean;
			error?: string;
			data?: { entries?: SettingEntry[] };
		};
		try {
			frame = JSON.parse(line);
		} catch {
			return;
		}
		if (frame.id !== "schema" || frame.type !== "response") return;
		clearTimeout(timer);
		if (!frame.success || !Array.isArray(frame.data?.entries))
			schema.reject(new Error(frame.error ?? "Invalid schema"));
		else schema.resolve(frame.data.entries);
	});
	child.stdin.write(`${JSON.stringify({ id: "schema", type: "get_settings_schema" })}\n`);
	const entries = await schema.promise;
	for (const entry of entries) {
		const translated = locale.settings[entry.path];
		if (entry.label && !translated?.label) missing.add(`label:${entry.path}`);
		if (entry.description && !translated?.description) missing.add(`description:${entry.path}`);
		if (entry.group && !locale.groups[entry.group]) missing.add(`group:${entry.group}`);
		for (const option of entry.options ?? []) {
			if (option.label && !translate(locale.options, option.label)) missing.add(`option:${option.label}`);
			if (option.description && !translate(locale.options, option.description))
				missing.add(`option:${option.description}`);
		}
	}
	if (missing.size) throw new Error(`Missing ${locale.name} schema translations:\n${[...missing].join("\n")}`);
	console.log(`${locale.name} schema covers all ${entries.length} bundled settings and their options.`);
} finally {
	// `close` never fires when the spawn itself failed (ENOENT, EACCES), so a
	// bare `await exited` would hang the whole check instead of reporting.
	const exited = new Promise<void>(accept => {
		child.once("close", () => accept());
		child.once("error", () => accept());
	});
	if (child.exitCode === null) child.kill();
	await Promise.race([exited, new Promise<void>(accept => setTimeout(accept, 5_000).unref())]);
	await rm(temporary, { recursive: true, force: true });
}
