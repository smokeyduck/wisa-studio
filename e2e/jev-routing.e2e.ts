import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import type { RpcSessionState } from "../src/shared/rpc-types";

// UI proof uses a local protocol peer and an isolated profile, never a real TypeSafe key.
for (const language of ["en", "vi"] as const) {
	test(`Model Roles connects TypeSafe and persists native Jev routing without changing chat (${language})`, async () => {
		const labels =
			language === "vi"
				? {
						page: "Vai trò mô hình",
						login: "Đăng nhập",
						apiKey: "Dùng API key",
						saveKey: "Lưu khóa",
						model: "Mô hình đánh giá",
						enable: "Bật Jev",
						disable: "Tắt Jev",
						on: "Đang bật",
						off: "Đang tắt",
						details: "Kết nối và chi tiết",
						defaultRole: "Mô hình cho Mặc định",
					}
				: {
						page: "Model Roles",
						login: "Login",
						apiKey: "Use API key",
						saveKey: "Save key",
						model: "Judge model",
						enable: "Enable Jev routing",
						disable: "Turn off routing",
						on: "Jev routing enabled",
						off: "Routing off",
						details: "Connection & details",
						defaultRole: "Model for Default",
					};
		const profile = await fs.mkdtemp(path.join(os.tmpdir(), "wisa-jev-ui-"));
		const userData = path.join(profile, "appData", "wisa-studio-dev");
		const project = path.join(profile, "project");
		await fs.mkdir(userData, { recursive: true });
		await fs.mkdir(project);
		await fs.writeFile(path.join(userData, "prefs.json"), JSON.stringify({ language, firstRunComplete: true }));
		const env = {
			...process.env,
			WISA_PROFILE_ROOT: profile,
			OMP_SIDECAR: "source",
			OMP_SIDECAR_CLI: path.resolve("e2e/sidecar-fixture.ts"),
			OMP_BUNDLED_OMP: path.resolve(process.platform === "win32" ? "resources/omp.exe" : "resources/omp"),
			OMP_GUI_TEST_JEV: "1",
		};
		Reflect.deleteProperty(env, "ELECTRON_RUN_AS_NODE");
		const app = await electron.launch({ args: [path.resolve("out/main/index.js"), project], env });
		try {
			const page = await app.firstWindow();
			const errors: string[] = [];
			page.on("pageerror", error => errors.push(error.message));
			await page.waitForFunction(() => window.omp?.rpc != null);
			await expect
				.poll(async () => (await page.evaluate(() => window.omp.sidecar.getStatus())).status)
				.toBe("ready");
			await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 900));
			const initial = await page.evaluate(() => window.omp.rpc.getState());
			const openRoles = async () => {
				await page.locator("[data-command-center-entry]").click();
				const palette = page.getByRole("dialog");
				await expect(palette).toBeVisible();
				await palette.getByRole("textbox").fill(labels.page);
				await palette.locator('button[data-command-name="model-roles"]').click();
			};
			await openRoles();
			const section = page.getByRole("region", { name: "Jev · TypeSafe", exact: true });
			await expect(section).toBeVisible();
			await expect(section.getByRole("button", { name: labels.enable, exact: true })).toBeDisabled();
			await expect(section.getByRole("button", { name: labels.login, exact: true })).toBeVisible();
			const details = section.locator("details").filter({ has: page.getByText(labels.details, { exact: true }) });
			await expect(details).not.toHaveAttribute("open");
			await page.screenshot({
				path: `test-results/jev-${language}-connect.png`,
				scale: "css",
				animations: "disabled",
			});
			await section.getByRole("button", { name: labels.apiKey, exact: true }).click();
			const dialog = page.getByRole("dialog").filter({ has: page.locator('input[type="password"]') });
			await expect(dialog).toBeVisible();
			await dialog.locator('input[type="password"]').fill("local-fixture-key");
			await dialog.getByRole("button", { name: labels.saveKey, exact: true }).click();
			await expect(dialog).toHaveCount(0);
			await expect(section.getByRole("combobox", { name: labels.model, exact: true })).toHaveValue(
				"typesafe/fixture-native-judge",
			);
			await expect(section.getByText(labels.off, { exact: true })).toBeVisible();
			await expect(details).not.toHaveAttribute("open");
			if (language === "vi") {
				for (const name of [
					"Mặc định",
					"Nhanh",
					"Suy luận",
					"Đọc ảnh",
					"Lập kế hoạch",
					"Tạo commit",
					"Tác vụ nhẹ",
					"Ghi nhớ",
					"Tác vụ con",
					"Cố vấn",
					"Tóm tắt công việc",
					"Tạo ảnh",
					"Tìm trên web",
					"Đọc thành tiếng",
					"Giọng nói thành chữ",
					"Đánh giá",
				]) {
					await expect(page.getByRole("button", { name: `Mô hình cho ${name}`, exact: true })).toBeAttached();
				}
			}
			await section.getByRole("button", { name: labels.enable, exact: true }).click();
			await expect(section.getByText(labels.on, { exact: true })).toBeVisible();
			await expect
				.poll(() => page.evaluate(() => window.omp.rpc.getSettings(["task.judgeRouting"])))
				.toMatchObject({ success: true, data: { values: { "task.judgeRouting": true } } });
			await expect
				.poll(() => page.evaluate(() => window.omp.rpc.getModelRoles()))
				.toMatchObject({
					success: true,
					data: {
						roles: expect.arrayContaining([
							expect.objectContaining({ id: "judge", model: "typesafe/fixture-native-judge" }),
						]),
					},
				});
			const current = await page.evaluate(() => window.omp.rpc.getState());
			expect((current.data as RpcSessionState).model).toEqual((initial.data as RpcSessionState).model);
			await page.screenshot({
				path: `test-results/jev-${language}-enabled.png`,
				scale: "css",
				animations: "disabled",
			});
			await page.getByRole("button", { name: labels.defaultRole, exact: true }).click();
			const picker = page.getByRole("listbox");
			await expect(picker).toBeVisible();
			await picker.getByRole("textbox").press("ArrowDown");
			await expect(picker.getByRole("option").first()).toBeFocused();
			await picker.getByRole("option").first().press("Escape");
			await expect(picker).toHaveCount(0);
			await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(760, 900));
			const content = page.locator(".omp-docked-page-content");
			await expect.poll(() => content.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
			await page.screenshot({
				path: `test-results/jev-${language}-narrow.png`,
				scale: "css",
				animations: "disabled",
			});
			await page.reload();
			await expect
				.poll(async () => (await page.evaluate(() => window.omp.sidecar.getStatus())).status)
				.toBe("ready");
			if (!(await section.isVisible())) await openRoles();
			await expect(section.getByText(labels.on, { exact: true })).toBeVisible();
			await section.getByRole("button", { name: labels.disable, exact: true }).click();
			await expect(section.getByText(labels.off, { exact: true })).toBeVisible();
			await expect
				.poll(() => page.evaluate(() => window.omp.rpc.getSettings(["task.judgeRouting"])))
				.toMatchObject({ success: true, data: { values: { "task.judgeRouting": false } } });
			expect(errors).toEqual([]);
		} finally {
			await app.evaluate(({ app }) => app.exit(0));
			await fs.rm(profile, { recursive: true, force: true });
		}
	});
}
