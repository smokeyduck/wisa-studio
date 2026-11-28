import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { type Browser, chromium } from "playwright";
import { vi } from "../src/renderer/locales/vi";

const exec = promisify(execFile);
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6VQAAAAASUVORK5CYII=";

test("native APIs, session changes, BTW history and image paste stay usable across a dev main rebuild", async () => {
	const profile = await mkdtemp(join(tmpdir(), "wisa-feedback-"));
	const data = join(profile, "appData", "wisa-studio-dev");
	const project = join(profile, "project");
	const record = join(profile, "rpc.jsonl");
	await Promise.all([mkdir(data, { recursive: true }), mkdir(project)]);
	await writeFile(
		join(data, "prefs.json"),
		JSON.stringify({
			language: "vi",
			firstRunComplete: true,
			theme: "dark",
			themeName: "dark",
			"onboarding.tutorialCompleted.v1": true,
		}),
	);
	const env: NodeJS.ProcessEnv = {
		...process.env,
		WISA_PROFILE_ROOT: profile,
		OMP_SIDECAR: "source",
		OMP_SIDECAR_CLI: resolve("e2e/sidecar-fixture.ts"),
		OMP_BUNDLED_OMP: resolve("resources/omp"),
		OMP_GUI_TEST_MODEL_ID: "deepseek/deepseek-v4.1-flash",
		OMP_GUI_TEST_MODEL_NAME: "DeepSeek V4.1 Flash",
		OMP_GUI_TEST_VISION: "1",
		OMP_GUI_TEST_RECORD: record,
	};
	for (const key of ["ELECTRON_RUN_AS_NODE", "ELECTRON_ENTRY", "REMOTE_DEBUGGING_PORT"]) delete env[key];
	const dev = spawn("bun", ["run", "dev", "--clearScreen=false", "--", "--remote-debugging-port=0", project], { env });
	const exited = once(dev, "close");
	let output = "";
	for (const stream of [dev.stdout, dev.stderr])
		stream.on("data", chunk => {
			output += chunk;
		});
	const clients: Browser[] = [];
	const connect = async (launch: number) => {
		const endpoint = () => {
			if (dev.exitCode !== null) throw new Error(`Dev launcher exited: ${dev.exitCode}\n${output}`);
			return [...output.matchAll(/DevTools listening on (ws:\/\/\S+)/g)][launch]?.[1];
		};
		await expect.poll(endpoint, { timeout: 30_000 }).toBeDefined();
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
		const page = await connect(0);
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.setViewportSize({ width: 1280, height: 900 });
		const errors: string[] = [];
		page.on("pageerror", error => errors.push(error.message));
		const native = await page.evaluate(async () => ({
			notch: await window.omp.notch.getState(),
			wallpaper: await window.omp.wallpaper.get(),
		}));
		expect(native.wallpaper).toBeNull();
		if (process.platform === "darwin") {
			expect(native.notch).toMatchObject({
				available: true,
				error: null,
				settings: { enabled: true, showWhenIdle: true },
			});
		}
		const composer = page.locator(".omp-composer-box textarea");
		await expect(composer).toBeVisible();
		await expect(page.locator(".omp-composer-model-material")).toBeVisible();
		const expectMonochromeLogo = async () => {
			const triggerLogo = page.locator("[data-model-picker-trigger] svg[data-brand]").first();
			const watermark = page.locator(".omp-composer-model-watermark");
			await expect(triggerLogo).toHaveAttribute("data-brand", "deepseek");
			await expect(watermark).toHaveAttribute("data-brand", "deepseek");
			await expect
				.poll(async () => {
					const triggerColor = await triggerLogo.evaluate(node => getComputedStyle(node).color);
					const watermarkColor = await watermark.evaluate(node => getComputedStyle(node).color);
					return watermarkColor === triggerColor;
				})
				.toBe(true);
		};
		await expectMonochromeLogo();
		await composer.fill("Keep this unsent draft.");
		await page.screenshot({ path: "test-results/feedback-composer-dark.png", animations: "disabled" });
		await page.getByRole("button", { name: vi["titlebar.togglePanel"], exact: true }).click();
		const inspector = page.locator(".omp-inspector");
		await inspector.getByRole("button", { name: vi["panel.tabs.diff"], exact: true }).click();
		await expect(inspector.getByRole("button", { name: vi["diffPanel.scope.aria"] })).toContainText(
			vi["diffPanel.mode.current"],
		);
		await inspector.getByRole("button", { name: vi["panel.tabs.btw"], exact: true }).click();
		const side = inspector.getByRole("textbox", { name: vi["btw.title"], exact: true });
		await expect(inspector.getByText(vi["btw.emptyHint"], { exact: true })).toBeVisible();
		for (let index = 1; index <= 8; index++) {
			await inspector.getByRole("button", { name: vi["btw.newQuestion"], exact: true }).click();
			await side.fill(`Topic ${index}`);
			await side.press("Enter");
			await expect(side).toHaveValue("");
		}
		await expect(inspector.getByRole("button", { name: /^Topic / })).toHaveCount(0);
		await inspector.getByRole("button", { name: vi["btw.history"], exact: true }).click();
		const history = page.getByRole("dialog", { name: vi["btw.history"], exact: true });
		await expect(history.getByRole("button", { name: /^Topic / })).toHaveCount(8);
		await page.screenshot({ path: "test-results/feedback-btw-history.png", animations: "disabled" });
		await history.getByRole("button", { name: /^Topic 1\b/ }).click();
		await expect(history).toHaveCount(0);
		await expect(inspector.getByText("Topic 1", { exact: true })).toBeVisible();
		await side.evaluate((node, png) => {
			const bytes = Uint8Array.from(atob(png), char => char.charCodeAt(0));
			const clipboard = new DataTransfer();
			clipboard.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
			node.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard }));
		}, PNG);
		await expect(inspector.locator("[data-btw-attachments] img")).toBeVisible();
		await page.screenshot({ path: "test-results/feedback-btw-image.png", animations: "disabled" });
		await side.fill("What is in this image?");
		await side.press("Enter");
		await expect(inspector.locator("[data-btw-attachments]")).toHaveCount(0);
		await expect(
			inspector.getByRole("button", { name: vi["input.attachmentAlt"].replace("{index}", "1"), exact: true }),
		).toBeVisible();
		const commands = (await readFile(record, "utf8"))
			.trim()
			.split("\n")
			.map(line => JSON.parse(line));
		const imageQuestion = commands.findLast(command => command.type === "btw");
		expect(imageQuestion).toMatchObject({
			recordId: "btw-1",
			question: "What is in this image?",
			images: [{ type: "image", mimeType: "image/png", data: PNG }],
		});
		expect(commands.filter(command => command.type === "prompt")).toEqual([]);
		await expect(composer).toHaveValue("Keep this unsent draft.");
		await page.evaluate(() => window.omp.prefs.set("themeName", "light"));
		await page.reload();
		await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
		await expect(page.locator(".omp-composer-model-material")).toBeVisible();
		await expectMonochromeLogo();
		await page.screenshot({ path: "test-results/feedback-composer-light.png", animations: "disabled" });
		expect(errors).toEqual([]);

		// Trigger the watcher without changing source contents or a user draft.
		const watched = resolve("src/main/agent-notch.ts");
		const source = await stat(watched);
		await utimes(watched, source.atime, new Date());
		const after = await connect(1);
		await expect.poll(async () => (await after.evaluate(() => window.omp.notch.getState())).error).toBeNull();
		await expect.poll(async () => after.evaluate(() => window.omp.wallpaper.get())).toBeNull();
	} finally {
		try {
			for (const client of clients) if (client.isConnected()) await client.close();
			if (dev.exitCode === null) await exec("bun", ["run", "dev", "--stop"], { env, timeout: 15_000 });
			await exited;
		} finally {
			await test.info().attach("dev output", { body: output, contentType: "text/plain" });
			await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
		}
	}
});
