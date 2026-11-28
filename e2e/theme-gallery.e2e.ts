import { once } from "node:events";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";

test("theme gallery separates schemes, keeps global search and persists keyboard choices", async () => {
	const profile = await fs.mkdtemp(path.join(os.tmpdir(), "wisa-theme-gallery-"));
	const userData = path.join(profile, "appData", "wisa-studio-dev");
	await fs.mkdir(userData, { recursive: true });
	await fs.writeFile(
		path.join(userData, "prefs.json"),
		JSON.stringify({ language: "en", firstRunComplete: true, themeName: "dark", theme: "dark" }),
	);
	const env = {
		...process.env,
		WISA_PROFILE_ROOT: profile,
		OMP_SIDECAR: "source",
		OMP_SIDECAR_CLI: path.resolve("e2e/sidecar-fixture.ts"),
		OMP_BUNDLED_OMP: path.resolve(process.platform === "win32" ? "resources/omp.exe" : "resources/omp"),
	};
	Reflect.deleteProperty(env, "ELECTRON_RUN_AS_NODE");
	const app = await electron.launch({ args: [path.resolve("out/main/index.js")], env });
	try {
		const page = await app.firstWindow();
		const errors: string[] = [];
		page.on("pageerror", error => errors.push(error.message));
		await expect.poll(async () => (await page.evaluate(() => window.omp.sidecar.getStatus())).status).toBe("ready");
		await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 900));
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.getByRole("button", { name: "Choose theme", exact: true }).click();
		const dialog = page.getByRole("dialog", { name: "Choose theme", exact: true });
		const cards = dialog.locator("[data-theme-choice]");
		const dark = dialog.getByRole("tab", { name: /^Dark/ });
		const light = dialog.getByRole("tab", { name: /^Light/ });
		await expect(dark).toHaveAttribute("aria-selected", "true");
		await expect(dialog.getByRole("button", { name: "WISA Dark", exact: true })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(dialog.getByRole("button", { name: "WISA Light", exact: true })).toHaveCount(0);
		await expect
			.poll(() =>
				dialog
					.locator("[data-theme-grid]")
					.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(" ").length),
			)
			.toBe(3);
		await page.screenshot({ path: "test-results/theme-gallery-dark.png" });

		await light.click();
		await expect(dialog.getByRole("button", { name: "WISA Light", exact: true })).toBeVisible();
		await expect(dialog.getByRole("button", { name: "WISA Dark", exact: true })).toHaveCount(0);
		await page.screenshot({ path: "test-results/theme-gallery-light.png" });
		await cards.first().focus();
		await cards.first().press("ArrowRight");
		await expect(cards.nth(1)).toBeFocused();
		await cards.nth(1).press("ArrowDown");
		await expect(cards.nth(4)).toBeFocused();
		await dialog.getByRole("button", { name: "WISA Light", exact: true }).press("Enter");
		await expect(dialog).toHaveCount(0);
		await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
		await expect.poll(() => page.evaluate(() => window.omp.prefs.get("themeName"))).toBe("light");

		await page.getByRole("button", { name: "Choose theme", exact: true }).click();
		await expect(light).toHaveAttribute("aria-selected", "true");
		await expect(dialog.getByRole("button", { name: "WISA Light", exact: true })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		const search = dialog.getByRole("textbox", { name: "Search themes…", exact: true });
		await search.fill("Slate");
		await expect(dialog.getByRole("button", { name: "Slate", exact: true })).toBeVisible();
		await search.press("ArrowDown");
		await expect(dialog.getByRole("button", { name: "Slate", exact: true })).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(dialog).toHaveCount(0);
		await expect.poll(() => page.evaluate(() => window.omp.prefs.get("themeName"))).toBe("titanium");

		const saved = await page.evaluate(() =>
			window.omp.themes.save({ theme: { name: "Gallery custom", extends: "light", tokens: { accent: "#604020" } } }),
		);
		expect(saved.ok).toBe(true);
		await page.getByRole("button", { name: "Choose theme", exact: true }).click();
		await light.click();
		await expect(dialog.getByRole("button", { name: "Edit Gallery custom", exact: true })).toBeVisible();
		await dialog.getByRole("button", { name: "Gallery custom", exact: true }).click();
		await expect(dialog).toHaveCount(0);
		await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
		await page.getByRole("button", { name: "Choose theme", exact: true }).click();
		await expect(light).toHaveAttribute("aria-selected", "true");
		await expect(dialog.getByRole("button", { name: "Gallery custom", exact: true })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await dialog.getByRole("button", { name: "Edit Gallery custom", exact: true }).click();
		const editor = page.getByRole("dialog", { name: "Edit theme", exact: true });
		await expect(editor).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(editor).toHaveCount(0);

		await expect(dialog).toBeVisible();
		await app.evaluate(({ BrowserWindow }) => {
			const window = BrowserWindow.getAllWindows()[0];
			window.setMinimumSize(0, 0);
			window.setContentSize(600, 700);
		});
		await expect
			.poll(() =>
				dialog
					.locator("[data-theme-grid]")
					.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(" ").length),
			)
			.toBe(2);
		await expect(dialog.getByRole("button", { name: "New theme", exact: true })).toBeInViewport({ ratio: 1 });
		await expect(dialog.getByRole("button", { name: "Open folder", exact: true })).toBeInViewport({ ratio: 1 });
		await expect.poll(() => dialog.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
		await page.screenshot({ path: "test-results/theme-gallery-compact.png" });
		await light.focus();
		await light.press("ArrowLeft");
		await expect(dark).toHaveAttribute("aria-selected", "true");
		await expect(dark).toBeFocused();
		await dialog.getByRole("button", { name: "System", exact: true }).click();
		await expect(dialog).toHaveCount(0);
		await expect.poll(() => page.evaluate(() => window.omp.prefs.get("themeName"))).toBe("system");
		await page.getByRole("button", { name: "Choose theme", exact: true }).click();
		await expect(dialog.getByRole("button", { name: "System", exact: true })).toHaveAttribute("aria-pressed", "true");
		expect(errors).toEqual([]);
	} finally {
		const exited = once(app.process(), "exit");
		await app.evaluate(({ app }) => app.exit(0));
		await exited;
		await fs.rm(profile, { recursive: true, force: true });
	}
});
