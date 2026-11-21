/**
 * Phone access contract: the module only relays the agent's own collab RPCs.
 *
 * What matters and would break silently:
 * - `off` never opens a room (a phone link is a network listener; it must be opt-in).
 * - `control` hosts once per ready, not once per ready flap, and a second tab
 *   that is not ready is reported rather than hosted.
 * - `view` is NOT hosted from the GUI: `--mode rpc-ui`'s `collab_start` cannot
 *   express access, so honoring `view` would hand out a control room.
 * - A failing relay never throws out of the background hook.
 */

import { describe, expect, it } from "vitest";
import type { RpcCommand, RpcResponse } from "../shared/rpc-types";
import { CollabPhoneHost } from "./collab-phone";

type CommandHandler = (command: RpcCommand) => RpcResponse | Promise<RpcResponse>;

interface FakeSidecar {
	status: string;
	rpcClient: { command: (command: RpcCommand, timeoutMs?: number) => Promise<RpcResponse> };
}

function ok(command: string, data?: unknown): RpcResponse {
	return { type: "response", command, success: true, data } as RpcResponse;
}

function fail(command: string, error: string): RpcResponse {
	return { type: "response", command, success: false, error } as RpcResponse;
}

function settings(autoStart: string): RpcResponse {
	return ok("get_settings", { values: { "collab.autoStart": autoStart } });
}

function hostState(): RpcResponse {
	return ok("get_collab_state", {
		role: "host",
		readOnly: false,
		link: "omp://relay/room#key",
		viewLink: "omp://relay/room",
		webLink: "https://my.omp.sh/#key",
		webViewLink: "https://my.omp.sh/#",
		participants: [{ name: "me", role: "host", readOnly: false }],
	});
}

/** One sidecar per tab, with the commands it received recorded in order. */
function harness(handlers: Record<string, CommandHandler>) {
	const sent: Record<string, string[]> = {};
	const sidecars = new Map<string, FakeSidecar>();
	const make = (tabId: string, status = "ready"): FakeSidecar => {
		sent[tabId] = [];
		const sidecar: FakeSidecar = {
			status,
			rpcClient: {
				command: async command => {
					sent[tabId].push(command.type);
					const handler = handlers[command.type];
					if (!handler) throw new Error(`unexpected ${command.type}`);
					return await handler(command);
				},
			},
		};
		sidecars.set(tabId, sidecar);
		return sidecar;
	};
	const tabs: string[] = [];
	const pool = {
		tabsForWindow: () => tabs.map(tabId => ({ tabId })),
		sidecarForTab: (_win: unknown, tabId: string) => sidecars.get(tabId) ?? null,
	};
	const host = new CollabPhoneHost(pool as never);
	return { host, sent, make, tabs };
}

