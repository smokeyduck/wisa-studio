import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	BrowserWindow: vi.fn(),
	focused: vi.fn((): unknown => null),
	quitting: false,
	dockVisible: vi.fn(() => false),
	storeSet: vi.fn(),
	clearDrafts: vi.fn(),
	log: vi.fn(),
}));
vi.mock("electron", () => ({
	app: { isPackaged: false, dock: { isVisible: mocks.dockVisible } },
	BrowserWindow: Object.assign(mocks.BrowserWindow, { getFocusedWindow: mocks.focused }),
	Menu: { buildFromTemplate: vi.fn() },
	nativeTheme: { shouldUseDarkColors: false },
	screen: {
		getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
		getAllDisplays: () => [],
	},
	dialog: {},
	shell: {},
}));
vi.mock("node:original-fs", () => ({}));
vi.mock("electron-store", () => ({
	default: class {
		get(_key: string, fallback: unknown) {
			return fallback;
		}
		set = mocks.storeSet;
	},
}));
vi.mock("./app-quit", () => ({
	isQuitting: () => mocks.quitting,
	quitRisk: vi.fn(),
	requestQuit: vi.fn(),
}));
vi.mock("./file-draft-guard", () => ({ setWindowFileDrafts: mocks.clearDrafts }));
vi.mock("./i18n", () => ({ getMainLanguage: () => "en", mainT: (key: string) => key }));
vi.mock("./runtime-log", () => ({ runtimeLogPath: () => "/runtime.log", writeRuntimeLog: mocks.log }));

import { WindowManager } from "./window";

let nextId = 0;
class ShellWindow extends EventEmitter {
	webContents = Object.assign(new EventEmitter(), {
		id: ++nextId,
		setWindowOpenHandler: vi.fn(),
		isDestroyed: () => false,
		send: vi.fn(),
	});
	visible = true;
	minimized = false;
	destroyed = false;
	isDestroyed = () => this.destroyed;
	isVisible = () => this.visible;
	isMinimized = () => this.minimized;
	isMaximized = () => false;
	getBounds = () => ({ x: 30, y: 40, width: 1100, height: 800 });
	loadURL = vi.fn();
	loadFile = vi.fn();
	restore = vi.fn(() => {
		this.minimized = false;
	});
	show = vi.fn(() => {
		this.visible = true;
	});
	focus = vi.fn(() => {
		this.emit("focus");
	});
	hide = vi.fn(() => {
		this.visible = false;
		this.emit("hide");
	});
	close() {
		const event = { preventDefault: vi.fn() };
		this.emit("close", event);
		if (event.preventDefault.mock.calls.length === 0) {
			this.destroyed = true;
			this.emit("closed");
		}
		return event;
	}
}
function create(manager: WindowManager): ShellWindow {
	return manager.createWindow({ cwd: "/workspace" }) as unknown as ShellWindow;
}
beforeEach(() => {
	vi.stubGlobal("__dirname", "/app/main");
	vi.stubGlobal("process", { ...process, platform: "linux" });
	mocks.quitting = false;
	mocks.BrowserWindow.mockImplementation(() => new ShellWindow());
	mocks.focused.mockReturnValue(null);
	mocks.dockVisible.mockReturnValue(false);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("background shell lifecycle", () => {
	it.each(["win32", "darwin", "linux"])("retains windows and drafts on Close on %s", platform => {
		vi.stubGlobal("process", { ...process, platform });
		const manager = new WindowManager();
		manager.setBackgroundRestoreAvailable(() => true);
		const win = create(manager);
		const closed = vi.fn();
		manager.subscribeWindowClosed(closed);
		expect(win.close().preventDefault).toHaveBeenCalledOnce();
		expect(win.visible).toBe(false);
		expect(win.destroyed).toBe(false);
		expect(manager.getAllWindows()).toEqual([win]);
		expect(closed).not.toHaveBeenCalled();
		expect(mocks.clearDrafts).not.toHaveBeenCalled();
		expect(mocks.storeSet).toHaveBeenCalledWith("windowState", {
			x: 30,
			y: 40,
			width: 1100,
			height: 800,
			isMaximized: false,
		});
	});
	it("keeps a shell reachable when the tray is unavailable", () => {
		const manager = new WindowManager();
		const win = create(manager);
		win.close();
		expect(win.hide).not.toHaveBeenCalled();
		expect(win.visible).toBe(true);
		expect(win.focus).toHaveBeenCalled();
		expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ source: "window-lifecycle" }));
	});
	it("permits background close via the visible macOS Dock without a tray", () => {
		vi.stubGlobal("process", { ...process, platform: "darwin" });
		mocks.dockVisible.mockReturnValue(true);
		const manager = new WindowManager();
		const win = create(manager);
		win.close();
		expect(win.visible).toBe(false);
	});
	it("checks tray availability again after it disappears", () => {
		const manager = new WindowManager();
		let available = true;
		manager.setBackgroundRestoreAvailable(() => available);
		const win = create(manager);
		manager.hideWindow(win as never);
		manager.focusWindowById(win.webContents.id);
		available = false;
		win.close();
		expect(win.visible).toBe(true);
	});
	it("restores and focuses the most recently used shell, ignoring auxiliary windows", () => {
		const manager = new WindowManager();
		manager.setBackgroundRestoreAvailable(() => true);
		const first = create(manager);
		const second = create(manager);
		second.focus();
		second.close();
		second.minimized = true;
		mocks.focused.mockReturnValue(new ShellWindow());
		expect(manager.getTargetWindow()).toBe(second);
		expect(manager.focusWindowById(second.webContents.id)).toBe(true);
		expect(second.restore).toHaveBeenCalledOnce();
		expect(second.visible).toBe(true);
		expect(second.focus).toHaveBeenCalledTimes(2);
		expect(first.hide).not.toHaveBeenCalled();
	});
	it("allows approved quit/restart teardown and clears drafts only on destruction", () => {
		const manager = new WindowManager();
		manager.setBackgroundRestoreAvailable(() => true);
		const win = create(manager);
		const closed = vi.fn();
		manager.subscribeWindowClosed(closed);
		mocks.quitting = true;
		expect(win.close().preventDefault).not.toHaveBeenCalled();
		expect(win.hide).not.toHaveBeenCalled();
		expect(manager.getAllWindows()).toEqual([]);
		expect(closed).toHaveBeenCalledOnce();
		expect(mocks.clearDrafts).toHaveBeenCalledWith(win.webContents.id, false);
	});
});
