import { once } from "node:events";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import { en } from "../src/renderer/locales/en";

// Real Core, bundled by default; OMP_GUI_OFFICIAL_CORE_CLI explicitly exercises a development source checkout.
// Only the OS file picker is replaced; no provider or source account is contacted.
test("official Claude and ChatGPT exports become persisted, openable chats through the import dialog", async () => {
	const profile = await fs.mkdtemp(path.join(os.tmpdir(), "wisa-official-import-"));
	const userData = path.join(profile, "appData", "wisa-studio-dev");
	const project = path.join(profile, "project");
	await fs.mkdir(userData, { recursive: true });
	await fs.mkdir(project);
	await fs.writeFile(path.join(userData, "prefs.json"), JSON.stringify({ language: "en", firstRunComplete: true }));
	const cases = [
		{
			source: "claude",
			title: "Claude official branch",
			reply: "Claude branch two reply",
			data: [
				{
					uuid: "claude-official-branch",
					name: "Claude official branch",
					created_at: "2026-01-01T00:00:00Z",
					updated_at: "2026-01-01T00:00:03Z",
					chat_messages: [
						{
							uuid: "cu",
							sender: "human",
							text: "Claude original question",
							created_at: "2026-01-01T00:00:00Z",
						},
						{
							uuid: "ca",
							parent_message_uuid: "cu",
							sender: "assistant",
							text: "Claude branch one reply",
							created_at: "2026-01-01T00:00:01Z",
						},
						{
							uuid: "cb",
							parent_message_uuid: "cu",
							sender: "assistant",
							text: "Claude branch two reply",
							created_at: "2026-01-01T00:00:03Z",
						},
					],
				},
				{
					uuid: "claude-official-other",
					name: "Other Claude chat",
					created_at: "2026-01-01T00:00:00Z",
					updated_at: "2026-01-01T00:00:00Z",
					chat_messages: [
						{
							uuid: "other",
							sender: "human",
							text: "Another Claude question",
							created_at: "2026-01-01T00:00:00Z",
						},
					],
				},
			],
		},
		{
			source: "chatgpt",
			title: "ChatGPT official branch",
			reply: "ChatGPT selected branch reply",
			data: [
				{
					id: "chatgpt-official-branch",
					title: "ChatGPT official branch",
					create_time: 1767225600,
					update_time: 1767225603,
					current_node: "gb",
					mapping: {
						root: { id: "root", parent: null, children: ["gu"], message: null },
						gu: {
							id: "gu",
							parent: "root",
							children: ["ga", "gb"],
							message: {
								id: "gu",
								author: { role: "user" },
								create_time: 1767225600,
								content: { content_type: "text", parts: ["ChatGPT original question"] },
							},
						},
						ga: {
							id: "ga",
							parent: "gu",
							children: [],
							message: {
								id: "ga",
								author: { role: "assistant" },
								create_time: 1767225601,
								content: { content_type: "text", parts: ["ChatGPT alternate branch reply"] },
							},
						},
						gb: {
							id: "gb",
							parent: "gu",
							children: [],
							message: {
								id: "gb",
								author: { role: "assistant" },
								create_time: 1767225603,
								content: { content_type: "text", parts: ["ChatGPT selected branch reply"] },
							},
						},
					},
				},
				{
					id: "chatgpt-official-other",
					title: "Other ChatGPT chat",
					create_time: 1767225600,
					update_time: 1767225600,
					current_node: "other",
					mapping: {
						other: {
							id: "other",
							parent: null,
							children: [],
							message: {
								id: "other",
								author: { role: "user" },
								create_time: 1767225600,
								content: { content_type: "text", parts: ["Another ChatGPT question"] },
							},
						},
					},
				},
			],
		},
	];
	const env = {
		...process.env,
		WISA_PROFILE_ROOT: profile,
		WISA_BROWSER_USE_AUTO_UPDATE: "0",
		OMP_BUNDLED_OMP: path.resolve(process.platform === "win32" ? "resources/omp.exe" : "resources/omp"),
	};
	for (const key of ["ELECTRON_RUN_AS_NODE", "OMP_SIDECAR", "OMP_SIDECAR_CLI"]) Reflect.deleteProperty(env, key);
	if (process.env.OMP_GUI_OFFICIAL_CORE_CLI) {
		Object.assign(env, {
			OMP_SIDECAR: "source",
			OMP_SIDECAR_CLI: path.resolve(process.env.OMP_GUI_OFFICIAL_CORE_CLI),
		});
	}
	const app = await electron.launch({ args: [path.resolve("out/main/index.js"), project], env });
	const errors: string[] = [];
	try {
		const page = await app.firstWindow();
		page.on("pageerror", error => errors.push(error.message));
		await page.waitForFunction(() => window.omp?.rpc != null);
		await expect.poll(async () => (await page.evaluate(() => window.omp.sidecar.getStatus())).status).toBe("ready");
		await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 900));
		const welcome = page.getByRole("dialog", { name: en["onboarding.title"], exact: true });
		if (await welcome.isVisible())
			await welcome.getByRole("button", { name: en["common.close"], exact: true }).click();
		for (const scenario of cases) {
			const filePath = path.join(profile, `${scenario.source}-conversations.json`);
			const sourceBytes = JSON.stringify(scenario.data);
			await fs.writeFile(filePath, sourceBytes);
			await app.evaluate(({ dialog }, selected) => {
				dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
			}, filePath);
			await page.getByRole("button", { name: en["titlebar.actions"], exact: true }).click();
			await page.getByRole("menuitem", { name: en["cmd.import"] }).click();
			const modal = page.getByRole("dialog", { name: en["import.title"], exact: true });
			await modal.getByRole("button", { name: en["import.pickArchive"], exact: true }).click();
			await expect(modal.getByText(scenario.title, { exact: true })).toBeVisible();
			await modal.getByRole("button", { name: en["import.selectAll"], exact: true }).click();
			await modal.getByRole("button", { name: en["import.importN"].replace("{count}", "2"), exact: true }).click();
			await expect(modal.getByText(en["import.batchStatus"].replace("{count}", "2"), { exact: true })).toBeVisible();
			await expect(modal.getByRole("button", { name: en["import.revealArchive"], exact: true })).toBeVisible();
			await page.screenshot({ path: `test-results/official-import-${scenario.source}.png`, animations: "disabled" });
			await modal
				.getByRole("button", { name: en["import.openChat"].replace("{title}", scenario.title), exact: true })
				.click();
			await expect(modal).toHaveCount(0);
			await expect(page.locator("[data-transcript-kind]").filter({ hasText: scenario.reply }).first()).toBeVisible();
			await expect(page.locator("textarea").first()).toBeEditable();
			expect(await fs.readFile(filePath, "utf8")).toBe(sourceBytes);
		}
		expect(errors).toEqual([]);
	} finally {
		const exited = once(app.process(), "exit");
		await app.evaluate(({ app }) => app.exit(0));
		await exited;
		await fs.rm(profile, { recursive: true, force: true });
	}
});
