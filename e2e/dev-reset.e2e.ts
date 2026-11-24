import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { type Browser, chromium } from "playwright";

const exec = promisify(execFile);

test("resetting preferences restarts both Electron and the renderer server in dev", async () => {
	test.setTimeout(120_000);
	const profile = await mkdtemp(join(tmpdir(), "wisa-dev-reset-"));
	const project = join(profile, "project");
	const data = join(profile, "appData", "wisa-studio-dev");
	const prefs = join(data, "prefs.json");
	await Promise.all([mkdir(project), mkdir(data, { recursive: true })]);
	await writeFile(prefs, JSON.stringify({ language: "en", sidebarWidth: 274, lastProject: project }));

	const env: NodeJS.ProcessEnv = { ...process.env, WISA_PROFILE_ROOT: profile };
	for (const key of ["ELECTRON_RUN_AS_NODE", "ELECTRON_ENTRY", "REMOTE_DEBUGGING_PORT", "OMP_SIDECAR"])
		delete env[key];
	const dev = spawn("bun", ["run", "dev", "--clearScreen=false", "--", "--remote-debugging-port=0", project], { env });
	const exited = once(dev, "close");
	let output = "";
	for (const stream of [dev.stdout, dev.stderr]) stream.on("data", chunk => (output += chunk));
	const clients: Browser[] = [];
	const connect = async (launch: number) => {
		const endpoint = () => {
			if (dev.exitCode !== null) throw new Error(`Dev launcher exited with code ${dev.exitCode}`);
			return [...output.matchAll(/DevTools listening on (ws:\/\/\S+)/g)][launch]?.[1];
		};
		await expect.poll(endpoint, { timeout: 40_000 }).toBeDefined();
		const url = endpoint();
		if (!url) throw new Error("Missing Electron debugging endpoint");
		const client = await chromium.connectOverCDP(url);
		clients.push(client);
		const context = client.contexts()[0];
		const page = context.pages()[0] ?? (await context.waitForEvent("page"));
		await expect(page).toHaveURL(/^http:\/\/localhost:\d+\//);
		await page.waitForFunction(async () => (await window.omp?.sidecar.getStatus())?.status === "ready");
		return page;
	};
	try {
		const before = await connect(0);
		const settings = before.getByRole("button", { name: "Settings", exact: true });
		const welcome = before.getByRole("dialog", { name: "Welcome to WISA STUDIO" });
		await expect(settings.or(welcome).first()).toBeVisible();
		const closeWelcome = welcome.getByRole("button", { name: "Close", exact: true });
		await settings.click({ timeout: 1500 }).catch(async error => {
			if (!(await closeWelcome.isVisible())) throw error;
			await closeWelcome.click();
			await settings.click();
		});
		await before.getByRole("button", { name: "Reset to defaults", exact: true }).click();
		await before.getByRole("button", { name: "Reset and restart", exact: true }).click();

		const after = await connect(1);
		await expect(after.locator("[data-sidebar-navigation]")).toBeVisible();
		const saved = JSON.parse(await readFile(prefs, "utf8"));
		expect(saved.language).toBeUndefined();
		expect(saved.sidebarWidth).toBeUndefined();
		expect(saved.lastProject).toBe(project);
	} finally {
		try {
			for (const client of clients) await client.close();
			if (dev.exitCode === null) await exec("bun", ["run", "dev", "--stop"], { env, timeout: 15_000 });
			await exited;
		} finally {
			await test.info().attach("dev output", { body: output, contentType: "text/plain" });
			await rm(profile, { recursive: true, force: true, maxRetries: 12, retryDelay: 150 });
		}
	}
});