describe("CollabPhoneHost", () => {
	it("never opens a room while collab.autoStart is off", async () => {
		const { host, sent, make } = harness({ get_settings: () => settings("off"), collab_start: () => hostState() });
		const sidecar = make("t0");
		await host.ready("t0", sidecar as never);
		expect(sent.t0).toEqual(["get_settings"]);
		expect(host.autoStart).toBe("off");
	});

	it("re-applies a control policy on a ready flap without stacking requests", async () => {
		// The agent returns a live room instead of rotating it, so re-hosting is a
		// recovery path (a room stopped inside the tab comes back), not a rotation.
		const { host, sent, make } = harness({
			get_settings: () => settings("control"),
			collab_start: () => hostState(),
		});
		const sidecar = make("t0");
		await Promise.all([host.ready("t0", sidecar as never), host.ready("t0", sidecar as never)]);
		// Concurrent readies collapse into one host request.
		expect(sent.t0.filter(type => type === "collab_start")).toHaveLength(1);
		await host.ready("t0", sidecar as never);
		expect(sent.t0.filter(type => type === "collab_start")).toHaveLength(2);
	});

	it("does not host a view policy from the GUI (rpc-ui cannot express access)", async () => {
		const { host, sent, make } = harness({ get_settings: () => settings("view"), collab_start: () => hostState() });
		const sidecar = make("t0");
		await host.ready("t0", sidecar as never);
		expect(sent.t0).not.toContain("collab_start");
		expect(host.autoStart).toBe("view");
	});

	it("reports a tab whose sidecar is not ready instead of hosting it", async () => {
		const { host, make, tabs } = harness({ get_collab_state: () => hostState() });
		tabs.push("t0", "t1");
		make("t0");
		make("t1", "booting");
		const snapshot = await host.snapshot({} as never);
		expect(snapshot.tabs.map(entry => [entry.tabId, entry.ready])).toEqual([
			["t0", true],
			["t1", false],
		]);
		expect(snapshot.tabs[1]?.error).toContain("booting");
	});

	it("returns each tab's own room in the snapshot", async () => {
		const { host, make, tabs } = harness({ get_collab_state: () => hostState() });
		tabs.push("t0");
		make("t0");
		const [entry] = (await host.snapshot({} as never)).tabs;
		expect(entry).toMatchObject({
			role: "host",
			participants: 1,
			webLink: "https://my.omp.sh/#key",
			webViewLink: "https://my.omp.sh/#",
		});
	});

	it("persists the policy through a ready sidecar and hosts the open tabs", async () => {
		const { host, sent, make, tabs } = harness({
			get_settings: () => settings("control"),
			set_setting: () => ok("set_setting"),
			collab_start: () => hostState(),
			get_collab_state: () => hostState(),
		});
		tabs.push("t0", "t1");
		make("t0");
		make("t1", "booting");
		await host.setAutoStart({} as never, "control");
		expect(sent.t0).toContain("set_setting");
		expect(sent.t0).toContain("collab_start");
		expect(sent.t1).not.toContain("collab_start");
		expect(host.autoStart).toBe("control");
	});

	it("swallows a relay failure so a background ready hook never rejects", async () => {
		const { host, make } = harness({
			get_settings: () => settings("control"),
			collab_start: () => fail("collab_start", "relay unreachable"),
		});
		const sidecar = make("t0");
		await expect(host.ready("t0", sidecar as never)).resolves.toBeUndefined();
	});

	it("reports a failed host to the caller instead of claiming a room", async () => {
		const { host, make } = harness({ collab_start: () => fail("collab_start", "relay unreachable") });
		make("t0");
		const entry = await host.start({} as never, "t0");
		expect(entry.role).toBeNull();
		expect(entry.error).toBe("relay unreachable");
	});

	it("reports an unknown tab rather than throwing", async () => {
		const { host } = harness({});
		const entry = await host.start({} as never, "ghost");
		expect(entry).toMatchObject({ tabId: "ghost", ready: false, error: "Unknown tab" });
	});

	it("survives a sidecar that disconnects mid-command", async () => {
		const { host, make } = harness({ collab_leave: () => Promise.reject(new Error("disconnected")) });
		make("t0");
		const entry = await host.stop({} as never, "t0");
		expect(entry.error).toBe("Sidecar disconnected");
	});

	it("forgets a tab's in-flight host when its sidecar goes down", async () => {
		const { host, sent, make } = harness({
			get_settings: () => settings("control"),
			collab_start: () => hostState(),
		});
		const sidecar = make("t0");
		await host.ready("t0", sidecar as never);
		host.down("t0");
		await host.ready("t0", sidecar as never);
		expect(sent.t0.filter(type => type === "collab_start")).toHaveLength(2);
	});

	it("ignores a sidecar that is not ready when hosting on demand", async () => {
		const { host, make } = harness({ collab_start: () => hostState() });
		make("t0", "asleep");
		const entry = await host.start({} as never, "t0");
		expect(entry.ready).toBe(false);
		expect(entry.error).toContain("asleep");
	});
});

describe("CollabPhoneHost autoStart reading", () => {
	it("keeps the last policy when the setting read fails", async () => {
		const { host, make } = harness({ get_settings: () => Promise.reject(new Error("timeout")) });
		const sidecar = make("t0");
		await host.ready("t0", sidecar as never);
		expect(host.autoStart).toBe("off");
	});
});
