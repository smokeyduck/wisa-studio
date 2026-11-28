import { once } from "node:events";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import type { RpcMcpServersResult } from "../src/shared/rpc-types";

// Real bundled Core + a local stdio MCP server; no provider, credentials, or external network.
test("sidebar embeds a working shell and follows live MCP disable/enable", async () => {
	const profile = await fs.mkdtemp(path.join(os.tmpdir(), "wisa-sidebar-runtime-"));
	const userData = path.join(profile, "appData", "wisa-studio-dev");
	const project = path.join(profile, "project");
	const config = path.join(project, ".wisa-studio-dev");
	const agent = path.join(profile, ".wisa-studio-dev", "agent");
	await fs.mkdir(userData, { recursive: true });
	await fs.mkdir(config, { recursive: true });
	await fs.mkdir(agent, { recursive: true });
	await fs.writeFile(path.join(userData, "prefs.json"), JSON.stringify({ language: "vi", firstRunComplete: true }));
	await fs.writeFile(path.join(agent, "config.yml"), "mcp:\n  shared: false\n  enableProjectConfig: true\n");
	const serverPath = path.join(profile, "mcp.cjs");
	await fs.writeFile(
		serverPath,
		`
const readline = require("node:readline");
readline.createInterface({ input: process.stdin }).on("line", line => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  let result;
  switch (request.method) {
    case "initialize": result = { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "sidebar-proof", version: "1" } }; break;
    case "tools/list": result = { tools: [{ name: "echo", description: "Echo local proof", inputSchema: { type: "object", properties: {} } }] }; break;
    case "tools/call": result = { content: [{ type: "text", text: "local MCP proof" }] }; break;
    default: result = {};
  }
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\\n");
});
`,
	);
	await fs.writeFile(
		path.join(config, "mcp.json"),
		JSON.stringify({
			mcpServers: {
				"sidebar-proof": { command: process.execPath, args: [serverPath] },
			},
		}),
	);
	const env = {
		...process.env,
		WISA_PROFILE_ROOT: profile,
		OMP_BUNDLED_OMP: path.resolve(process.platform === "win32" ? "resources/omp.exe" : "resources/omp"),
	};
	Reflect.deleteProperty(env, "ELECTRON_RUN_AS_NODE");
	Reflect.deleteProperty(env, "OMP_SIDECAR");
	Reflect.deleteProperty(env, "OMP_SIDECAR_CLI");
	const app = await electron.launch({ args: [path.resolve("out/main/index.js"), project], env });
	try {
		const page = await app.firstWindow();
		const errors: string[] = [];
		page.on("pageerror", error => errors.push(error.message));
		await page.waitForFunction(() => window.omp?.rpc != null);
		await expect.poll(async () => (await page.evaluate(() => window.omp.sidecar.getStatus())).status).toBe("ready");
		await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 900));
		const servers = () =>
			page.evaluate(async () => {
				const response = await window.omp.rpc.getMcpServers();
				if (!response.success) throw new Error(response.error);
				return (response.data as RpcMcpServersResult).servers;
			});
		await expect
			.poll(async () => (await servers()).find(server => server.name === "sidebar-proof")?.status)
			.toBe("connected");
		await page
			.getByRole("dialog", { name: "Chào mừng đến với Wisa", exact: true })
			.getByRole("button", { name: "Đóng", exact: true })
			.click();
		const toggle = page.getByRole("button", { name: "Thanh bên phải", exact: true });
		await toggle.click();
		const inspector = page.locator(".omp-inspector");
		await inspector.getByRole("button", { name: "Tổng quan", exact: true }).click();
		await expect(inspector.locator('header button[aria-pressed="true"]')).toHaveText("Tổng quan");
		await expect(inspector.getByText("sidebar-proof", { exact: true })).toBeVisible();
		await expect(inspector.getByText("1 công cụ", { exact: true })).toBeVisible();
		await expect(inspector.getByRole("heading", { name: "Thay đổi", exact: true })).toHaveCount(0);
		await page.screenshot({ path: "test-results/sidebar-overview-vi.png", animations: "disabled" });
		await inspector.getByRole("button", { name: "Terminal", exact: true }).click();
		await inspector.getByRole("button", { name: "Shell mới", exact: true }).click();
		await expect(inspector.locator(".xterm-screen")).toBeVisible();
		const terminalId = await page.evaluate(async () => {
			const result = await window.omp.rpc.command({ type: "terminal_list" });
			if (!result.success) throw new Error(result.error);
			if (
				!result.data ||
				typeof result.data !== "object" ||
				!("terminals" in result.data) ||
				!Array.isArray(result.data.terminals)
			)
				throw new Error("Missing terminal list");
			const terminals: unknown[] = result.data.terminals;
			const shell = terminals.find(
				entry => entry && typeof entry === "object" && "kind" in entry && entry.kind === "shell",
			);
			if (!shell || typeof shell !== "object" || !("terminalId" in shell) || typeof shell.terminalId !== "string")
				throw new Error("Missing shell");
			return shell.terminalId;
		});
		expect(terminalId).toBeTruthy();
		const viewport = inspector.locator(".omp-terminal-viewport");
		await viewport.click();
		await page.keyboard.type("printf 'SIDEBAR_%s\\n' 'SHELL_OK'");
		await page.keyboard.press("Enter");
		await expect
			.poll(async () =>
				page.evaluate(async id => {
					const result = await window.omp.rpc.command({ type: "terminal_snapshot", terminalId: id });
					return JSON.stringify(result.data);
				}, terminalId as string),
			)
			.toContain("SIDEBAR_SHELL_OK");
		await page.screenshot({ path: "test-results/sidebar-terminal-vi.png", animations: "disabled" });
		await inspector.getByRole("button", { name: "Tổng quan", exact: true }).click();
		const disabled = await page.evaluate(() => window.omp.rpc.mcpAction("sidebar-proof", "disable"));
		expect(disabled.success).toBe(true);
		await expect(inspector.getByText("Tắt", { exact: true })).toBeVisible();
		await expect(inspector.getByText("1 công cụ", { exact: true })).toHaveCount(0);
		const enabled = await page.evaluate(() => window.omp.rpc.mcpAction("sidebar-proof", "enable"));
		expect(enabled.success).toBe(true);
		await expect(inspector.getByText("Đã kết nối", { exact: true })).toBeVisible();
		await expect(inspector.getByText("1 công cụ", { exact: true })).toBeVisible();
		expect(errors).toEqual([]);
	} finally {
		const exited = once(app.process(), "exit");
		await app.evaluate(({ app }) => app.exit(0));
		await exited;
		await fs.rm(profile, { recursive: true, force: true });
	}
});
