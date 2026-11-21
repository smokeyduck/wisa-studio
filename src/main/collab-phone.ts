/**
 * Phone access for every tab (the "code from your phone" surface).
 *
 * The agent already ships everything a phone needs: `collab_start` opens a
 * relay room and hands back browser links whose key lives in the URL fragment,
 * and my.omp.sh is a PWA that can prompt, stop, approve and read the transcript.
 * What the GUI lacked was a way to get at it without running `/collab` in each
 * session by hand and copying each link out.
 *
 * So this module does exactly two things, and invents no protocol:
 *
 * 1. **Auto-host on ready.** `collab.autoStart` (Settings → Interaction →
 *    Collab) is documented as "host every interactive session as it starts",
 *    but the agent only applies it in TUI mode — `--mode rpc-ui` never calls
 *    `collabController.autoStart()`, which is what the GUI's sidecars run as.
 *    This honors the same setting for GUI tabs, so a new tab is on the phone
 *    without a keystroke.
 *
 *    Only `off` and `control` are honored. The RPC's `collab_start` takes just
 *    a relay URL — the agent's `access: "view"` option is not reachable from
 *    `--mode rpc-ui`, and a GUI-hosted room is always a control room. Hosting
 *    one for a `view` policy would grant more than the user asked (the room
 *    publishes a control link into the local registry, which any `omp collab
 *    link` can read), so `view` is left to the terminal rather than silently
 *    upgraded.
 * 2. **One place to read the links.** `snapshot()` asks every ready sidecar for
 *    its own `get_collab_state` and returns them together, so the renderer can
 *    show (and QR-encode) one row per tab.
 *
 * State here is bookkeeping only: the sidecar owns the room, and the snapshot
 * is read live from it, so a restart, a crash or a `/collab` typed in the
 * composer can never leave this module out of sync with reality.
 */

import type { CollabAutoStartMode, CollabPhoneEntry, CollabPhoneSnapshot } from "../shared/collab-phone";
import type { RpcCollabState, RpcCommand, RpcResponse } from "../shared/rpc-types";
import type { SidecarManager } from "./sidecar";
import type { SidecarPool } from "./sidecar-pool";

/** Hosting talks to a relay over the network: far slower than a local command. */
const COLLAB_TIMEOUT_MS = 45_000;

function isAutoStartMode(value: unknown): value is CollabAutoStartMode {
	return value === "off" || value === "view" || value === "control";
}

function collabState(data: unknown): RpcCollabState | null {
	if (typeof data !== "object" || data === null) return null;
	const state = data as Partial<RpcCollabState>;
	if (state.role !== "host" && state.role !== "guest" && state.role !== null) return null;
	return {
		role: state.role ?? null,
		readOnly: state.readOnly === true,
		link: state.link,
		viewLink: state.viewLink,
		webLink: state.webLink,
		webViewLink: state.webViewLink,
		participants: Array.isArray(state.participants) ? state.participants : [],
	};
}

function entryFromState(tabId: string, ready: boolean, state: RpcCollabState | null, error?: string): CollabPhoneEntry {
	const entry: CollabPhoneEntry = {
		tabId,
		ready,
		role: state?.role ?? null,
		readOnly: state?.readOnly === true,
		participants: state?.participants.length ?? 0,
	};
	if (state?.link) entry.link = state.link;
	if (state?.viewLink) entry.viewLink = state.viewLink;
	if (state?.webLink) entry.webLink = state.webLink;
	if (state?.webViewLink) entry.webViewLink = state.webViewLink;
	if (error) entry.error = error;
	return entry;
}

export class CollabPhoneHost {
	#pool: SidecarPool;
	/** Last `collab.autoStart` read from a live sidecar; the setting is global. */
	#mode: CollabAutoStartMode = "off";
	/** Tabs with an in-flight host request, so a ready-flap cannot double-host. */
	#hosting = new Set<string>();

	constructor(pool: SidecarPool) {
		this.#pool = pool;
	}

	get autoStart(): CollabAutoStartMode {
		return this.#mode;
	}

