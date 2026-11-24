/**
 * Deep-link decoding. `omp://` is shared with the agent's own URLs, so the
 * contract that matters is: a known route decodes exactly, an unknown or
 * malformed one is ignored rather than guessed at.
 *
 * `omp://wisa-auth` is the browser sign-in handoff; its code is single-use, so a
 * link without one must decode to nothing instead of reaching the exchange.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The module registers `app.on("open-url")` at import time; only the pure
// decoder is under test here, so a stub is enough.
vi.mock("electron", () => ({
	app: {
		on: vi.fn(),
		isPackaged: false,
		setAsDefaultProtocolClient: vi.fn(),
		getAppPath: () => "/repo",
	},
}));

import { readFileSync } from "node:fs";
import { join } from "node:path";

const { LINUX_DESKTOP_FILE, LINUX_DEV_DESKTOP_FILE, linuxDesktopEntry, parseDeepLink, setupDeepLinks } = await import(
	"./deep-link"
);

describe("parseDeepLink", () => {
	it("accepts the private external scheme without accepting arbitrary schemes", () => {
		expect(parseDeepLink("wisa-studio://new")).toEqual({ kind: "payload", payload: { action: "new-session" } });
		expect(parseDeepLink("wisa-studio://wisa-auth?code=private")).toEqual({ kind: "wisa-auth", code: "private" });
		expect(parseDeepLink("https://wisa-auth?code=foreign")).toEqual({ kind: "none" });
	});
	it("decodes a new-session link", () => {
		expect(parseDeepLink("omp://new")).toEqual({
			kind: "payload",
			payload: { action: "new-session" },
		});
	});

	it("decodes a session switch and trims the slashes", () => {
		expect(parseDeepLink("omp://session/abc-123")).toEqual({
			kind: "payload",
			payload: { action: "switch-session", sessionId: "abc-123" },
		});
	});

	it("ignores a session link with no id", () => {
		expect(parseDeepLink("omp://session/")).toEqual({ kind: "none" });
	});

	it("decodes the WISA sign-in code", () => {
		expect(parseDeepLink("omp://wisa-auth?code=deadbeef")).toEqual({
			kind: "wisa-auth",
			code: "deadbeef",
		});
	});

	it("ignores a WISA link that carries no code", () => {
		expect(parseDeepLink("omp://wisa-auth")).toEqual({ kind: "none" });
		expect(parseDeepLink("omp://wisa-auth?code=")).toEqual({ kind: "none" });
	});

	it("is case-insensitive about the route but keeps the code verbatim", () => {
		expect(parseDeepLink("omp://WISA-Auth?code=AbC123")).toEqual({
			kind: "wisa-auth",
			code: "AbC123",
		});
	});

	it("ignores unknown routes and unparsable input", () => {
		expect(parseDeepLink("omp://something-else")).toEqual({ kind: "none" });
		expect(parseDeepLink("not a url")).toEqual({ kind: "none" });
		expect(parseDeepLink("")).toEqual({ kind: "none" });
	});
});

/**
 * Linux registration. `setAsDefaultProtocolClient` asks `xdg-settings` for
 * `<app name>.desktop`, so the id has to be one Electron can produce — and the
 * entry it names has to exist and carry `%U`, or the URL is swallowed.
 */
