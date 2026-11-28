import { once } from "node:events";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import { en } from "../src/renderer/locales/en";
import { vi } from "../src/renderer/locales/vi";
import type { RpcCommand } from "../src/shared/rpc-types";

for (const language of ["vi", "en"] as const) {
	test(`session controls are independent and start guided goals (${language})`, async () => {
		const t = language === "vi" ? vi : en;
		const profile = await fs.mkdtemp(path.join(os.tmpdir(), "wisa-session-controls-"));
		const userData = path.join(profile, "appData", "wisa-studio-dev");
		const record = path.join(profile, "commands.jsonl");
		await fs.mkdir(userData, { recursive: true });
		await fs.writeFile(path.join(userData, "prefs.json"), JSON.stringify({ language, firstRunComplete: true }));
		const env = {
			...process.env,
			WISA_PROFILE_ROOT: profile,
			OMP_SIDECAR: "source",
			OMP_SIDECAR_CLI: path.resolve("e2e/sidecar-fixture.ts"),
			OMP_BUNDLED_OMP: path.resolve(process.platform === "win32" ? "resources/omp.exe" : "resources/omp"),
			OMP_GUI_TEST_RECORD: record,
		};
		Reflect.deleteProperty(env, "ELECTRON_RUN_AS_NODE");
		const app = await electron.launch({ args: [path.resolve("out/main/index.js")], env });
		const commands = async (): Promise<RpcCommand[]> =>
			(await fs.readFile(record, "utf8"))
				.trim()
				.split("\n")
				.map(line => JSON.parse(line) as RpcCommand);
		try {
			const page = await app.firstWindow();
			const errors: string[] = [];
			page.on("pageerror", error => errors.push(error.message));
			await expect
				.poll(async () => (await page.evaluate(() => window.omp.sidecar.getStatus())).status)
				.toBe("ready");
			await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 900));
			const trigger = page.locator("[data-session-controls-trigger]");
			const controls = page.getByRole("complementary", { name: t["modesPanel.title"], exact: true });
			const composer = page.locator(".omp-composer-box textarea");
			await composer.fill("Keep this draft");
			await expect(page.getByRole("button", { name: t["input.plan.title"], exact: true })).toHaveCount(0);
			await trigger.click();
			await controls.locator("summary").filter({ hasText: t["input.more.label"] }).click();
			await controls.getByRole("switch", { name: t["input.plan.label"], exact: true }).click();
			await expect(controls.getByRole("switch", { name: t["input.plan.label"], exact: true })).toBeChecked();
			await expect(page.getByRole("button", { name: t["input.plan.title"], exact: true })).toHaveAttribute(
				"aria-pressed",
				"true",
			);
			await controls.getByRole("button", { name: t["modesPanel.close"], exact: true }).click();
			await expect(controls).toHaveCount(0);
			await trigger.click();
			await expect(controls).toBeVisible();
			await expect(page.locator(".omp-dialog-overlay")).toHaveCount(0);
			await expect(
				controls.getByRole("button", { name: t["modesPanel.goal.guidedStart"], exact: true }),
			).toBeEnabled();
			await expect
				.poll(() =>
					page.locator(".omp-session-pane[data-active='true']").evaluate(node => {
						const chat = node.querySelector(".omp-session-conversation")!.getBoundingClientRect();
						const panel = node.querySelector(".omp-session-controls")!.getBoundingClientRect();
						return chat.width >= 560 && chat.right <= panel.left + 1;
					}),
				)
				.toBe(true);
			await page.screenshot({ path: `test-results/session-controls-${language}-goal.png`, animations: "disabled" });
			await composer.fill("Draft remains editable");
			await expect(controls).toBeVisible();
			await controls.getByRole("tab", { name: t["modesPanel.tabs.loop"], exact: true }).click();
			await controls.getByRole("switch", { name: t["modesPanel.loop.toggleLabel"], exact: true }).click();
			await expect(
				controls.getByRole("switch", { name: t["modesPanel.loop.toggleLabel"], exact: true }),
			).toBeChecked();
			await controls.getByRole("tab", { name: t["modesPanel.tabs.vibe"], exact: true }).click();
			await controls.getByRole("switch", { name: t["modesPanel.vibe.toggleLabel"], exact: true }).click();
			await expect(
				controls.getByRole("switch", { name: t["modesPanel.vibe.toggleLabel"], exact: true }),
			).toBeChecked();
			await controls.getByRole("button", { name: t["modesPanel.close"], exact: true }).click();
			await expect(controls).toHaveCount(0);
			await expect(trigger).toBeFocused();
			await page.getByRole("button", { name: t["titlebar.togglePanel"], exact: true }).click();
			const inspector = page.locator(".omp-inspector");
			await expect(inspector).toBeVisible();
			await trigger.click();
			await expect(controls).toBeVisible();
			await expect(inspector).toBeVisible();
			await expect(inspector).toHaveAttribute("data-motion", "idle");
			const inspectorBounds = await inspector.boundingBox();
			await controls.getByRole("tab", { name: t["modesPanel.tabs.goal"], exact: true }).click();
			await controls.locator("textarea").fill("Ship reliable sync");
			await controls.getByRole("button", { name: t["modesPanel.goal.guidedStart"], exact: true }).click();
			await expect(controls).toHaveCount(0);
			await expect
				.poll(async () =>
					(await commands()).some(
						command => command.type === "guided_goal" && command.initial === "Ship reliable sync",
					),
				)
				.toBe(true);
			await expect(inspector).toBeVisible();
			expect(await inspector.boundingBox()).toEqual(inspectorBounds);
			await expect(composer).toHaveValue("Draft remains editable");
			expect((await commands()).some(command => command.type === "set_goal")).toBe(false);
			await page.getByRole("button", { name: t["titlebar.togglePanel"], exact: true }).click();
			await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(800, 720));
			const compact = page.locator("[data-run-settings-overflow-trigger]");
			if (await compact.isVisible()) await compact.click();
			await trigger.click();
			await expect(controls).toBeVisible();
			await expect.poll(() => controls.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
			await page.screenshot({
				path: `test-results/session-controls-${language}-narrow.png`,
				animations: "disabled",
			});
			await controls.getByRole("button", { name: t["modesPanel.close"], exact: true }).press("Escape");
			await expect(controls).toHaveCount(0);
			expect(errors).toEqual([]);
		} finally {
			const exited = once(app.process(), "exit");
			await app.evaluate(({ app }) => app.exit(0));
			await exited;
			await fs.rm(profile, { recursive: true, force: true });
		}
	});
}
