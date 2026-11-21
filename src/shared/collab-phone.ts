/**
 * Wire shapes for phone access (see src/main/collab-phone.ts).
 *
 * One entry per tab, carrying exactly what the agent's own `get_collab_state`
 * returns for that tab plus the readiness the renderer needs to explain a tab
 * that has no link yet. Links are the agent's: `webLink`/`webViewLink` are the
 * browser (PWA) URLs a phone opens, `link`/`viewLink` the raw relay keys.
 */

/** What `collab.autoStart` accepts — the agent's own enum. */
export type CollabAutoStartMode = "off" | "view" | "control";

export interface CollabPhoneEntry {
	tabId: string;
	/** The tab's sidecar is up, so its state is real rather than unknown. */
	ready: boolean;
	role: "host" | "guest" | null;
	readOnly: boolean;
	/** Participants in the room (host included); 0 when not in one. */
	participants: number;
	/** Editable relay key, when hosting. */
	link?: string;
	/** Read-only relay key, when hosting. */
	viewLink?: string;
	/** Editable browser link (my.omp.sh/#key) · what a phone should open. */
	webLink?: string;
	/** Read-only browser link. */
	webViewLink?: string;
	/** Why this tab has no state (sidecar down, command failed). */
	error?: string;
}

export interface CollabPhoneSnapshot {
	/** The agent setting in force, so the dialog can show its toggle truthfully. */
	autoStart: CollabAutoStartMode;
	tabs: CollabPhoneEntry[];
}
