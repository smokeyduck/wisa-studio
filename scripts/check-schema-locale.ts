/**
 * Check the actual bundled Core schema against a locale's translation tables,
 * using an isolated agent profile.
 *
 * Usage: bun scripts/check-schema-locale.ts <sidecar-path> [--lang ru|vi]
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { resolveDevSidecar } from "../src/main/dev-sidecar";
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
if (!(lang in LOCALES)) throw new Error("Usage: bun scripts/check-schema-locale.ts [sidecar-path] [--lang ru|vi]");

// Default to the built sidecars, then to whatever `bun run dev` would spawn:
// the check must run against a real Core schema, and a checkout mid-build has
// no resources/omp.
const sidecar = args.find((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--lang") ?? builtSidecar();
if (!sidecar) {
	throw new Error(
		[
			"No sidecar to check against: build one with `bun run build:omp`, or pass its path.",
			"An installed WISA STUDIO / omp bundle also works.",
		].join("\n"),
	);
}
const locale = LOCALES[lang];

function builtSidecar(): string | null {
	const candidates = ["omp", "omp.x64", "omp.exe"].map(name => join(import.meta.dir, "..", "resources", name));
	return candidates.find(existsSync) ?? resolveDevSidecar()?.path ?? null;
}

const temporary = await mkdtemp(join(tmpdir(), `omp-${lang}-schema-`));
const child = spawn(sidecar, ["--mode", "rpc-ui"], {
	cwd: temporary,
	env: { ...process.env, PI_CODING_AGENT_DIR: temporary, PI_NO_PTY: "1", PI_NOTIFICATIONS: "off" },
	stdio: ["pipe", "pipe", "pipe"],
});
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
			if (option.label && !locale.options[option.label]) missing.add(`option:${option.label}`);
			if (option.description && !locale.options[option.description]) missing.add(`option:${option.description}`);
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
