export const NOTCH_APPS_CHANNELS = {
	command: "notch-apps:command",
	changed: "notch-apps:changed",
	customize: "notch-apps:customize",
} as const;

export const NOTCH_APP_BRIDGE = "notch-apps:capability";

export interface NotchAppTarget {
	appId: string;
	revisionId: string;
}

export interface NotchAppsSnapshot {
	apps: {
		id: string;
		name: string;
		currentRevision: string;
		revisions: { id: string; createdAt: string }[];
	}[];
	active: NotchAppTarget | null;
	preview: NotchAppTarget | null;
	error?: string;
}

export interface NotchAppsApi {
	command(args: Record<string, unknown>): Promise<NotchAppsSnapshot>;
	onChanged(callback: (snapshot: NotchAppsSnapshot) => void): () => void;
	customize(tabId: string, enabled: boolean): Promise<{ enabled: boolean }>;
}

/** SDK available inside every mini-app as window.wisa. No ambient host privileges. */
export const NOTCH_APP_SDK = `window.wisa.request(name, args = {}) returns a Promise.
Source bounds: id 1–64 lowercase letters/digits/_/- (first character alphanumeric),
name 1–120 characters, html 1–524288 characters, width integer 120–1600,
height integer 40–1000. The trusted 36px control bar is added above app content.
Available requests:
- storage.get: returns this app's persisted JSON state (initially null).
- storage.set: {value: JSON value}, replaces this app's state (64 KiB limit).
- clipboard.read: returns plain text; clipboard.write: {text}.
- notification: {title, body}.
- openUrl: {url}, only https: and http:.
- sessions: returns the host's session snapshot.
- command: {executable: absolute path, args: string[]}; no shell, inherited environment,
  or custom cwd; 10-second timeout, bounded output. Every invocation requires native
  approval showing the exact executable and arguments. Returns {stdout, stderr}.
Every non-storage request requires a fresh native approval; denying rejects the Promise.
HTML cannot grant capabilities or activate/revise apps. Network, navigation, popups,
Electron, Node, filesystem, and access to the WISA renderer are unavailable.
Use storage requests instead of localStorage (the document has an opaque origin).
Export with read; import its id/name/html/width/height using save, then preview/apply.
`;
