import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AGENT_NOTCH_SETTINGS } from "../shared/agent-notch";
import { startAgentNotch } from "./notch-runtime";
import type { SidecarPool } from "./sidecar-pool";
import type { WindowManager } from "./window";

const mocks = vi.hoisted(() => ({
	event: undefined as ((event: Record<string, unknown>, reply?: (value: unknown) => void) => void) | undefined,
	cancelled: undefined as ((id: string) => void) | undefined,
	send: vi.fn(),
	cancel: vi.fn(),
	configure: vi.fn(),
	dispose: vi.fn(),
	native: vi.fn(),
}));
vi.mock("electron", () => ({ app: { getPath: () => "/profile", once: vi.fn(), off: vi.fn() } }));
vi.mock("./i18n", () => ({ mainT: (key: string) => key }));
vi.mock("./runtime-log", () => ({ writeRuntimeLog: vi.fn() }));
vi.mock("./agent-notch", () => ({ startNativeNotch: mocks.native }));
vi.mock("./notch-panel", () => ({
	createNotchPanel: () => ({
		send: mocks.send,
		cancel: mocks.cancel,
		configure: mocks.configure,
		dispose: mocks.dispose,
	}),
}));
vi.mock("./notch-integrations", () => ({
	NotchIntegrations: class {
		constructor(options: { onEvent: typeof mocks.event; onCancel: typeof mocks.cancelled }) {
			mocks.event = options.onEvent;
			mocks.cancelled = options.onCancel;
		}
		start = async () => {};
		dispose = vi.fn();
	},
}));

const disposers: Array<() => void> = [];
afterEach(() => {
	for (const dispose of disposers.splice(0)) dispose();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});
function setup() {
	vi.stubGlobal("process", { ...process, platform: "win32" });
	let update = () => {};
	const writePreference = vi.fn();
	const windowManager = { getAllWindows: () => [] } as unknown as WindowManager;
	const pool = {
		notchSessions: () => [],
		subscribeNotch: (callback: () => void) => {
			update = callback;
			return () => {};
		},
	} as unknown as SidecarPool;
	const runtime = startAgentNotch({
		pool,
		windowManager,
		readPreference: () => ({ ...DEFAULT_AGENT_NOTCH_SETTINGS, agents: ["wisa", "custom"] }),
		writePreference,
	});
	disposers.push(runtime.dispose);
	return { runtime, writePreference, update: () => update() };
}
const permission = {
	_agent: "custom",
	session_id: "custom:s",
	hook_event_name: "PermissionRequest",
	_request_id: "custom:r",
	tool_name: "Bash",
	tool_input: { command: "pwd" },
};
describe("notch runtime approval ownership", () => {
	it("keeps approval reachable with an empty widget layout and settles once across displays", () => {
		const { runtime } = setup();
		runtime.configure({ ...runtime.getState().settings, widgets: [] });
		const respond = vi.fn();
		mocks.event!(permission, respond);
		const answer = mocks.send.mock.calls.at(-1)![1] as (value: unknown) => void;
		answer({ behavior: "allow", _request_id: "custom:r" });
		answer({ behavior: "deny", _request_id: "custom:r" });
		expect(respond).toHaveBeenCalledExactlyOnceWith({ behavior: "allow", _request_id: "custom:r" });
		expect(mocks.cancel).toHaveBeenCalledWith("custom:r");
	});
	it("returns no override when approval is disabled and leaves an informational card", () => {
		const { runtime } = setup();
		runtime.configure({ ...runtime.getState().settings, approveInNotch: false });
		const respond = vi.fn();
		mocks.event!(permission, respond);
		expect(respond).toHaveBeenCalledExactlyOnceWith({});
		expect(mocks.send).toHaveBeenLastCalledWith(
			expect.objectContaining({ hook_event_name: "Notification" }),
			undefined,
		);
	});
	it("drops stale callbacks after disconnect and when an agent is disabled", () => {
		const { runtime } = setup();
		const respond = vi.fn();
		mocks.event!(permission, respond);
		const answer = mocks.send.mock.calls.at(-1)![1] as (value: unknown) => void;
		mocks.cancelled!("custom:r");
		answer({ behavior: "allow" });
		expect(respond).not.toHaveBeenCalled();
		mocks.event!(permission, respond);
		runtime.configure({ ...runtime.getState().settings, agents: ["wisa"] });
		expect(respond).toHaveBeenCalledExactlyOnceWith({});
	});
	it("releases hidden approvals while a mini-app replaces the native panel without saving an opt-out", () => {
		const { runtime, writePreference } = setup();
		const respond = vi.fn();
		mocks.event!(permission, respond);
		const staleAnswer = mocks.send.mock.calls.at(-1)![1] as (value: unknown) => void;
		runtime.setCustomActive(true);
		expect(respond).toHaveBeenCalledExactlyOnceWith({});
		staleAnswer({ behavior: "allow" });
		expect(respond).toHaveBeenCalledTimes(1);
		expect(runtime.getState().settings.enabled).toBe(true);
		expect(writePreference).not.toHaveBeenCalled();
		expect(mocks.configure).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
		runtime.setCustomActive(false);
		expect(mocks.configure).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }));
	});
	it("does not replace effective settings if persistence fails", () => {
		const { runtime, writePreference } = setup();
		writePreference.mockImplementation(() => {
			throw new Error("disk full");
		});
		expect(() => runtime.configure({ enabled: false })).toThrow("disk full");
		expect(runtime.getState().settings.enabled).toBe(true);
		expect(mocks.configure).not.toHaveBeenCalled();
	});
});
