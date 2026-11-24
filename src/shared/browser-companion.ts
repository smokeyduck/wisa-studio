export type BrowserAction = { owner: string } & (
	| { action: "show" | "observe" | "close" }
	| { action: "navigate"; url: string }
	| { action: "click"; ref: number }
	| { action: "type"; ref: number; text: string }
	| { action: "press"; key: BrowserKey }
	| { action: "scroll"; deltaY: number }
);

export const BROWSER_KEYS = ["Enter", "Escape", "Tab", "ArrowUp", "ArrowDown", "Backspace"] as const;
type BrowserKey = (typeof BROWSER_KEYS)[number];

export interface BrowserRequest {
	id: number;
	command: BrowserAction;
}

export interface BrowserReply {
	id: number;
	result: string;
	error?: true;
}

/** Never hand browser chrome a local-file, credentialed or external-protocol URL. */
export function browserUrl(input: string): URL | null {
	if (input.length > 4096) return null;
	try {
		const url = new URL(input);
		if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) return url;
	} catch {
		// Non-URL input is handled by the trusted address bar, not as a search query.
	}
	return null;
}
