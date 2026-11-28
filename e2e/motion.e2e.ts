import { once } from "node:events";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";

for (const reducedMotion of ["no-preference", "reduce"] as const) {
	test(`surface motion survives interruption and respects reduced motion (${reducedMotion})`, async () => {
		const profile = await fs.mkdtemp(path.join(os.tmpdir(), "wisa-motion-"));
		const userData = path.join(profile, "appData", "wisa-studio-dev");
		await fs.mkdir(userData, { recursive: true });
		await fs.writeFile(path.join(userData, "prefs.json"), JSON.stringify({ language: "en", firstRunComplete: true }));
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
			await page.emulateMedia({ reducedMotion });
			await expect
				.poll(async () => (await page.evaluate(() => window.omp.sidecar.getStatus())).status)
				.toBe("ready");
			await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 900));
			const trigger = page.locator("[data-session-controls-trigger]");
			const panel = page.locator(".omp-session-controls");
			await page.locator(".omp-composer-box textarea").fill("Draft survives motion");
			await trigger.click();
			await expect(panel).toHaveAttribute("data-motion", "idle");
			const resting = await panel.boundingBox();
			expect(resting).not.toBeNull();
			const mark = panel.locator(".omp-glide--underline");
			await expect(mark).toBeVisible();
			for (const name of ["Loop", "Goal"]) {
				const tab = panel.getByRole("tab", { name, exact: true });
				await tab.click();
				await expect
					.poll(async () => {
						const target = await tab.boundingBox();
						const selection = await mark.boundingBox();
						return Boolean(
							target &&
								selection &&
								Math.abs(target.x - selection.x) < 1 &&
								Math.abs(target.width - selection.width) < 1,
						);
					})
					.toBe(true);
			}

			if (reducedMotion === "no-preference") {
				// Do both clicks within a single renderer task/frame sequence, not
				// Playwright's actionability wait (which waits for animation to finish).
				const interrupted = await page.evaluate(async () => {
					const trigger = document.querySelector<HTMLButtonElement>("[data-session-controls-trigger]")!;
					trigger.click();
					await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
					const panel = document.querySelector<HTMLElement>(".omp-session-controls")!;
					const inert = panel.inert;
					await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
					const faded = Number(getComputedStyle(panel).opacity);
					trigger.click();
					return { inert, faded };
				});
				expect(interrupted.inert).toBe(true);
				expect(interrupted.faded).toBeLessThan(1);
				expect(interrupted.faded).toBeGreaterThan(0);
				await expect(panel).toHaveAttribute("data-motion", "idle");
				await expect(panel).not.toHaveAttribute("inert");
				expect((await panel.boundingBox())!.x).toBeCloseTo(resting!.x, 0);
				await page.screenshot({ path: "test-results/motion-reopened.png" });

				// Change the OS preference while another entrance is in flight.
				await trigger.click();
				await expect(panel).toHaveCount(0);
				await trigger.dispatchEvent("click");
				await page.emulateMedia({ reducedMotion: "reduce" });
				await expect(panel).toHaveAttribute("data-motion", "idle");
				expect(await panel.evaluate(node => getComputedStyle(node).transform)).toBe("none");
			}

			await trigger.click();
			await expect(panel).toHaveCount(0);
			await expect(trigger).toBeFocused();
			await expect(page.locator(".omp-composer-box textarea")).toHaveValue("Draft survives motion");
			await trigger.click();
			await expect(panel).toHaveAttribute("data-motion", "idle");
			expect(await panel.evaluate(node => getComputedStyle(node).opacity)).toBe("1");
			await page.screenshot({ path: `test-results/motion-${reducedMotion}.png` });
			await page.getByRole("button", { name: "Settings", exact: true }).click();
			const settings = page.getByRole("dialog", { name: "Settings", exact: true });
			await expect(settings).toHaveAttribute("data-motion", "idle");
			await settings.getByRole("navigation").getByRole("button", { name: "Model", exact: true }).click();
			await expect(settings.getByRole("heading", { name: "Model", exact: true })).toBeVisible();
			await expect(settings.locator(".settings-scroll > .settings-page-frame")).toHaveAttribute(
				"data-motion",
				"idle",
			);
			await page.screenshot({ path: `test-results/motion-settings-${reducedMotion}.png` });
			await page.keyboard.press("Escape");
			await expect(settings).toHaveCount(0);
			expect(errors).toEqual([]);
		} finally {
			const exited = once(app.process(), "exit");
			await app.evaluate(({ app }) => app.exit(0));
			await exited;
			await fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
		}
	});
}
