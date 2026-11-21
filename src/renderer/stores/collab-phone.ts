/**
 * Phone access store: the per-tab collab links the Phone dialog shows.
 *
 * Main owns the rooms (src/main/collab-phone.ts); this store only mirrors the
 * snapshot it returns and forwards the user's actions, so a link shown here is
 * always one the agent's own `get_collab_state` just reported.
 */
import { create } from "zustand";
import type { CollabAutoStartMode, CollabPhoneEntry, CollabPhoneSnapshot } from "../../shared/collab-phone";
import { describeError } from "../lib/errors";
import { toast } from "./toast";

interface CollabPhoneStore {
	snapshot: CollabPhoneSnapshot | null;
	/** Tabs with a host/stop request in flight, so their row can show it. */
	pending: Record<string, boolean>;
	/** Why the last snapshot failed, if it did. */
	error: string | null;

	/** Re-read every tab's room. Never throws: the dialog shows `error` instead. */
	refresh: () => Promise<void>;
	/** Host one tab's room (control access; the entry carries a read-only link too). */
	start: (tabId: string) => Promise<void>;
	/** Stop hosting (or leave) one tab's room. */
	stop: (tabId: string) => Promise<void>;
	/** Persist `collab.autoStart` and host the tabs already open. */
	setAutoStart: (mode: CollabAutoStartMode) => Promise<void>;
}

/** Fold one tab's new state into the snapshot without dropping the others. */
function mergeEntry(snapshot: CollabPhoneSnapshot | null, entry: CollabPhoneEntry): CollabPhoneSnapshot {
	if (!snapshot) return { autoStart: "off", tabs: [entry] };
	const tabs = snapshot.tabs.map(tab => (tab.tabId === entry.tabId ? entry : tab));
	if (!tabs.some(tab => tab.tabId === entry.tabId)) tabs.push(entry);
	return { ...snapshot, tabs };
}

export const useCollabPhoneStore = create<CollabPhoneStore>((set, get) => ({
	snapshot: null,
	pending: {},
	error: null,

	refresh: async () => {
		try {
			set({ snapshot: await window.omp.collabPhone.snapshot(), error: null });
		} catch (cause) {
			set({ error: describeError(cause) });
		}
	},

	start: async tabId => {
		set(state => ({ pending: { ...state.pending, [tabId]: true }, error: null }));
		try {
			const entry = await window.omp.collabPhone.start({ tabId });
			set(state => ({ snapshot: mergeEntry(state.snapshot, entry) }));
		} catch (cause) {
			set({ error: describeError(cause) });
		} finally {
			set(state => ({ pending: { ...state.pending, [tabId]: false } }));
		}
	},

	stop: async tabId => {
		set(state => ({ pending: { ...state.pending, [tabId]: true }, error: null }));
		try {
			const entry = await window.omp.collabPhone.stop({ tabId });
			set(state => ({ snapshot: mergeEntry(state.snapshot, entry) }));
		} catch (cause) {
			set({ error: describeError(cause) });
		} finally {
			set(state => ({ pending: { ...state.pending, [tabId]: false } }));
		}
	},

	setAutoStart: async mode => {
		try {
			set({ snapshot: await window.omp.collabPhone.setAutoStart({ mode }), error: null });
			// Say what happened: turning it on hosts the tabs already open, and the
			// phone gains them without another gesture.
			if (mode !== "off") {
				const hosting = get().snapshot?.tabs.filter(tab => tab.role === "host").length ?? 0;
				toast({ variant: "success", message: `${hosting} tab(s) on the phone` });
			}
		} catch (cause) {
			set({ error: describeError(cause) });
		}
	},
}));
