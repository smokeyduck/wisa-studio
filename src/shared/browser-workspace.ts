export interface BrowserPageState {
	id: number;
	url: string;
	title: string;
	driven: boolean;
}

export interface BrowserWorkspaceState {
	pages: BrowserPageState[];
	activeId: number;
	back: boolean;
	forward: boolean;
	loading: boolean;
	connected: boolean;
}

export type BrowserWorkspaceAction =
	| { type: "state" | "new" | "back" | "forward" | "reload" | "connect" | "disconnect" }
	| { type: "select" | "close"; id: number }
	| { type: "navigate"; address: string };
