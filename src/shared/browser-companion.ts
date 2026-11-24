export type BrowserAction =
	| { action: "show"; owner: string }
	| { action: "navigate"; owner: string; url: string }
	| { action: "observe"; owner: string }
	| { action: "close"; owner: string };

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
