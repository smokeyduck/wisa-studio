import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SidecarPool } from "./sidecar-pool";
import type { WindowManager } from "./window";

const mocks = vi.hoisted(() => ({
	exists: vi.fn(() => true),
	spawn: vi.fn(),
	connect: vi.fn(),
	write: vi.fn(),
	app: {
		isPackaged: false,
		getAppPath: () => "/wisa",
		getPath: () => "/private/profile",
		once: vi.fn(),
		off: vi.fn(),
	},
	screen: {
		getPrimaryDisplay: () => ({ id: 1 }),
		getAllDisplays: () => [{ id: 1 }, { id: 2 }],
		on: vi.fn(),
		off: vi.fn(),
	},
}));
vi.mock("electron", () => ({ app: mocks.app, screen: mocks.screen }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("node:fs", () => ({
	existsSync: mocks.exists,
	mkdirSync: vi.fn(),
	chmodSync: vi.fn(),
	mkdtempSync: () => "/private/tmp/wn-123",
	rmSync: vi.fn(),
}));
vi.mock("node:net", async () => ({ ...(await vi.importActual("node:net")), connect: mocks.connect }));
vi.mock("./runtime-log", () => ({ writeRuntimeLog: vi.fn() }));

import { startNativeNotch } from "./agent-notch";
import { writeRuntimeLog } from "./runtime-log";

class Child extends EventEmitter {
	stdout = new EventEmitter();
	stderr = new EventEmitter();
	kill = vi.fn();
}
class Connection extends EventEmitter {
	write = mocks.write;
	end = mocks.write;
	destroy = vi.fn();
}
const disposers: Array<() => void> = [];
afterEach(() => {
	for (const dispose of disposers.splice(0)) dispose();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

function setup() {
	const children: Child[] = [];
	const connections: Connection[] = [];
	mocks.spawn.mockImplementation(() => {
		const child = new Child();
		children.push(child);
		return child;
	});
	mocks.connect.mockImplementation(() => {
		const socket = new Connection();
		connections.push(socket);
		return socket;
	});
	let sessions = [
		{
			tabId: "a",
			windowId: 1,
			title: "Same",
			cwd: "/project",
			running: true,
			tools: ["Computer Use"],
			preview: "",
			requests: [],
		},
	];
	let listener = () => {};
	const unsubscribe = vi.fn();
	const send = vi.fn();
	const focus = vi.fn((_id: number) => true);
	const pool = {
		notchSessions: () => sessions,
		subscribeNotch: (value: () => void) => {
			listener = value;
			return unsubscribe;
		},
	} as unknown as SidecarPool;
	const windowManager = {
		getAllWindows: () => [{ isDestroyed: () => false, webContents: { id: 1, send } }],
		focusWindowById: focus,
	} as unknown as WindowManager;
	const bridge = startNativeNotch({
		pool,
		windowManager,
		readPreference: () => undefined,
		labels: () => ({}),
		onReady: () => {},
		onSettings: () => {},
		onDisable: () => {},
		onSounds: () => {},
		onOpen: id => {
			const session = sessions.find(item => item.tabId === id);
			if (session) focus(session.windowId);
		},
	});
	disposers.push(bridge.dispose);
	return {
		bridge,
		children,
		connections,
		send,
		focus,
		unsubscribe,
		publish: () => listener(),
		clear: () => {
			sessions = [];
			listener();
		},
	};
}

describe("Notch native helper lifecycle", () => {
	it("reports unsupported platforms without spawning a helper", () => {
		vi.stubGlobal("process", { ...process, platform: "linux" });
		const { bridge } = setup();
		expect(bridge.getState().available).toBe(false);
		expect(mocks.spawn).not.toHaveBeenCalled();
	});
	it("reports missing helper honestly", () => {
		vi.stubGlobal("process", { ...process, platform: "darwin" });
		mocks.exists.mockReturnValueOnce(false);
		const { bridge } = setup();
		expect(bridge.getState()).toMatchObject({ available: false, error: expect.stringContaining("not installed") });
		expect(mocks.spawn).not.toHaveBeenCalled();
	});
	it("starts isolated per-display helpers and snapshots only after ready; repeated state does not storm sockets", () => {
		vi.stubGlobal("process", { ...process, platform: "darwin" });
		const { bridge, children, connections, publish, focus, unsubscribe } = setup();
		expect(mocks.spawn).toHaveBeenCalledTimes(2);
		expect(mocks.spawn.mock.calls[0]![2].env).toMatchObject({
			HOME: "/private/profile/notch-island-home",
			WISA_NOTCH: "1",
			WISA_NOTCH_DISPLAY_ID: "1",
			WISA_NOTCH_SHOW_IDLE: "1",
			WISA_NOTCH_DEFAULTS: expect.stringMatching(/^org\.wisa\./),
		});
		expect(connections).toHaveLength(0);
		children[0]!.stdout.emit("data", Buffer.from('{"type":"ready"}\n'));
		expect(connections).toHaveLength(1);
		connections[0]!.emit("connect");
		expect(JSON.parse(mocks.write.mock.calls[0]![0])).toMatchObject({
			hook_event_name: "WisaSnapshot",
			running: true,
			tool_name: "Computer Use",
			session_id: "a",
		});
		publish();
		publish();
		expect(connections).toHaveLength(1);
		expect(focus).not.toHaveBeenCalled();
		children[0]!.stdout.emit("data", Buffer.from('{"type":"open","sessionId":"a"}\n'));
		expect(focus).toHaveBeenCalledWith(1);
		bridge.dispose();
		expect(unsubscribe).toHaveBeenCalledOnce();
		expect(children.every(child => child.kill.mock.calls.length === 1)).toBe(true);
	});
	it("helper exit only marks unavailable, never sends a sidechannel denial", () => {
		vi.stubGlobal("process", { ...process, platform: "darwin" });
		const { bridge, children, focus } = setup();
		children[0]!.stderr.emit("data", Buffer.from("native diagnostic"));
		children[0]!.emit("exit", 1);
		expect(bridge.getState()).toMatchObject({ available: false, error: "Notch Island helper exited (code 1)." });
		expect(writeRuntimeLog).toHaveBeenCalledWith({
			source: "child-process",
			message: "Notch Island helper exited (code 1).",
			details: { feature: "agent-notch", displayId: 1, stderr: "native diagnostic" },
		});
		expect(focus).not.toHaveBeenCalled();
	});
});
