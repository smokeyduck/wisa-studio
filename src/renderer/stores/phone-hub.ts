/**
 * Phone hub store: the single link that carries every session.
 *
 * Main owns the room (src/main/phone-hub.ts) and this store only mirrors what it
 * reports. That matters more here than elsewhere: the link is a credential, so
 * the dialog must show the one main currently accepts — never a copy it kept
 * from before a revoke.
 */
import { create } from "zustand";
import type { IpcPhoneHubState } from "../../shared/ipc-types";
import { describeError } from "../lib/errors";

interface PhoneHubStore {
	state: IpcPhoneHubState | null;
	/** A start/stop/revoke is in flight; the buttons disable while it runs. */
	pending: boolean;
	error: string | null;

	/** Re-read the state without changing it. */
	refresh: () => Promise<void>;
	/** Start hosting, or reuse the room that is already up. */
	start: () => Promise<void>;
	/** Stop hosting: every link already handed out stops working. */
	stop: () => Promise<void>;
	/** Rotate the room: a new link, and the old one is dead. */
	revoke: () => Promise<void>;
}

const OFF: IpcPhoneHubState = { link: null, live: false, listeners: 0 };

export const usePhoneHubStore = create<PhoneHubStore>(set => ({
	state: null,
	pending: false,
	error: null,

	refresh: async () => {
		try {
			set({ state: await window.omp.phoneHub.state(), error: null });
		} catch (cause) {
			set({ error: describeError(cause) });
		}
	},

	start: async () => {
		set({ pending: true, error: null });
		try {
			set({ state: await window.omp.phoneHub.start() });
		} catch (cause) {
			set({ error: describeError(cause) });
		} finally {
			set({ pending: false });
		}
	},

	stop: async () => {
		set({ pending: true, error: null });
		try {
			set({ state: await window.omp.phoneHub.stop() });
		} catch (cause) {
			// A failed stop leaves the hub in an unknown state, so fall back to
			// the off shape rather than keep showing a link that may not work.
			set({ state: OFF, error: describeError(cause) });
		} finally {
			set({ pending: false });
		}
	},

	revoke: async () => {
		set({ pending: true, error: null });
		try {
			set({ state: await window.omp.phoneHub.revoke() });
		} catch (cause) {
			set({ error: describeError(cause) });
		} finally {
			set({ pending: false });
		}
	},
}));
