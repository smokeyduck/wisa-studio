import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WindowManager } from "./window";

const mocks = vi.hoisted(() => ({
	Tray: vi.fn(),
	buildMenu: vi.fn(),
	quit: vi.fn(),
	log: vi.fn(),
	quitting: false,
}));
vi.mock("electron", () => ({
	app: { quit: mocks.quit },
	Tray: mocks.Tray,
	Menu: { buildFromTemplate: mocks.buildMenu },
	nativeImage: { createFromBuffer: () => ({ setTemplateImage: vi.fn() }) },
	nativeTheme: { on: vi.fn(), off: vi.fn() },
}));
vi.mock("./app-quit", () => ({ isQuitting: () => mocks.quitting }));
vi.mock("./i18n", () => ({ getMainLanguage: () => "en" }));
vi.mock("./runtime-log", () => ({ writeRuntimeLog: mocks.log }));

import { createTray, destroyTray } from "./tray";

class TrayIcon extends EventEmitter {
	destroyed = false;
	setToolTip = vi.fn();
	setContextMenu = vi.fn();
	isDestroyed = () => this.destroyed;
	destroy = vi.fn(() => {
		this.destroyed = true;
	});
}
let icon: TrayIcon;
let template: Electron.MenuItemConstructorOptions[];
function setup() {
	const win = {
		webContents: { id: 17, send: vi.fn() },
		isVisible: vi.fn(() => false),
		isMinimized: vi.fn(() => false),
	};
	let probe = () => false;
	const manager = {
		getTargetWindow: vi.fn((): typeof win | null => win),
		getAllWindows: () => [win],
		focusWindowById: vi.fn(() => true),
		hideWindow: vi.fn(),
		setBackgroundRestoreAvailable: (value: () => boolean) => {
			probe = value;
		},
	};
	const spawn = vi.fn(() => null);
	const result = createTray(manager as unknown as WindowManager, spawn);
	return { win, manager, spawn, result, available: () => probe() };
}
function toggle() {
	// Show/Hide and Quit are the last two actionable rows.
	const item = template.at(-3);
	if (!item?.click) throw new Error("Missing tray Show/Hide action");
	item.click({} as Electron.MenuItem, {} as Electron.BrowserWindow, {} as Electron.KeyboardEvent);
}
beforeEach(() => {
	mocks.quitting = false;
	icon = new TrayIcon();
	mocks.Tray.mockImplementation(() => icon);
	mocks.buildMenu.mockImplementation((items: Electron.MenuItemConstructorOptions[]) => {
		template = items;
		return new EventEmitter();
	});
});
afterEach(() => {
	mocks.quitting = true;
	destroyTray();
	vi.clearAllMocks();
});

describe("tray background lifecycle", () => {
	it("restores hidden or minimized windows through the shared focus path", () => {
		const { manager, win, available } = setup();
		expect(available()).toBe(true);
		icon.emit("click");
		expect(manager.focusWindowById).toHaveBeenCalledWith(17);
		toggle();
		expect(manager.focusWindowById).toHaveBeenCalledTimes(2);
		win.isVisible.mockReturnValue(true);
		win.isMinimized.mockReturnValue(true);
		toggle();
		expect(manager.focusWindowById).toHaveBeenCalledTimes(3);
		expect(manager.hideWindow).not.toHaveBeenCalled();
		win.isMinimized.mockReturnValue(false);
		toggle();
		expect(manager.hideWindow).toHaveBeenCalledWith(win);
	});
	it("creates a shell only when no managed windows remain", () => {
		const { manager, spawn } = setup();
		manager.getTargetWindow.mockReturnValue(null);
		icon.emit("click");
		toggle();
		expect(spawn).toHaveBeenCalledTimes(2);
	});
	it("keeps explicit Quit on Electron's before-quit confirmation path", () => {
		setup();
		const quit = template.at(-1);
		if (!quit?.click) throw new Error("Missing tray Quit action");
		quit.click({} as Electron.MenuItem, {} as Electron.BrowserWindow, {} as Electron.KeyboardEvent);
		expect(mocks.quit).toHaveBeenCalledOnce();
	});
	it("reports tray construction failure without claiming a restore route", () => {
		mocks.Tray.mockImplementation(() => {
			throw new Error("Status notifier unavailable");
		});
		const { result, available } = setup();
		expect(result).toBeNull();
		expect(available()).toBe(false);
		expect(mocks.log).toHaveBeenCalledWith(
			expect.objectContaining({
				source: "tray",
				details: "Error: Status notifier unavailable",
			}),
		);
	});
	it("restores hidden shells if their tray is removed outside quit", () => {
		const { manager, available } = setup();
		destroyTray();
		expect(available()).toBe(false);
		expect(manager.focusWindowById).toHaveBeenCalledWith(17);
	});
	it("does not reopen hidden shells during approved teardown", () => {
		const { manager } = setup();
		mocks.quitting = true;
		destroyTray();
		expect(manager.focusWindowById).not.toHaveBeenCalled();
	});
});