	/**
	 * A tab's sidecar reached `ready` (first boot, restart, or a spare adopted
	 * onto a session). Re-read the setting · the user may have changed it in
	 * another window · and host when it asks for it.
	 *
	 * Re-running it on a ready flap is safe and deliberate: the agent's
	 * `collab_start` returns the live room instead of rotating it, and a room
	 * the user stopped inside the tab is restored. Only concurrent calls are
	 * collapsed (`#hosting`), so a flapping status cannot stack requests.
	 */
	async ready(tabId: string, sidecar: SidecarManager): Promise<void> {
		const settings = await this.#command(sidecar, { type: "get_settings", paths: ["collab.autoStart"] });
		const mode = (settings?.data as { values?: Record<string, unknown> } | undefined)?.values?.["collab.autoStart"];
		if (isAutoStartMode(mode)) this.#mode = mode;
		// `view` is terminal-only (see the module note): leave it unhosted.
		if (this.#mode !== "control") return;
		await this.#host(tabId, sidecar);
	}

	/** The tab's sidecar stopped serving: its room died with the process. */
	down(tabId: string): void {
		this.#hosting.delete(tabId);
	}

	/** Every tab of this window, each with its live collab state. */
	async snapshot(win: Parameters<SidecarPool["tabsForWindow"]>[0]): Promise<CollabPhoneSnapshot> {
		const tabs = this.#pool.tabsForWindow(win);
		const entries = await Promise.all(
			tabs.map(async tab => {
				const sidecar = this.#pool.sidecarForTab(win, tab.tabId);
				if (!sidecar) return entryFromState(tab.tabId, false, null, "Unknown tab");
				if (sidecar.status !== "ready") {
					return entryFromState(tab.tabId, false, null, `Sidecar not ready (${sidecar.status})`);
				}
				const response = await this.#command(sidecar, { type: "get_collab_state" });
				const state = collabState(response?.data);
				return entryFromState(tab.tabId, true, state, response?.success === false ? response.error : undefined);
			}),
		);
		return { autoStart: this.#mode, tabs: entries };
	}

	/**
	 * Host one tab's room. Always a control-access room (see the module note);
	 * the entry carries both the control and the view-only link, and handing a
	 * phone the view link is the caller's choice.
	 */
	async start(win: Parameters<SidecarPool["sidecarForTab"]>[0], tabId: string): Promise<CollabPhoneEntry> {
		const sidecar = this.#pool.sidecarForTab(win, tabId);
		if (!sidecar) return entryFromState(tabId, false, null, "Unknown tab");
		if (sidecar.status !== "ready")
			return entryFromState(tabId, false, null, `Sidecar not ready (${sidecar.status})`);
		const response = await this.#command(sidecar, { type: "collab_start" }, COLLAB_TIMEOUT_MS);
		if (!response) return entryFromState(tabId, true, null, "Sidecar disconnected");
		if (!response.success) return entryFromState(tabId, true, null, response.error ?? "collab_start failed");
		return entryFromState(tabId, true, collabState(response.data));
	}

	/** Stop hosting (or leave) this tab's room. */
	async stop(win: Parameters<SidecarPool["sidecarForTab"]>[0], tabId: string): Promise<CollabPhoneEntry> {
		const sidecar = this.#pool.sidecarForTab(win, tabId);
		if (!sidecar) return entryFromState(tabId, false, null, "Unknown tab");
		if (sidecar.status !== "ready")
			return entryFromState(tabId, false, null, `Sidecar not ready (${sidecar.status})`);
		const response = await this.#command(sidecar, { type: "collab_leave" }, COLLAB_TIMEOUT_MS);
		if (!response) return entryFromState(tabId, true, null, "Sidecar disconnected");
		if (!response.success) return entryFromState(tabId, true, null, response.error ?? "collab_leave failed");
		return entryFromState(tabId, true, collabState(response.data));
	}

	/**
	 * Persist `collab.autoStart` through a live sidecar (the same `set_setting`
	 * the Settings window uses, so the value lands in the agent's config.yml and
	 * every other surface agrees) and apply it now: turning it on hosts every
	 * tab that is not hosting yet, so the phone gains the sessions already open.
	 */
	async setAutoStart(
		win: Parameters<SidecarPool["sidecarForTab"]>[0],
		mode: CollabAutoStartMode,
	): Promise<CollabPhoneSnapshot> {
		const tabs = this.#pool.tabsForWindow(win);
		const writer = tabs
			.map(tab => this.#pool.sidecarForTab(win, tab.tabId))
			.find(sidecar => sidecar?.status === "ready");
		if (writer) {
			await this.#command(writer, { type: "set_setting", path: "collab.autoStart", value: mode });
		}
		this.#mode = mode;
		if (mode === "control") {
			await Promise.all(
				tabs.map(async tab => {
					const sidecar = this.#pool.sidecarForTab(win, tab.tabId);
					if (sidecar?.status !== "ready") return;
					await this.#host(tab.tabId, sidecar);
				}),
			);
		}
		return await this.snapshot(win);
	}

	async #host(tabId: string, sidecar: SidecarManager): Promise<void> {
		if (this.#hosting.has(tabId)) return;
		this.#hosting.add(tabId);
		try {
			await this.#command(sidecar, { type: "collab_start" }, COLLAB_TIMEOUT_MS);
		} finally {
			this.#hosting.delete(tabId);
		}
	}

	/** A command that must never throw: hosting is best-effort background work. */
	async #command(sidecar: SidecarManager, command: RpcCommand, timeoutMs?: number): Promise<RpcResponse | null> {
		const client = sidecar.rpcClient;
		if (!client || sidecar.status !== "ready") return null;
		try {
			return await client.command(command, timeoutMs);
		} catch {
			return null;
		}
	}
}
