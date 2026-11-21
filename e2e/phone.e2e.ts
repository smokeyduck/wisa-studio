/**
 * Phone access end to end: a user opens the dialog, hosts a tab, and gets a
 * scannable QR plus the link a phone opens — against the bundled sidecar
 * fixture, so the whole chain (renderer → IPC → main → RPC) is exercised.
 *
 * Also pins that the setting round-trips: turning auto-host on writes
 * `collab.autoStart` through the agent's own `set_setting`.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";

test("phone dialog hosts a tab, shows a QR and link, and persists auto-host", async () => {
	test.setTimeout(180_000);
	const profile = await fs.mkdtemp(path.join(os.tmpdir(), "omp-gui-phone-"));
	const desktop = path.join(profile, "desktop"),
		agent = path.join(profile, "agent"),
		project = path.join(profile, "project");
	await Promise.all([fs.mkdir(desktop), fs.mkdir(agent), fs.mkdir(project)]);
	await fs.writeFile(path.join(desktop, "prefs.json"), JSON.stringify({ language: "en" }));
	const env = {
		...process.env,
		PI_CODING_AGENT_DIR: agent,
		PI_CONFIG_DIR: path.relative(os.homedir(), profile),
		OMP_PROFILE: "",
		PI_PROFILE: "",
		OMP_BUNDLED_OMP: path.resolve("e2e/sidecar-fixture.ts"),
	};
	Reflect.deleteProperty(env, "ELECTRON_RUN_AS_NODE");
	const app = await electron.launch({
		args: [path.resolve("out/main/index.js"), project, `--user-data-dir=${desktop}`],
		env,
	});
	const page = await app.firstWindow();
	const errors: string[] = [];
	page.on("pageerror", error => errors.push(error.message));
	try {
		await expect(page.locator("textarea").first()).toBeVisible({ timeout: 60_000 });

		// Open the dialog the way a user does: ⌘K, then the `phone` command.
		await page.locator("body").click({ position: { x: 5, y: 5 } });
		await page.keyboard.press("Control+k");
		const palette = page.getByPlaceholder("Search commands…");
		await expect(palette).toBeVisible({ timeout: 10_000 });
		await palette.fill("phone");
		await expect(page.getByText("Phone Access").first()).toBeVisible({ timeout: 10_000 });
		await page.keyboard.press("Enter");
		const dialog = page.getByRole("dialog").filter({ hasText: "Phone Access" });
		await expect(dialog).toBeVisible({ timeout: 20_000 });

		// Host the open tab.
		const hostButton = dialog.getByRole("button", { name: "Host", exact: true }).first();
		await expect(hostButton).toBeEnabled({ timeout: 30_000 });
		await hostButton.click();

		// The room's browser link and its QR symbol appear.
		await expect(dialog.getByText("https://my.omp.sh/#fixture-room-key")).toBeVisible({ timeout: 30_000 });
		const qr = dialog.locator('svg[width="104"]').first();
		await expect(qr).toBeVisible();
		// A QR symbol is a path of many modules, not an empty box.
		const pathLength = await qr
			.locator("path")
			.getAttribute("d")
			.then(value => value?.length ?? 0);
		expect(pathLength).toBeGreaterThan(200);

		// Auto-host round-trips through the agent's own setting.
		await dialog.getByRole("button", { name: "Full control", exact: true }).click();
		const saved = await page.evaluate(async () => {
			const response = await window.omp.rpc.command({ type: "get_settings", paths: ["collab.autoStart"] });
			return (response.data as { values?: Record<string, unknown> } | undefined)?.values?.["collab.autoStart"];
		});
		expect(saved).toBe("control");

		expect(errors).toEqual([]);
	} finally {
		await app.close();
	}
});
