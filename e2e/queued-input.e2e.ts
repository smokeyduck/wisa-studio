import { once } from "node:events";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import type { RpcCommand } from "../src/shared/rpc-types";

test("queued logs stay bounded and both send shortcuts reduce wire input", async () => {
	const profile = await fs.mkdtemp(path.join(os.tmpdir(), "wisa-queued-input-"));
	const userData = path.join(profile, "appData", "wisa-studio-dev");
	const record = path.join(profile, "commands.jsonl");
	await fs.mkdir(userData, { recursive: true });
	await fs.writeFile(path.join(userData, "prefs.json"), JSON.stringify({ language: "en", firstRunComplete: true }));
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
		await expect.poll(async () => (await page.evaluate(() => window.omp.sidecar.getStatus())).status).toBe("ready");
		await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1100, 800));
		const input = page.locator(".omp-composer-box textarea");
		const json = '{\n  "id": 9007199254740993,\n  "message": "keep  spaces"\n}';
		const compact = '{"id":9007199254740993,"message":"keep  spaces"}';
		await input.fill(json);
		await input.press("Enter");
		await expect
			.poll(async () => (await commands()).some(c => c.type === "prompt" && c.message === compact))
			.toBe(true);
		await expect(page.getByText("Local fixture reply", { exact: true })).toBeVisible();
		await input.fill("fixture running");
		await input.press("Enter");
		await expect(page.getByRole("button", { name: "Abort", exact: true })).toBeVisible();

		const records = Array.from(
			{ length: 100 },
			(_, index) => `ERROR ${index}: diagnostic record, preserve this evidence`,
		);
		await input.fill(records.join("\n\n\n\n"));
		await input.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
		await expect
			.poll(async () => (await commands()).some(c => c.type === "follow_up" && c.message === records.join("\n\n")))
			.toBe(true);
		const bubble = page.locator(".omp-queued-bubble");
		await expect(bubble).toHaveCount(1);
		await expect(bubble).toBeVisible();
		const expand = bubble.getByRole("button", { name: "Expand", exact: true });
		await expect(expand).toHaveAttribute("aria-expanded", "false");
		await expect.poll(() => bubble.evaluate(node => node.getBoundingClientRect().height)).toBeLessThan(110);
		await page.screenshot({ path: "test-results/queued-input-collapsed.png", animations: "disabled" });
		const previewId = await expand.getAttribute("aria-controls");
		await expand.click();
		const full = bubble.locator(`[id="${previewId}"]`);
		await expect(full).toHaveText(records.join("\n\n"));
		await expect.poll(() => full.evaluate(node => node.clientHeight)).toBeLessThanOrEqual(160);
		await full.evaluate(node => {
			node.scrollTop = node.scrollHeight;
		});
		await page.screenshot({ path: "test-results/queued-input-expanded.png", animations: "disabled" });
		await bubble.getByRole("button", { name: "Collapse", exact: true }).click();
		await expect.poll(() => bubble.evaluate(node => node.getBoundingClientRect().height)).toBeLessThan(110);

		await input.fill(json);
		await input.press("Control+Enter");
		const controlLane = "follow_up";
		await expect
			.poll(async () => (await commands()).some(c => c.type === controlLane && c.message === compact))
			.toBe(true);
		await expect(bubble).toHaveCount(2);
		await bubble
			.filter({ hasText: "ERROR 0:" })
			.getByRole("button", { name: "Remove from queue", exact: true })
			.click();
		await expect(bubble).toHaveCount(1);
		expect(errors).toEqual([]);
	} finally {
		const exited = once(app.process(), "exit");
		await app.evaluate(({ app }) => app.exit(0));
		await exited;
		await fs.rm(profile, { recursive: true, force: true });
	}
});
