import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import type { RpcActiveToolsResult, RpcCommand, RpcSessionState } from "../src/shared/rpc-types";

const model = "split-proof";
const handoff = "Reviewed the workspace; check report.md next.";

const prompts = {
	writer: "Leave a handoff for the reviewer.",
	reviewer: "Read the handoff from the writer.",
};

test("split layout stays usable and agents exchange a handoff through Core", async ({}, testInfo) => {
	test.setTimeout(90_000);
	const profile = await mkdtemp(join(tmpdir(), "wisa-split-proof-"));
	const project = join(profile, "project");
	const agent = join(profile, ".wisa-studio-dev", "agent");
	const userData = join(profile, "appData", "wisa-studio-dev");
	const failures: string[] = [];
	const turns: string[] = [];
	let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
	const server = createServer(async (req, res) => {
		if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
			res.writeHead(404).end();
			return;
		}
		try {
			let raw = "";
			for await (const chunk of req) raw += chunk;
			const request = JSON.parse(raw) as {
				messages: { role: string; content: unknown }[];
				tools?: { function?: { name?: string } }[];
			};
			const user = JSON.stringify(request.messages.findLast(message => message.role === "user")?.content) ?? "";
			const role = user.includes(prompts.writer) ? "writer" : "reviewer";
			expect(user).toContain(prompts[role]);
			const output = request.messages.filter(message => message.role === "tool");
			turns.push(`${role}:${output.length}`);
			let args: object | undefined;
			if (output.length === 0) {
				expect(request.tools?.some(tool => tool.function?.name === "workspace_peer")).toBe(true);
				args = { action: role === "writer" ? "status" : "receive" };
			} else if (role === "writer" && output.length === 1) {
				expect(JSON.stringify(output[0]?.content)).toContain("Reviewer proof");
				args = { action: "send", message: handoff };
			} else {
				expect(output).toHaveLength(role === "writer" ? 2 : 1);
				expect(JSON.stringify(output.at(-1)?.content)).toContain(role === "writer" ? "no turn was started" : handoff);
			}
			const id = `peer_${turns.length}`;
			const delta = args
				? {
						role: "assistant",
						tool_calls: [{ index: 0, id, type: "function", function: { name: "workspace_peer", arguments: JSON.stringify(args) } }],
					}
				: { role: "assistant", content: `${role} proof complete` };
			res.writeHead(200, { "Content-Type": "text/event-stream" });
			for (const [item, finish] of [[delta, null], [{}, args ? "tool_calls" : "stop"]]) {
				res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: 1, model, choices: [{ index: 0, delta: item, finish_reason: finish }] })}\n\n`);
			}
			res.end("data: [DONE]\n\n");
		} catch (error) {
			failures.push(String(error));
			res.writeHead(400).end(String(error));
		}
	});
	try {
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		const address = server.address();
		if (!address || typeof address === "string") throw new Error("Fixture server did not bind a port");
		await Promise.all([mkdir(project), mkdir(agent, { recursive: true }), mkdir(userData, { recursive: true })]);
		await Promise.all([
			writeFile(join(userData, "prefs.json"), JSON.stringify({ language: "en", firstRunComplete: true, proxyDirect: true })),
			writeFile(join(agent, "config.yml"), "stt:\n  enabled: false\nmodels:\n  offline: true\n"),
			writeFile(join(agent, "models.yml"), `providers:\n  proof:\n    baseUrl: http://127.0.0.1:${address.port}/v1\n    api: openai-completions\n    apiKey: proof-local-only\n    models:\n      - id: ${model}\n        contextWindow: 65536\n        maxTokens: 4096\n`),
		]);
		const env: Record<string, string> = { WISA_PROFILE_ROOT: profile };
		for (const key of ["PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "DISPLAY", "XAUTHORITY", "LANG", "TEMP", "TMP"]) {
			const value = process.env[key];
			if (value !== undefined) env[key] = value;
		}
		app = await electron.launch({ args: [resolve("."), project], env });
		const page = await app.firstWindow();
		const tabs = () => page.evaluate(() => window.omp.tabs.list());
		const command = (tabId: string, rpc: RpcCommand) =>
			page.evaluate(({ tabId, rpc }) => window.omp.rpc.commandForTab(tabId, rpc), { tabId, rpc });
		const setupTab = async (tabId: string, name: string) => {
			await expect.poll(async () => {
				const { data } = await command(tabId, { type: "get_active_tools" });
				return (data as RpcActiveToolsResult | undefined)?.tools.map(tool => tool.name);
			}).toContain("workspace_peer");
			expect((await command(tabId, { type: "set_session_name", name })).success).toBe(true);
			expect((await command(tabId, { type: "set_model", modelId: model, provider: "proof" })).success).toBe(true);
			const { data } = await command(tabId, { type: "get_state" });
			const state = data as RpcSessionState;
			expect(state.cwd).toBe(project);
			return state.sessionId;
		};
		await expect.poll(async () => (await tabs()).find(tab => tab.status === "ready")?.cwd).toBe(project);
		const writer = (await tabs())[0]!.tabId;
		const writerSession = await setupTab(writer, "Writer proof");
		await page.getByRole("button", { name: "New Agent Tab", exact: true }).click();
		await expect.poll(async () => (await tabs()).length).toBe(2);
		const reviewer = (await tabs()).find(tab => tab.tabId !== writer)!.tabId;
		expect(await setupTab(reviewer, "Reviewer proof")).not.toBe(writerSession);
		await page.locator(`[id="omp-tab-${writer}"]`).click({ button: "right" });
		await page.getByRole("menuitem", { name: "Split right", exact: true }).click();
		await expect(page.locator(".omp-session-pane")).toHaveCount(2);
		await expect(page.getByRole("button", { name: "Open WISA Browser", exact: true })).toHaveCount(0);
		await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(800, 920));
		await expect(page.getByRole("separator", { name: "Resize session panes" })).toHaveAttribute(
			"aria-orientation",
			"horizontal",
		);
		const writerPane = page.getByRole("region", { name: "Session: Writer proof", exact: true });
		const reviewerPane = page.getByRole("region", { name: "Session: Reviewer proof", exact: true });
		const review = writerPane.getByRole("button", { name: "Right sidebar", exact: true });
		const inspector = writerPane.locator(".omp-inspector");
		const conversation = writerPane.locator(".omp-session-conversation");
		const width = await conversation.evaluate(node => node.getBoundingClientRect().width);
		await review.click();
		await expect(inspector.getByRole("button", { name: "Terminal", exact: true })).toBeEnabled();
		await expect(inspector.getByRole("button", { name: "Agents", exact: true })).toHaveCount(0);
		await expect(reviewerPane.locator(".omp-inspector")).toHaveCount(0);
		expect(await conversation.evaluate(node => node.getBoundingClientRect().width)).toBe(width);
		await page.screenshot({ path: testInfo.outputPath("split-review.png"), animations: "disabled" });
		await inspector.getByRole("button", { name: "Close", exact: true }).click();
		const composer = writerPane.locator("textarea").first();
		await composer.press("Shift+Tab");
		await expect.poll(async () => {
			const { data } = await command(writer, { type: "get_state" });
			return (data as RpcSessionState | undefined)?.planModeEnabled;
		}).toBe(true);
		await expect(writerPane.locator("[data-composer-plan-mode]")).toHaveText("Plan");
		await expect(reviewerPane.locator("[data-composer-plan-mode]")).toHaveCount(0);
		await expect(inspector).toHaveCount(0);
		await composer.press("Shift+Tab");
		await expect.poll(async () => {
			const { data } = await command(writer, { type: "get_state" });
			return (data as RpcSessionState | undefined)?.planModeEnabled;
		}).toBe(false);

		expect((await command(writer, { type: "prompt", message: prompts.writer })).success).toBe(true);
		await expect(page.getByText("writer proof complete", { exact: true })).toBeVisible();
		expect(failures).toEqual([]);
		expect(turns).toEqual(["writer:0", "writer:1", "writer:2"]);
		expect((await command(reviewer, { type: "prompt", message: prompts.reviewer })).success).toBe(true);
		await expect(page.getByText("reviewer proof complete", { exact: true })).toBeVisible();
		expect(failures).toEqual([]);
		expect(turns).toEqual(["writer:0", "writer:1", "writer:2", "reviewer:0", "reviewer:1"]);
		await expect.poll(async () => (await tabs()).map(tab => tab.status)).toEqual(["ready", "ready"]);
	} finally {
		try {
			if (app) {
				const page = app.windows().find(window => !window.isClosed());
				if (page) {
					await Promise.all([
						app.waitForEvent("close", { timeout: 10_000 }),
						page.evaluate(() => window.omp.app.quit()),
					]);
				} else {
					await app.close();
				}
			}
		} finally {
			server.closeAllConnections();
			await new Promise<void>(resolveClose => server.close(() => resolveClose()));
			await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
		}
	}
});
