import { once } from "node:events";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import { vi } from "../src/renderer/locales/vi";

async function checkComposerOverviewLayout(modelName: string): Promise<void> {
	const profile = await fs.mkdtemp(path.join(os.tmpdir(), "wisa-composer-overview-"));
	const userData = path.join(profile, "appData", "wisa-studio-dev");
	await fs.mkdir(userData, { recursive: true });
	await fs.writeFile(path.join(userData, "prefs.json"), JSON.stringify({ language: "vi", firstRunComplete: true }));
	const env = {
		...process.env,
		WISA_PROFILE_ROOT: profile,
		OMP_SIDECAR: "source",
		OMP_SIDECAR_CLI: path.resolve("e2e/sidecar-fixture.ts"),
		OMP_BUNDLED_OMP: path.resolve(process.platform === "win32" ? "resources/omp.exe" : "resources/omp"),
		OMP_GUI_TEST_MODEL_NAME: modelName,
	};
	Reflect.deleteProperty(env, "ELECTRON_RUN_AS_NODE");
	const app = await electron.launch({ args: [path.resolve("out/main/index.js")], env });
	try {
		const page = await app.firstWindow();
		const errors: string[] = [];
		page.on("pageerror", error => errors.push(error.message));
		await expect.poll(async () => (await page.evaluate(() => window.omp.sidecar.getStatus())).status).toBe("ready");
		await page.emulateMedia({ reducedMotion: "reduce" });
		await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 900));
		const model = page.locator("[data-model-picker-trigger]");
		if (modelName === "Claude Fable 5.2") {
			await expect(model).toHaveAttribute("aria-label", `${vi["input.model"]}: ${modelName}`);
			await expect
				.poll(() =>
					model.locator(".omp-composer-model-label").evaluate(node => {
						const text = node.querySelector("bdi");
						if (!text) throw new Error("Model label is missing");
						return Math.abs(node.getBoundingClientRect().width - text.getBoundingClientRect().width);
					}),
				)
				.toBeLessThanOrEqual(1);
			await page.screenshot({ path: "test-results/composer-short-model.png", animations: "disabled" });
		}
		await page.getByRole("button", { name: vi["titlebar.togglePanel"], exact: true }).click();
		const inspector = page.locator(".omp-inspector");
		await inspector.getByRole("button", { name: vi["panel.tabs.overview"], exact: true }).click();
		const overview = inspector.locator(".omp-overview-scroll");
		await expect(inspector.getByRole("progressbar")).toBeVisible();
		await expect(inspector.getByText(vi["overview.servers.none"], { exact: true })).toBeVisible();
		await expect.poll(() => overview.evaluate(node => node.scrollHeight - node.clientHeight)).toBeLessThanOrEqual(1);
		await expect(
			inspector.getByRole("button", { name: vi["overview.servers.manage"], exact: true }),
		).toBeInViewport();
		await page.screenshot({ path: "test-results/composer-overview-1280.png", animations: "disabled" });

		const divider = inspector.getByRole("separator");
		await divider.press("End");
		await expect
			.poll(() =>
				inspector
					.locator(".omp-overview-grid")
					.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(" ").length),
			)
			.toBe(2);
		await expect.poll(() => overview.evaluate(node => node.scrollHeight - node.clientHeight)).toBeLessThanOrEqual(1);
		await page.screenshot({ path: "test-results/overview-wide.png", animations: "disabled" });

		await divider.press("Home");
		await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(800, 560));
		await expect.poll(() => overview.evaluate(node => node.scrollHeight - node.clientHeight)).toBeGreaterThan(0);
		await overview.evaluate(node => {
			node.scrollTop = node.scrollHeight;
		});
		await expect(
			inspector.getByRole("button", { name: vi["overview.servers.manage"], exact: true }),
		).toBeInViewport();
		await expect.poll(() => overview.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
		await page.screenshot({ path: "test-results/overview-short.png", animations: "disabled" });
		await page.getByRole("button", { name: vi["titlebar.togglePanel"], exact: true }).click();

		await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(600, 700));
		const composer = page.locator(".omp-composer-box textarea");
		await expect(composer).toHaveAttribute("placeholder", vi["input.placeholder.work"]);
		await expect.poll(() => composer.evaluate(node => node.scrollHeight - node.clientHeight)).toBeLessThanOrEqual(1);
		await expect(page.getByRole("button", { name: vi["input.plan.title"], exact: true })).toHaveCount(0);
		await expect(page.locator("[data-session-controls-trigger]")).toHaveText(vi["input.modes.label"]);
		await expect(model).toHaveAttribute("aria-label", `${vi["input.model"]}: ${modelName}`);
		if (modelName.startsWith("WISA ")) {
			await expect
				.poll(() =>
					model.locator(".omp-composer-model-label").evaluate(node => {
						const text = node.querySelector("bdi")?.firstChild;
						if (!text) return false;
						const range = document.createRange();
						const end = text.textContent?.length ?? 0;
						range.setStart(text, end - "Sonnet 5.5".length);
						range.setEnd(text, end);
						const suffix = range.getBoundingClientRect();
						const clip = node.getBoundingClientRect();
						return (
							node.scrollWidth > node.clientWidth && suffix.left >= clip.left && suffix.right <= clip.right + 1
						);
					}),
				)
				.toBe(true);
		}
		await page.screenshot({
			path: `test-results/composer-compact-${modelName.startsWith("WISA ") ? "long" : "short"}.png`,
			animations: "disabled",
		});
		await composer.fill("verylongtoken".repeat(40));
		await expect.poll(() => composer.evaluate(node => node.clientHeight)).toBeGreaterThan(44);
		await expect.poll(() => composer.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
		await composer.fill("First line\nSecond line");
		await expect(composer).toHaveValue("First line\nSecond line");
		expect(errors).toEqual([]);
	} finally {
		const exited = once(app.process(), "exit");
		await app.evaluate(({ app }) => app.exit(0));
		await exited;
		await fs.rm(profile, { recursive: true, force: true });
	}
}

for (const modelName of ["Claude Fable 5.2", "WISA Custom Provider Experimental Preview Claude Sonnet 5.5"]) {
	test(`overview and compact composer preserve content with ${modelName}`, async () => {
		await checkComposerOverviewLayout(modelName);
	});
}
