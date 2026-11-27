import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import type { RpcActiveToolsResult, RpcSessionState } from "../src/shared/rpc-types";

const model = "browser-proof";
const button = "Confirm Browser Use";
const clicked = "Browser action completed";
const answer = "Verified the local Browser Use action.";

test("the bundled Core delegates web navigation to Browser Use without enabling the old browser", async () => {
	test.setTimeout(140_000);
	const profile = await mkdtemp(join(tmpdir(), "wisa-browser-proof-"));
	const project = join(profile, "project");
	const executablePath = process.env.OMP_GUI_TEST_APP;
	const name = executablePath ? "wisa-studio" : "wisa-studio-dev";
	const agent = join(profile, `.${name}`, "agent");
	const userData = join(profile, "appData", name);
	const failures: string[] = [];
	let calls = 0;
	let pageVisits = 0;
	let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
	let address: string;
	const server = createServer(async (req, res) => {
		if (req.url === "/page") {
			pageVisits++;
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<!doctype html>
				<title>Local Browser Use proof</title><button onclick="this.replaceWith(document.createTextNode('${clicked}'))">${button}</button>`);
			return;
		}
		if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
			res.writeHead(404).end();
			return;
		}
		try {
			let raw = "";
			for await (const chunk of req) raw += chunk;
			const request = JSON.parse(raw) as {
				messages: { role: string; content: unknown }[];
				tools?: { function?: { name?: string; description?: string } }[];
			};
			const turn = ++calls;
			const toolOutput = JSON.stringify(request.messages.filter(message => message.role === "tool"));
			let args: object | undefined;
			if (turn === 1) {
				const tool = request.tools?.find(tool => tool.function?.name === "browser_use")?.function;
				expect(tool?.description).toContain("Use Browser Use for all web-page navigation");
				expect(tool?.description).toContain("Do not open a system browser");
				args = { action: "navigate", url: `${address}/page` };
			} else if (turn === 2) {
				expect(toolOutput).toContain("Local Browser Use proof");
				const element = /\[(\d+)\] button/.exec(toolOutput)?.[1];
				expect(toolOutput).toContain(button);
				expect(element).toBeDefined();
				args = { action: "click", element: Number(element) };
			} else {
				expect(turn).toBe(3);
				expect(toolOutput).toContain(clicked);
			}
			const toolCalls = args
				? [{
					index: 0,
					id: `call_browser_${turn}`,
					type: "function",
					function: { name: "browser_use", arguments: JSON.stringify(args) },
				}]
				: undefined;
			res.writeHead(200, { "Content-Type": "text/event-stream" });
			for (const [delta, finish] of [
				[{ role: "assistant", ...(toolCalls ? { tool_calls: toolCalls } : { content: answer }) }, null],
				[{}, toolCalls ? "tool_calls" : "stop"],
			]) {
				const chunk = {
					id: `chatcmpl-browser-${turn}`,
					object: "chat.completion.chunk",
					created: 1,
					model,
					choices: [{ index: 0, delta, finish_reason: finish }],
				};
				res.write(`data: ${JSON.stringify(chunk)}\n\n`);
			}
			res.end("data: [DONE]\n\n");
		} catch (error) {
			failures.push(String(error));
			res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: { message: String(error) } }));
		}
	});
	try {
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		const port = server.address();
		if (!port || typeof port === "string") throw new Error("Local fixture has no TCP port");
		address = `http://127.0.0.1:${port.port}`;
		await Promise.all([mkdir(project), mkdir(agent, { recursive: true }), mkdir(userData, { recursive: true })]);
		await Promise.all([
			writeFile(join(userData, "prefs.json"), JSON.stringify({ language: "en", firstRunComplete: true, proxyDirect: true })),
			writeFile(join(agent, "config.yml"), "browser:\n  enabled: true\n"),
			writeFile(join(agent, "models.yml"), `providers:\n  proof:\n    baseUrl: ${address}/v1\n    api: openai-completions\n    apiKey: proof-local-only\n    models:\n      - id: ${model}\n        contextWindow: 65536\n        maxTokens: 4096\n`),
		]);
		// Exercise the package's bundled Browser Use, not a release fetched during the test.
		const env: Record<string, string> = { WISA_PROFILE_ROOT: profile, WISA_BROWSER_USE_AUTO_UPDATE: "0" };
		for (const key of ["PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "DISPLAY", "XAUTHORITY", "LANG", "TEMP", "TMP"]) {
			const value = process.env[key];
			if (value !== undefined) env[key] = value;
		}
		app = await electron.launch({
			...(executablePath ? { executablePath } : {}),
			args: executablePath ? [project] : [resolve("."), project],
			env,
		});
		const output: string[] = [];
		app.process().stdout?.on("data", chunk => output.push(String(chunk)));
		app.process().stderr?.on("data", chunk => output.push(String(chunk)));
		const page = await app.firstWindow({ timeout: 30_000 }).catch(error => {
			throw new Error(`WISA Studio did not open a window:\n${output.join("")}`, { cause: error });
		});
		await page.waitForFunction(() => window.omp?.rpc != null);
		await expect.poll(async () => {
			const response = await page.evaluate(() => window.omp.rpc.getState());
			return (response.data as RpcSessionState | undefined)?.cwd;
		}, { timeout: 60_000 }).toBe(project);
		await expect.poll(async () => {
			const response = await page.evaluate(() => window.omp.rpc.getActiveTools());
			return (response.data as RpcActiveToolsResult | undefined)?.tools.map(tool => tool.name);
		}).toContain("browser_use");
		const browserSetting = await page.evaluate(() => window.omp.rpc.getSettings(["browser.enabled"]));
		expect(browserSetting.success).toBe(true);
		expect(browserSetting.data).toMatchObject({ values: { "browser.enabled": false } });
		await expect(page.getByRole("button", { name: "Open WISA Browser", exact: true })).toHaveCount(0);
		expect(await page.evaluate(() => "browser" in window.omp)).toBe(false);
		const named = await page.evaluate(() => window.omp.rpc.setSessionName("Browser Use proof"));
		if (!named.success) throw new Error(named.error);
		const selected = await page.evaluate(id => window.omp.rpc.setModel("proof", id), model);
		if (!selected.success) throw new Error(selected.error);
		const sent = await page.evaluate(url => window.omp.rpc.command({
			type: "prompt",
			message: `Open ${url}/page and click its button.`,
		}, 60_000), address);
		if (!sent.success) throw new Error(`${sent.error}; model requests: ${calls}; ${failures.join("; ")}`);
		await expect.poll(() => failures.length > 0 || calls >= 3, { timeout: 60_000 }).toBe(true);
		expect(failures).toEqual([]);
		expect(calls).toBe(3);
		await expect(page.getByText(answer, { exact: true })).toBeVisible();
		expect(pageVisits).toBe(1);
	} finally {
		try {
			const page = app?.windows().find(window => !window.isClosed());
			if (app && page) {
				// Quit through Studio so its sidecar and Chromium shut down first.
				await Promise.all([
					app.waitForEvent("close", { timeout: 15_000 }),
					page.evaluate(() => window.omp.app.quit()).catch(() => {}),
				]);
			} else {
				await app?.close();
			}
		} finally {
			server.closeAllConnections();
			await new Promise<void>(resolveClose => server.close(() => resolveClose()));
			await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
		}
	}
});
