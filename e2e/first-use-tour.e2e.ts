import { once } from "node:events";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import { vi } from "../src/renderer/locales/vi";

test("tour highlights real features, preserves the session and fits a small window", async () => {
	const profile = await fs.mkdtemp(path.join(os.tmpdir(), "wisa-tour-"));
	const userData = path.join(profile, "appData", "wisa-studio-dev");
	const record = path.join(profile, "rpc.jsonl");
	await fs.mkdir(userData, { recursive: true });
	await fs.writeFile(
		path.join(userData, "prefs.json"),
		JSON.stringify({ language: "vi", firstRunComplete: true, "onboarding.tutorialCompleted.v1": true }),
	);
	const env = {
		...process.env,
		WISA_PROFILE_ROOT: profile,
		OMP_SIDECAR: "source",
		OMP_SIDECAR_CLI: path.resolve("e2e/sidecar-fixture.ts"),
		OMP_BUNDLED_OMP: path.resolve("resources/omp"),
		OMP_GUI_TEST_JEV: "1",
		OMP_GUI_TEST_RECORD: record,
	};
	Reflect.deleteProperty(env, "ELECTRON_RUN_AS_NODE");
	const app = await electron.launch({ args: [path.resolve("out/main/index.js")], env });
	try {
		const page = await app.firstWindow();
		const errors: string[] = [];
		page.on("pageerror", error => errors.push(error.message));
		await page.emulateMedia({ reducedMotion: "reduce" });
		await expect.poll(async () => (await page.evaluate(() => window.omp.sidecar.getStatus())).status).toBe("ready");
		await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 900));
		const composer = page.locator(".omp-composer-box textarea");
		await expect(composer).toBeVisible();
		await composer.fill("Keep this unsent draft.");
		await page.keyboard.press("Meta+k");
		await page.locator("[data-palette-index]").filter({ hasText: vi["tutorial.title"] }).click();
		const tour = page.locator(".omp-first-use-tour");
		await expect(tour).toBeVisible();
		const start = (await fs.readFile(record, "utf8")).trim().split("\n").length;
		const steps = [
			"sidebar",
			"workspace",
			"tabs",
			"model",
			"providers",
			"thinking",
			"compose",
			"commands",
			"attachments",
			"approvals",
			"context",
			"compact",
			"skills",
			"memory",
			"modes",
			"goal",
			"loop",
			"roles",
			"typesafe",
			"tools",
			"inspector",
			"settings",
			"wallpaper",
			"help",
		];
		for (const id of steps) {
			const card = tour.locator(`[data-tour-card="${id}"]`);
			await expect(card).toBeVisible();
			await expect(card).toHaveCSS("background-color", /^rgb\(/);
			await expect(tour.locator("[data-tour-spotlight]")).toBeAttached();
			await expect(card.getByText(vi["tutorial.targetUnavailable"], { exact: true })).toHaveCount(0);
			await expect.poll(() => card.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
			if (["sidebar", "model", "skills", "goal", "loop", "typesafe"].includes(id))
				await page.screenshot({ path: test.info().outputPath(`tour-${id}.png`), animations: "disabled" });
			if (id !== "help") await tour.getByRole("button", { name: vi["tutorial.next"], exact: true }).click();
		}
		await tour.getByRole("button", { name: vi["tutorial.contents"], exact: true }).click();
		await tour
			.getByRole("navigation")
			.getByRole("button", { name: new RegExp(vi["tutorial.typesafe.title"]) })
			.click();
		await expect(tour.locator('[data-tour-card="typesafe"]')).toBeVisible();
		await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(800, 600));
		const card = tour.locator("[data-tour-card]");
		await expect
			.poll(() =>
				card.evaluate(
					node =>
						node.getBoundingClientRect().right <= window.innerWidth &&
						node.getBoundingClientRect().bottom <= window.innerHeight,
				),
			)
			.toBe(true);
		await expect(tour.getByRole("button", { name: vi["tutorial.next"], exact: true })).toBeInViewport();
		await page.screenshot({ path: test.info().outputPath("tour-small.png"), animations: "disabled" });
		await page.keyboard.press("Escape");
		await expect(tour).toHaveCount(0);
		await expect(composer).toHaveValue("Keep this unsent draft.");
		await expect(composer).toBeEditable();
		await composer.fill("/tutorial");
		await composer.press("Enter");
		// The first Enter accepts the slash completion; the second submits it.
		await composer.press("Enter");
		await expect(tour).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(tour).toHaveCount(0);
		const commands = (await fs.readFile(record, "utf8"))
			.trim()
			.split("\n")
			.slice(start)
			.map(line => JSON.parse(line) as { type: string });
		expect(commands.filter(command => /^(set_|prompt$|compact$|new_session$|login$)/.test(command.type))).toEqual([]);
		expect(errors).toEqual([]);
	} finally {
		const exited = once(app.process(), "exit");
		await app.evaluate(({ app }) => app.exit(0));
		await exited;
		await fs.rm(profile, { recursive: true, force: true });
	}
});