describe("linuxDesktopEntry", () => {
	it("opens the AppImage itself rather than its temporary mount", () => {
		const entry = linuxDesktopEntry("/home/u/AppImages/wisa-studio-0.9.46.AppImage");
		expect(entry).toContain("Exec=/home/u/AppImages/wisa-studio-0.9.46.AppImage %U");
	});

	it("quotes an Exec path that contains a space", () => {
		expect(linuxDesktopEntry("/home/u/My Apps/wisa-studio.AppImage")).toContain(
			'Exec="/home/u/My Apps/wisa-studio.AppImage" %U',
		);
	});

	it("declares the scheme and no terminal", () => {
		const entry = linuxDesktopEntry("/opt/wisa-studio/wisa-studio");
		expect(entry).toContain("MimeType=x-scheme-handler/wisa-studio;");
		expect(entry).not.toContain("x-scheme-handler/omp;");
		expect(entry).toContain("Type=Application");
		expect(entry).toContain("Terminal=false");
	});

	it("labels a dev entry apart from the installed app", () => {
		// Both builds are productName "WISA STUDIO", so an "Open With" list shows
		// the same label twice; the dev entry must say which one it is.
		const entry = linuxDesktopEntry("/repo/node_modules/electron/dist/electron", {
			name: "WISA STUDIO (Dev)",
			icon: "/repo/resources/icon.png",
			execArgs: "/repo",
		});
		expect(entry).toContain("Name=WISA STUDIO (Dev)");
		expect(entry).toContain("Icon=/repo/resources/icon.png");
		expect(entry).toContain("Exec=/repo/node_modules/electron/dist/electron /repo %U");
	});

	it("quotes an Exec argument that contains a space", () => {
		const entry = linuxDesktopEntry("/usr/bin/electron", { execArgs: '"/repo/My Apps/gui"' });
		expect(entry).toContain('Exec=/usr/bin/electron "/repo/My Apps/gui" %U');
	});

	it("keeps the dev entry id distinct from the packaged one", () => {
		expect(LINUX_DEV_DESKTOP_FILE).toBe("wisa-studio-dev.desktop");
		expect(LINUX_DEV_DESKTOP_FILE).not.toBe(LINUX_DESKTOP_FILE);
	});

	it("registers under the id electron-builder actually installs", () => {
		// setAsDefaultProtocolClient asks xdg-settings for `<id>.desktop`; if the
		// id is not the file electron-builder wrote, the scheme stays with
		// whatever app owned it. The id also has to be space-free: xdg-settings
		// feeds it to awk unquoted, and a space kills the write silently.
		const executableName = /^\s*executableName:\s*(\S+)\s*$/m.exec(
			readFileSync(join(__dirname, "..", "..", "electron-builder.yml"), "utf8"),
		)?.[1];
		expect(executableName).toBe("wisa-studio");
		expect(LINUX_DESKTOP_FILE).toBe(`${executableName}.desktop`);
		expect(LINUX_DESKTOP_FILE).not.toContain(" ");
	});
});

/**
 * Windows/Linux cold start. The link that launches the app arrives in its own
 * argv — there is no `second-instance` event, because there is no first
 * instance. Reading only `open-url` (macOS) meant the first click on a sign-in
 * link started the app and dropped the code.
 */
describe("cold-start deep link", () => {
	const platform = Object.getOwnPropertyDescriptor(process, "platform");
	beforeEach(() => {
		Object.defineProperty(process, "platform", { value: "win32", configurable: true });
	});
	afterEach(() => {
		if (platform) Object.defineProperty(process, "platform", platform);
	});

	function fakeWindow() {
		const send = vi.fn();
		const win = {
			webContents: { isLoading: () => false, send },
			isDestroyed: () => false,
			show: vi.fn(),
			focus: vi.fn(),
			isMinimized: () => false,
			restore: vi.fn(),
		};
		return { win, send };
	}

	it("delivers a link carried by the launching argv", () => {
		const { win, send } = fakeWindow();
		const windowManager = {
			getMainWindow: () => win,
			getAllWindows: () => [win],
			getTargetWindow: () => win,
			recordFor: () => undefined,
		};
		const originalArgv = process.argv;
		process.argv = ["/opt/wisa-studio", "wisa-studio://new"];
		try {
			setupDeepLinks(windowManager as never, (() => win) as never);
		} finally {
			process.argv = originalArgv;
		}
		expect(send).toHaveBeenCalledWith("deep-link", { action: "new-session" });
	});

	it("stays quiet when the launch carried no link", () => {
		const { win, send } = fakeWindow();
		const windowManager = {
			getMainWindow: () => win,
			getAllWindows: () => [win],
			getTargetWindow: () => win,
			recordFor: () => undefined,
		};
		const originalArgv = process.argv;
		process.argv = ["/opt/omp-gui"];
		try {
			setupDeepLinks(windowManager as never, (() => win) as never);
		} finally {
			process.argv = originalArgv;
		}
		expect(send).not.toHaveBeenCalled();
	});
});
