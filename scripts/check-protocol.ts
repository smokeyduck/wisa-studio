import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { $, Glob } from "bun";
import { POST_PATHS, VALID_PATHS } from "../src/main/stats-client";
import { checkStatsRoutes, parseStatsRoutes, rendererStatsPaths } from "./protocol/stats-routes";

const root = process.env.WISA_CORE_ROOT ?? path.resolve(import.meta.dir, "../../..");
if (!path.isAbsolute(root)) throw new Error("WISA_CORE_ROOT must be an absolute path.");
if (!(await Bun.file(path.join(root, "packages/coding-agent/src/modes/rpc/rpc-types.ts")).exists())) {
	throw new Error("Protocol verification requires the OMP Core source. Set WISA_CORE_ROOT for a standalone checkout.");
}
// The contract lives in the GUI checkout; paths and compiler options come from the Core being compiled.
const dir = await mkdtemp(path.join(tmpdir(), "wisa-protocol-"));
let compilerExit: number;
try {
	const config = path.join(dir, "tsconfig.json");
	await Bun.write(
		config,
		JSON.stringify({
			extends: path.join(root, "tsconfig.base.json"),
			compilerOptions: { paths: { "wisa-protocol-core/*": [path.join(root, "packages", "*")] } },
			files: [
				path.join(import.meta.dir, "protocol/contract.ts"),
				path.join(import.meta.dir, "protocol/stats-contract.ts"),
				path.join(root, "packages/coding-agent/src/bun-fetch-cache.d.ts"),
			],
		}),
	);
	const compiler = path.join(root, "node_modules/typescript/bin/tsc");
	compilerExit = (await $`${process.execPath} ${compiler} -p ${config} --noEmit`.nothrow()).exitCode;
} finally {
	await rm(dir, { recursive: true, force: true });
}

const rendererDir = path.join(import.meta.dir, "../src/renderer");
const rendererPaths: string[] = [];
for await (const file of new Glob("**/*.{ts,tsx}").scan(rendererDir)) {
	if (/\.test\.tsx?$/.test(file)) continue;
	rendererPaths.push(...rendererStatsPaths(await Bun.file(path.join(rendererDir, file)).text()));
}
const routeErrors = checkStatsRoutes(
	parseStatsRoutes(await Bun.file(path.join(root, "packages/stats/src/server.ts")).text()),
	{ validPaths: Object.keys(VALID_PATHS), postPaths: Object.keys(POST_PATHS), rendererPaths },
);
for (const error of routeErrors) console.error(`stats contract: ${error}`);

process.exitCode = compilerExit || (routeErrors.length > 0 ? 1 : 0);
