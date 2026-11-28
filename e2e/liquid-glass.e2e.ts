import { once } from "node:events";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";

for (const theme of ["dark", "light"] as const) {
	test(`Liquid Glass remains readable and keyboard-accessible in ${theme} mode`, async () => {
		const profile = await fs.mkdtemp(path.join(os.tmpdir(), "wisa-liquid-glass-"));
		const userData = path.join(profile, "appData", "wisa-studio-dev");
		await fs.mkdir(userData, { recursive: true });
		await fs.writeFile(
			path.join(userData, "prefs.json"),
			JSON.stringify({ language: "en", firstRunComplete: true, themeName: theme, theme }),
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
			await expect
				.poll(async () => (await page.evaluate(() => window.omp.sidecar.getStatus())).status)
				.toBe("ready");
			await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
			await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 900));
			await page.emulateMedia({ reducedMotion: "no-preference" });

			const composer = page.locator(".omp-composer-box");
			await expect(composer).toBeVisible();
			await expect(composer).not.toHaveCSS("backdrop-filter", "none");
			await expect(composer.locator('[aria-label^="Workspace:"]')).toHaveCount(0);
			await expect(composer.locator(".omp-composer-model svg[data-brand]")).toBeVisible();
			const reasoning = composer.getByTitle("Thinking: Medium - click to change", { exact: true });
			await reasoning.click();
			const reasoningPanel = page.getByRole("dialog", { name: "Reasoning", exact: true });
			const range = reasoningPanel.getByRole("slider", { name: "Reasoning", exact: true });
			await expect(range).toBeFocused();
			await expect(reasoningPanel).not.toHaveCSS("backdrop-filter", "none");
			await range.press("End");
			await expect(range).toHaveAttribute("aria-valuetext", "High");
			await expect(composer.getByTitle("Thinking: High - click to change", { exact: true })).toBeVisible();
			await expect(range).toBeEnabled();
			const track = await range.boundingBox();
			if (!track) throw new Error("Missing reasoning track");
			await page.mouse.move(track.x + track.width - 12, track.y + track.height / 2);
			await page.mouse.down();
			await page.mouse.move(track.x + 12, track.y + track.height / 2, { steps: 5 });
			await page.mouse.up();
			await expect(range).toHaveAttribute("aria-valuetext", "Low");
			await expect(composer.getByTitle("Thinking: Low - click to change", { exact: true })).toBeVisible();
			await page.screenshot({ path: `test-results/liquid-glass-${theme}-reasoning.png`, animations: "disabled" });
			await range.press("Escape");
			await expect(reasoningPanel).toHaveCount(0);
			// Measure the welcome group against the actual free transcript area,
			// not the window (the composer and chrome occupy their own space).
			for (const [width, height] of [
				[1280, 900],
				[1000, 720],
			] as const) {
				await app.evaluate(
					({ BrowserWindow }, size) => {
						BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height);
					},
					{ width, height },
				);
				const transcript = page.locator(".omp-transcript-scroll");
				await expect(transcript.locator(".omp-empty-content")).toBeVisible();
				await expect(transcript.locator(".omp-starter-card, .omp-starter-grid, .omp-card")).toHaveCount(0);
				await expect
					.poll(() =>
						transcript.evaluate(node => {
							const group = node.querySelector(".omp-empty-content");
							if (!group) return Number.POSITIVE_INFINITY;
							const area = node.getBoundingClientRect();
							const content = group.getBoundingClientRect();
							return Math.max(
								Math.abs(content.x + content.width / 2 - (area.x + area.width / 2)),
								Math.abs(content.y + content.height / 2 - (area.y + area.height / 2)),
							);
						}),
					)
					.toBeLessThanOrEqual(2);
				const geometry = await transcript.evaluate(node => ({
					width: node.clientWidth,
					scrollWidth: node.scrollWidth,
					height: node.clientHeight,
					scrollHeight: node.scrollHeight,
				}));
				expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1);
				expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.height + 1);
				const toolbar = page.locator(".omp-composer-toolbar");
				await expect
					.poll(() => toolbar.evaluate(node => node.scrollWidth - node.clientWidth))
					.toBeLessThanOrEqual(1);
				const transcriptBox = await transcript.boundingBox();
				const composerBox = await composer.boundingBox();
				expect(transcriptBox).not.toBeNull();
				expect(composerBox).not.toBeNull();
				if (transcriptBox && composerBox) {
					expect(transcriptBox.y + transcriptBox.height).toBeLessThanOrEqual(composerBox.y + 1);
				}
				await page.screenshot({
					path: `test-results/liquid-glass-${theme}-empty-${width}x${height}.png`,
					animations: "disabled",
				});
			}
			await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 900));
			const contextStrategy = page.getByRole("button", {
				name: "Context strategy: what happens when this model's context fills",
				exact: true,
			});
			await expect(contextStrategy).toContainText("at 108.8k");
			await contextStrategy.click();
			const contextSettings = page.getByRole("dialog", {
				name: "Context strategy: what happens when this model's context fills",
				exact: true,
			});
			await expect(contextSettings).toBeVisible();
			await expect(contextSettings.getByRole("radio", { name: "Balanced", exact: false })).toBeChecked();
			await expect(contextSettings.getByRole("radio", { name: "Auto", exact: true })).toBeChecked();
			await contextSettings.getByRole("radio", { name: "80%", exact: true }).click();
			await expect(contextStrategy).toContainText("at 102.4k");
			await contextSettings.getByRole("radio", { name: "Auto", exact: true }).click();
			await expect(contextStrategy).toContainText("at 108.8k");
			const contextBox = await contextSettings.boundingBox();
			expect(contextBox).not.toBeNull();
			if (contextBox) {
				expect(contextBox.y).toBeGreaterThanOrEqual(12);
				expect(contextBox.y + contextBox.height).toBeLessThanOrEqual(900);
			}
			await page.screenshot({
				path: `test-results/liquid-glass-${theme}-context-strategy.png`,
				animations: "disabled",
			});
			await contextSettings
				.getByRole("button", { name: "All compaction settings", exact: true })
				.scrollIntoViewIfNeeded();
			await page.keyboard.press("Escape");
			await expect(contextSettings).toHaveCount(0);
			const draft = composer.locator("textarea");
			await draft.fill("Liquid Glass keyboard draft");
			await expect(draft).toBeFocused();
			await expect(draft).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
			await expect(page.getByRole("button", { name: "Send (Enter)", exact: true })).toBeEnabled();

			await page.getByRole("button", { name: "Right sidebar", exact: true }).click();
			await expect(page.locator(".omp-inspector")).toBeVisible();
			const frames = await page.evaluate(async () => {
				const intervals: number[] = [];
				let previous = await new Promise<number>(resolve => requestAnimationFrame(resolve));
				for (let i = 0; i < 24; i++) {
					const current = await new Promise<number>(resolve => requestAnimationFrame(resolve));
					intervals.push(current - previous);
					previous = current;
				}
				intervals.sort((a, b) => a - b);
				return { medianMs: intervals[12], p95Ms: intervals[22] };
			});
			console.log(`Liquid Glass ${theme} idle frame intervals: ${JSON.stringify(frames)}`);
			await page.screenshot({ path: `test-results/liquid-glass-${theme}-workspace.png`, animations: "disabled" });
			// The sidebar must react locally, not just inherit the canvas gradient.
			const navigation = page.getByRole("button", { name: /^Commands(?:\s|$)/ });
			await page.mouse.move(10, 10);
			await expect(navigation).not.toHaveCSS("background-image", "none");
			await expect(navigation).not.toHaveCSS("box-shadow", "none");
			const restingGlass = await navigation.evaluate(node => getComputedStyle(node).backgroundImage);
			await navigation.hover({ position: { x: 12, y: 8 } });
			await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
			await expect
				.poll(() => navigation.evaluate(node => getComputedStyle(node).backgroundImage))
				.not.toBe(restingGlass);
			const leftLight = await navigation.evaluate(node => getComputedStyle(node).backgroundImage);
			await navigation.hover({ position: { x: 150, y: 24 } });
			await expect
				.poll(() => navigation.evaluate(node => getComputedStyle(node).backgroundImage))
				.not.toBe(leftLight);
			await page.screenshot({ path: `test-results/liquid-glass-${theme}-navigation.png`, animations: "disabled" });
			await page.getByRole("button", { name: /^Commands(?:\s|$)/ }).click();
			const palette = page.getByRole("dialog", { name: "Search commands", exact: true });
			await expect(palette).toBeVisible();
			await expect(palette).not.toHaveCSS("backdrop-filter", "none");
			await expect(page.locator(".omp-dialog-overlay")).toHaveCSS("backdrop-filter", "none");
			const search = palette.getByRole("textbox", { name: "Search commands", exact: true });
			await expect(search).toBeFocused();
			await search.fill("theme");
			await page.screenshot({ path: `test-results/liquid-glass-${theme}-palette.png`, animations: "disabled" });
			await search.press("Escape");
			await expect(palette).toHaveCount(0);
			await expect(draft).toHaveValue("Liquid Glass keyboard draft");

			await navigation.click();
			await expect(palette).toBeVisible();
			await search.fill("Model Roles");
			await palette.locator('button[data-command-name="model-roles"]').click();
			const assignments = page.getByRole("region", { name: "Model Roles", exact: true });
			const ghost = assignments.getByRole("button", { name: "Refresh", exact: true });
			await ghost.hover();
			await page.mouse.down();
			await expect(ghost).toHaveCSS("scale", "0.975");
			await page.screenshot({ path: `test-results/liquid-glass-${theme}-pressed.png`, animations: "disabled" });
			await page.mouse.move(10, 10);
			await page.mouse.up();
			await ghost.focus();
			await expect(ghost).toBeFocused();
			await page.emulateMedia({ reducedMotion: "reduce" });
			await expect(ghost).toHaveCSS("scale", "none");
			await ghost.hover({ position: { x: 5, y: 5 } });
			await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
			const stationaryLight = await ghost.evaluate(node => getComputedStyle(node).backgroundImage);
			await ghost.hover({ position: { x: 40, y: 15 } });
			await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
			expect(await ghost.evaluate(node => getComputedStyle(node).backgroundImage)).toBe(stationaryLight);
			await assignments.getByRole("button", { name: "Back to chat", exact: true }).click();
			await expect(draft).toHaveValue("Liquid Glass keyboard draft");

			await page.getByRole("button", { name: "Settings", exact: true }).click();
			const settings = page.locator(".omp-settings-window");
			await expect(settings).toBeVisible();
			await expect(settings.locator(".settings-sidebar")).toBeVisible();
			const backToChat = settings.getByRole("button", { name: "Back to chat", exact: true });
			await expect(backToChat).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
			await expect(backToChat).not.toHaveCSS("background-image", "none");
			await expect(backToChat).not.toHaveCSS("box-shadow", "none");
			await expect
				.poll(() =>
					settings.locator(".settings-nav-item").evaluateAll(nodes => {
						const bounds = nodes.map(node => node.getBoundingClientRect());
						return Math.min(...bounds.slice(1).map((box, index) => box.top - bounds[index].bottom));
					}),
				)
				.toBeGreaterThanOrEqual(6);
			await expect(settings).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
			// Settings form sections are real shared material cards; the welcome
			// canvas deliberately no longer supplies interactive sample cards.
			const card = settings.locator(".settings-form-measure > section").first();
			await expect(card).toBeVisible();
			await card.hover({ position: { x: 20, y: 20 } });
			await expect(card).toHaveCSS("border-radius", "20px");
			await expect(card).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
			await page.screenshot({ path: `test-results/liquid-glass-${theme}-cards.png`, animations: "disabled" });
			await page.screenshot({ path: `test-results/liquid-glass-${theme}-settings.png`, animations: "disabled" });
			await settings.getByRole("button", { name: "Back to chat", exact: true }).click();
			await expect(settings).toHaveCount(0);
			await expect(draft).toHaveValue("Liquid Glass keyboard draft");

			const cdp = await page.context().newCDPSession(page);
			await cdp.send("Emulation.setEmulatedMedia", {
				features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
			});
			await expect(composer).toHaveCSS("backdrop-filter", "none");
			expect(
				await composer.evaluate(node => {
					const canvas = document.createElement("canvas");
					canvas.width = canvas.height = 1;
					const context = canvas.getContext("2d");
					if (!context) throw new Error("Canvas unavailable");
					context.fillStyle = getComputedStyle(node).backgroundColor;
					context.fillRect(0, 0, 1, 1);
					return context.getImageData(0, 0, 1, 1).data[3];
				}),
			).toBe(255);
			await page.screenshot({ path: `test-results/liquid-glass-${theme}-opaque.png`, animations: "disabled" });
			await cdp.send("Emulation.setEmulatedMedia", {
				features: [{ name: "forced-colors", value: "active" }],
			});
			await expect(composer).toHaveCSS("backdrop-filter", "none");
			await expect(draft).toBeEditable();
			await cdp.send("Emulation.setEmulatedMedia", { features: [] });
			await cdp.detach();
			await expect(composer).not.toHaveCSS("backdrop-filter", "none");
			expect(errors).toEqual([]);
		} finally {
			const exited = once(app.process(), "exit");
			await app.evaluate(({ app }) => app.exit(0));
			await exited;
			await fs.rm(profile, { recursive: true, force: true });
		}
	});
}
