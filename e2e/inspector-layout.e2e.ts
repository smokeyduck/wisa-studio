import { once } from "node:events";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";

// Geometry is checked in Electron: DOM-only tests cannot prove chat is not covered.
test("right sidebar docks in a wide single chat and overlays narrow or split panes", async () => {
	const profile = await fs.mkdtemp(path.join(os.tmpdir(), "wisa-inspector-layout-"));
	const userData = path.join(profile, "appData", "wisa-studio-dev");
	const project = path.join(profile, "project");
	await fs.mkdir(userData, { recursive: true });
	await fs.mkdir(project);
	await fs.writeFile(path.join(userData, "prefs.json"), JSON.stringify({ language: "en", firstRunComplete: true }));
	const env = {
		...process.env,
		WISA_PROFILE_ROOT: profile,
		OMP_SIDECAR: "source",
		OMP_SIDECAR_CLI: path.resolve("e2e/sidecar-fixture.ts"),
		OMP_BUNDLED_OMP: path.resolve(process.platform === "win32" ? "resources/omp.exe" : "resources/omp"),
	};
	Reflect.deleteProperty(env, "ELECTRON_RUN_AS_NODE");
	const app = await electron.launch({ args: [path.resolve("out/main/index.js"), project], env });
	try {
		const page = await app.firstWindow();
		const errors: string[] = [];
		page.on("pageerror", error => errors.push(error.message));
		await page.waitForFunction(() => window.omp?.rpc != null);
		await expect.poll(async () => (await page.evaluate(() => window.omp.sidecar.getStatus())).status).toBe("ready");
		await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 900));
		const firstTab = (await page.evaluate(() => window.omp.tabs.list()))[0].tabId;
		await page.getByRole("button", { name: "New Chat Tab", exact: true }).click();
		await expect.poll(async () => (await page.evaluate(() => window.omp.tabs.list())).length).toBe(2);
		const pane = page.locator('.omp-session-pane[data-active="true"]');
		const conversation = pane.locator(".omp-session-conversation");
		const inspector = pane.locator(".omp-inspector");
		const geometry = () =>
			pane.evaluate(node => {
				const chat = node.querySelector(".omp-session-conversation")?.getBoundingClientRect();
				const panel = node.querySelector(".omp-inspector")?.getBoundingClientRect();
				return {
					chatWidth: chat?.width ?? 0,
					chatRight: chat?.right ?? 0,
					panelLeft: panel?.left ?? 0,
					panelWidth: panel?.width ?? 0,
				};
			});
		const closedWidth = await conversation.evaluate(node => node.getBoundingClientRect().width);
		await page.getByRole("button", { name: "Right sidebar", exact: true }).click();
		await expect(inspector).toBeVisible();
		await expect(inspector).toHaveAttribute("data-layout", "docked");
		await expect
			.poll(async () => {
				const bounds = await geometry();
				return (
					bounds.chatWidth >= 560 && bounds.chatWidth < closedWidth && bounds.chatRight <= bounds.panelLeft + 1
				);
			})
			.toBe(true);
		await page.screenshot({ path: "test-results/inspector-docked.png", animations: "disabled" });
		const divider = inspector.getByRole("separator");
		await divider.focus();
		await divider.press("Home");
		await expect(divider).toHaveAttribute("aria-valuenow", "360");
		const inspectorTabs = inspector.locator("header button[aria-pressed]");
		for (const button of await inspectorTabs.all()) {
			await button.click();
			await expect(button).toHaveAttribute("aria-pressed", "true");
			await expect(button).toHaveText((await button.getAttribute("aria-label")) ?? "");
			await expect(inspector.locator('header button[aria-pressed="false"]')).toHaveText(
				Array((await inspectorTabs.count()) - 1).fill(""),
			);
			expect(await inspector.locator(":scope > header").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(
				true,
			);
		}
		await inspector.getByRole("button", { name: "Files", exact: true }).click();
		await divider.focus();
		await divider.press("ArrowLeft");
		const savedWidth = await divider.getAttribute("aria-valuenow");
		await expect.poll(() => page.evaluate(() => window.omp.prefs.get("gui.panelWidth"))).toBe(Number(savedWidth));
		await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(800, 900));
		await expect
			.poll(async () => {
				const bounds = await geometry();
				return bounds.chatWidth > 0 && bounds.chatRight > bounds.panelLeft + 100;
			})
			.toBe(true);
		expect(await page.evaluate(() => window.omp.prefs.get("gui.panelWidth"))).toBe(Number(savedWidth));
		await expect(inspector).toHaveAttribute("data-layout", "overlay");
		await expect(inspector).toHaveCSS("backdrop-filter", "none");
		await expect(inspector).toHaveCSS("background-color", /^rgb\(\d+, \d+, \d+\)$/);
		await page.screenshot({ path: "test-results/inspector-narrow.png", animations: "disabled" });
		await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 900));
		await expect
			.poll(async () => {
				const bounds = await geometry();
				return bounds.chatRight <= bounds.panelLeft + 1 && Math.abs(bounds.panelWidth - Number(savedWidth)) <= 1;
			})
			.toBe(true);
		await expect(inspector.locator("header").getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
		await page.getByRole("button", { name: "Right sidebar", exact: true }).click();
		await expect.poll(() => conversation.evaluate(node => node.getBoundingClientRect().width)).toBe(closedWidth);
		await page.locator(`[id="omp-tab-${firstTab}"]`).click({ button: "right" });
		await page.getByRole("menuitem", { name: "Split below", exact: true }).click();
		await expect(page.locator(".omp-session-pane")).toHaveCount(2);
		await pane.getByRole("button", { name: "Right sidebar", exact: true }).click();
		await expect(inspector).toBeVisible();
		await expect
			.poll(async () => {
				const bounds = await geometry();
				return bounds.chatWidth >= 920 && bounds.chatRight > bounds.panelLeft + 100;
			})
			.toBe(true);
		await expect(page.locator('.omp-session-pane[data-active="false"] .omp-inspector')).toHaveCount(0);
		await inspector.getByRole("button", { name: "Overview", exact: true }).click();
		await expect(inspector.locator(".omp-overview-scroll")).toBeVisible();
		await expect(inspector).toHaveAttribute("data-layout", "overlay");
		const platform = await page.locator("html").getAttribute("data-platform");
		for (const value of ["darwin", "win32", "linux"]) {
			await page.locator("html").evaluate((node, value) => node.setAttribute("data-platform", value), value);
			await expect(inspector).toHaveCSS("background-color", /^rgb\(\d+, \d+, \d+\)$/);
			await expect(inspector).toHaveCSS("background-image", "none");
			await expect(inspector).toHaveCSS("backdrop-filter", "none");
		}
		await page.locator("html").evaluate((node, value) => {
			if (value === null) node.removeAttribute("data-platform");
			else node.setAttribute("data-platform", value);
		}, platform);
		await page.screenshot({ path: "test-results/inspector-split.png", animations: "disabled" });
		expect(errors).toEqual([]);
	} finally {
		const exited = once(app.process(), "exit");
		await app.evaluate(({ app }) => app.exit(0));
		await exited;
		await fs.rm(profile, { recursive: true, force: true });
	}
});
