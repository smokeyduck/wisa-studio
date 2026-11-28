import { afterEach, describe, expect, it, vi } from "vitest";
import type { WindowManager } from "./window";

const mocks = vi.hoisted(() => ({ on: vi.fn() }));
vi.mock("electron", () => ({ app: { on: mocks.on, isPackaged: false } }));
vi.mock("./wisa-auth", () => ({ connectWisa: vi.fn() }));

import { setupDeepLinks } from "./deep-link";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("background second instance", () => {
	it.each([true, false])("restores an existing shell instead of duplicating it (exists=%s)", exists => {
		vi.stubGlobal("process", { ...process, platform: "win32", defaultApp: false, argv: ["wisa.exe"] });
		const win = { webContents: { id: 42 } };
		const manager = {
			getTargetWindow: () => (exists ? win : null),
			focusWindowById: vi.fn(),
		};
		const spawn = vi.fn(() => null);
		setupDeepLinks(manager as unknown as WindowManager, spawn);
		const registration = mocks.on.mock.calls.find(call => call[0] === "second-instance");
		if (!registration) throw new Error("Missing second-instance listener");
		registration[1]({}, ["wisa.exe"]);
		if (exists) {
			expect(manager.focusWindowById).toHaveBeenCalledWith(42);
			expect(spawn).not.toHaveBeenCalled();
		} else {
			expect(manager.focusWindowById).not.toHaveBeenCalled();
			expect(spawn).toHaveBeenCalledOnce();
		}
	});
});
