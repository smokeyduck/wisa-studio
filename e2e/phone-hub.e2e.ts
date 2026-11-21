/**
 * Phone hub end to end: one link, every session.
 *
 * This is the test that proves the feature rather than its parts. It starts the
 * real app against the sidecar fixture, turns the hub on in the dialog, takes
 * the link it produces, and opens that link in a real Chromium page — the phone.
 * The phone then has to list sessions, open one, and start a new one, all over a
 * real relay, with every frame sealed.
 *
 * The relay is a local stand-in for `wss://my.omp.sh` (see e2e/test-relay.ts):
 * same contract, no network. The hub's relay URL is set through the agent's own
 * env override, so nothing about the app is special-cased for the test.
 */

import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "playwright";
import { _electron as electron } from "playwright";

test("the phone hub lists, opens and creates sessions from one link", async () => {
	test.setTimeout(240_000);
	// Playwright's runner is Node, which has no WebSocket server, so the relay
	// runs as a bun subprocess — the same pattern the sidecar fixture uses.
	const relay = await startRelay();
	const profile = await fs.mkdtemp(path.join(os.tmpdir(), "omp-gui-hub-"));
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
		// The hub honours this, so the test never touches the public relay.
		OMP_COLLAB_RELAY_URL: relay.url.replace("http://", "ws://"),
	};
	Reflect.deleteProperty(env, "ELECTRON_RUN_AS_NODE");
	const app = await electron.launch({
		args: [path.resolve("out/main/index.js"), project, `--user-data-dir=${desktop}`],
		env,
	});
	const page = await app.firstWindow();
	const errors: string[] = [];
	page.on("pageerror", error => errors.push(error.message));

	let phone: Page | null = null;
	try {
		await expect(page.locator("textarea").first()).toBeVisible({ timeout: 60_000 });

		// Open the dialog the way a user does, then turn the hub on.
		await page.locator("body").click({ position: { x: 5, y: 5 } });
		await page.keyboard.press("Control+k");
		const palette = page.getByPlaceholder("Search commands…");
		await expect(palette).toBeVisible({ timeout: 10_000 });
		await palette.fill("phone");
		await expect(page.getByText("Phone Access").first()).toBeVisible({ timeout: 10_000 });
		await page.keyboard.press("Enter");
		const dialog = page.getByRole("dialog").filter({ hasText: "Phone Access" });
		await expect(dialog).toBeVisible({ timeout: 20_000 });

		// The hub starts off, and says so.
		await expect(dialog.getByText("The hub is off. Turn it on to get one link for every session.")).toBeVisible({
			timeout: 20_000,
		});
		await dialog.getByRole("button", { name: "Turn on" }).click();

		// A link appears, addressed at the test relay and carrying a hub room.
		const linkLocator = dialog.locator("code").first();
		await expect(linkLocator).toBeVisible({ timeout: 30_000 });
		const link = (await linkLocator.textContent()) ?? "";
		expect(link).toContain(relay.url.replace("http://", "ws://"));
		expect(link).toMatch(/\/r\/hub-[A-Za-z0-9_-]+#[A-Za-z0-9_-]+$/);
		// The relay is reachable, so the dialog reports a live socket.
		await expect(dialog.getByText("Relay connected")).toBeVisible({ timeout: 20_000 });

		// Open the link as the phone would: the page URL, then the link fragment.
		// A real second BrowserWindow, because Electron refuses `newPage()`.
		// Over http:// from the relay subprocess: a `file://` page cannot open a
		// WebSocket, and the real page is always served over https.
		const pageUrl = `${relay.url}/phone/#${link}`;
		await app.evaluate(({ BrowserWindow }, url) => {
			const win = new BrowserWindow({ width: 420, height: 820 });
			void win.loadURL(url);
		}, pageUrl);
		// Find the window by its URL: `waitForEvent("window")` can resolve with a
		// window from startup rather than the one just created.
		await expect
			.poll(
				async () => (await app.windows()).map(candidate => candidate.url()).find(url => url.includes("/phone/")),
				{
					timeout: 30_000,
				},
			)
			.toBeTruthy();
		const phonePage = (await app.windows()).find(candidate => candidate.url().includes("/phone/"));
		if (!phonePage) throw new Error("the phone window never appeared");
		phone = phonePage;
		await phone.waitForSelector("#list", { timeout: 30_000 });
		// The page must not throw: a broken inline script would otherwise pass as
		// "still loading" until the timeout.
		const phoneErrors: string[] = [];
		phone.on("pageerror", error => phoneErrors.push(error.message));
		// The page lists the session that is already open. A row can only appear
		// once the hub has answered, so this is the real "the phone is connected".
		await expect(phone.locator(".row").first()).toBeVisible({ timeout: 30_000 });

		// Opening a session hosts its room and embeds the agent's own PWA. The
		// fixture answers with a fixed webLink, so the iframe URL is assertable.
		await phone.locator(".row").first().click();
		await expect(phone.locator("#view")).toBeVisible({ timeout: 30_000 });
		await expect(phone.locator("#frame")).toHaveAttribute("src", /fixture-room-key/, { timeout: 30_000 });

		// Back to the list, then start a brand new session from the phone.
		await phone.locator("#backbtn").click();
		await expect(phone.locator("#newbtn")).toBeVisible({ timeout: 10_000 });
		await phone.locator("#newbtn").click();
		// A new tab appears on the desktop: the phone created a real session.
		await expect(page.getByRole("tab").or(page.locator("[data-tab-id]")).first()).toBeVisible({ timeout: 30_000 });
		await expect(phone.locator(".row")).toHaveCount(2, { timeout: 60_000 });

		expect(phoneErrors).toEqual([]);
		expect(errors).toEqual([]);
	} finally {
		await phone?.close();
		await app.close();
		relay.stop();
		await fs.rm(profile, { recursive: true, force: true });
	}
});

/** Start the bun relay subprocess and read the port it prints. */
async function startRelay(): Promise<{ url: string; stop: () => void }> {
	const child: ChildProcess = spawn("bun", [path.resolve("e2e/test-relay.ts")], {
		stdio: ["ignore", "pipe", "inherit"],
	});
	const url = await new Promise<string>((resolve, reject) => {
		let buffered = "";
		const onData = (chunk: Buffer) => {
			buffered += chunk.toString();
			const match = /(http:\/\/localhost:\d+)/.exec(buffered);
			if (match?.[1]) {
				child.stdout?.off("data", onData);
				resolve(match[1]);
			}
		};
		child.stdout?.on("data", onData);
		child.once("exit", code => reject(new Error(`relay exited early with ${code}`)));
	});
	return { url, stop: () => child.kill() };
}
