/**
 * Sidebar presentation prefs: pins, archive, aliases, navigation, workspace order,
 * list disclosure and explicit MRU access times. Hydrated once at App mount from
 * one JSON blob under "sidebar". User changes roll back if persistence fails;
 * recency hints write fire-and-forget.
 */
import { create } from "zustand";
import { describeError } from "../lib/errors";
import { translate } from "../lib/i18n";
import { optimisticWrite } from "../lib/optimistic";
import { toast } from "./toast";

const PREFS_KEY = "sidebar";
const DEFAULT_NAV_PINS = ["memory", "skills", "plugins", "templates"] as const;

interface SidebarPrefsBlob {
	registeredWorkspaces?: string[];
	pinnedGroups?: string[];
	pinnedSessions?: string[];
	/** Navigation pin order. Older routine writes included [], so an empty list is authoritative. */
	pinnedNav?: string[];
	archivedSessions?: string[];
	groupAliases?: Record<string, string>;
	workspaceLastUsed?: Record<string, number>;
	sessionLastUsed?: Record<string, number>;
	workspaceOrder?: string[];
	collapsedLists?: Record<string, boolean>;
	expandedLists?: string[];
	/** Which lane the sidebar lists: code sessions or work sessions. */
	lane?: SidebarLane;
}

/** The sidebar's two lists: project code sessions, or default-workspace work sessions. */
export type SidebarLane = "code" | "work";

interface SidebarPrefsStore {
	registeredWorkspaces: string[];
	pinnedGroups: string[];
	pinnedSessions: string[];
	/** Tool index entries promoted into the main navigation list. */
	pinnedNav: string[];
	/** Session files hidden from the lanes and listed under "Archived". */
	archivedSessions: string[];
	groupAliases: Record<string, string>;
	workspaceLastUsed: Record<string, number>;
	sessionLastUsed: Record<string, number>;
	workspaceOrder: string[];
	collapsedLists: Record<string, boolean>;
	expandedLists: string[];
	/** Sidebar lane: "code" lists project sessions, "work" the default workspace's. */
	lane: SidebarLane;
	hydrated: boolean;
	hydrate: () => Promise<void>;
	addWorkspace: (cwd: string) => Promise<void>;
	toggleGroupPin: (cwd: string) => Promise<void>;
	toggleSessionPin: (path: string) => Promise<void>;
	/** Promote a tool index entry into the main navigation list, or send it back. */
	toggleNavPin: (id: string) => Promise<void>;
	setSessionsArchived: (paths: readonly string[], archived: boolean) => Promise<void>;
	/** Drop deleted session files from the pinned and archived lists. */
	forgetSessions: (paths: readonly string[]) => void;
	/** Move pins and archive marks from files no longer listed to the sessions that carry them on. */
	inheritSessions: (heirs: ReadonlyMap<string, string>) => void;
	setGroupAlias: (cwd: string, alias: string | null) => Promise<void>;
	setWorkspaceOrder: (order: string[]) => Promise<void>;
	setListCollapsed: (id: string, collapsed: boolean) => Promise<void>;
	toggleListExpanded: (id: string) => Promise<void>;
	setLane: (lane: SidebarLane) => Promise<void>;
	touchWorkspace: (cwd: string) => void;
	touchSession: (path: string, cwd?: string) => void;
	reset: () => void;
}

const MAX_RECENT_WORKSPACES = 100;
const MAX_RECENT_SESSIONS = 500;

function validIds(value: unknown): string[] {
	return Array.isArray(value) ? [...new Set(value.filter(id => typeof id === "string" && id.length > 0))] : [];
}

function validCollapseMap(value: unknown): Record<string, boolean> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return Object.fromEntries(Object.entries(value).filter(([id, collapsed]) => id && typeof collapsed === "boolean"));
}

function validRecencyMap(value: unknown): Record<string, number> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const result: Record<string, number> = {};
	for (const [key, timestamp] of Object.entries(value)) {
		if (key && typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp > 0) {
			result[key] = timestamp;
		}
	}
	return result;
}

function nextTimestamp(...maps: Record<string, number>[]): number {
	let latest = 0;
	for (const map of maps) {
		for (const value of Object.values(map)) latest = Math.max(latest, value);
	}
	return Math.max(Date.now(), latest + 1);
}

function touchedMap(
	current: Record<string, number>,
	key: string,
	timestamp: number,
	limit: number,
): Record<string, number> {
	const entries = Object.entries({ ...current, [key]: timestamp }).sort((a, b) => b[1] - a[1]);
	return Object.fromEntries(entries.slice(0, limit));
}

function prefsBlob(state: SidebarPrefsStore): SidebarPrefsBlob {
	return {
		registeredWorkspaces: state.registeredWorkspaces,
		pinnedGroups: state.pinnedGroups,
		pinnedSessions: state.pinnedSessions,
		pinnedNav: state.pinnedNav,
		archivedSessions: state.archivedSessions,
		groupAliases: state.groupAliases,
		workspaceLastUsed: state.workspaceLastUsed,
		sessionLastUsed: state.sessionLastUsed,
		workspaceOrder: state.workspaceOrder,
		collapsedLists: state.collapsedLists,
		expandedLists: state.expandedLists,
		lane: state.lane,
	};
}

/** Recency bookkeeping: a lost write costs an ordering hint, nothing the user
 *  set out to do, so it stays fire-and-forget. */
function persist(get: () => SidebarPrefsStore): void {
	void writePrefs(get);
}

async function writePrefs(get: () => SidebarPrefsStore): Promise<{ success: boolean; error?: string }> {
	try {
		await window.omp.prefs.set(PREFS_KEY, prefsBlob(get()));
		return { success: true };
	} catch (cause) {
		return { success: false, error: describeError(cause) };
	}
}

export const useSidebarPrefs = create<SidebarPrefsStore>()((set, get) => ({
	registeredWorkspaces: [],
	pinnedGroups: [],
	pinnedSessions: [],
	pinnedNav: [...DEFAULT_NAV_PINS],
	archivedSessions: [],
	groupAliases: {},
	workspaceLastUsed: {},
	sessionLastUsed: {},
	workspaceOrder: [],
	collapsedLists: {},
	expandedLists: [],
	lane: "code",
	hydrated: false,

	hydrate: async () => {
		if (get().hydrated) return;
		try {
			const blob = (await window.omp.prefs.get(PREFS_KEY)) as SidebarPrefsBlob | null | undefined;
			set({
				registeredWorkspaces: validIds(blob?.registeredWorkspaces),
				pinnedGroups: Array.isArray(blob?.pinnedGroups) ? blob.pinnedGroups : [],
				pinnedSessions: Array.isArray(blob?.pinnedSessions) ? blob.pinnedSessions : [],
				pinnedNav: Array.isArray(blob?.pinnedNav) ? validIds(blob.pinnedNav) : [...DEFAULT_NAV_PINS],
				archivedSessions: Array.isArray(blob?.archivedSessions) ? blob.archivedSessions : [],
				groupAliases: blob?.groupAliases && typeof blob.groupAliases === "object" ? blob.groupAliases : {},
				workspaceLastUsed: validRecencyMap(blob?.workspaceLastUsed),
				sessionLastUsed: validRecencyMap(blob?.sessionLastUsed),
				workspaceOrder: validIds(blob?.workspaceOrder),
				collapsedLists: validCollapseMap(blob?.collapsedLists),
				expandedLists: validIds(blob?.expandedLists),
				lane: blob?.lane === "work" ? "work" : "code",
				hydrated: true,
			});
		} catch {
			set({ hydrated: true });
		}
	},

	addWorkspace: async cwd => {
		if (!cwd || get().registeredWorkspaces.includes(cwd)) return;
		await optimisticWrite({
			store: { getState: get, setState: set },
			mutate: state => ({ registeredWorkspaces: [...state.registeredWorkspaces, cwd] }),
			persist: () => writePrefs(get),
			onFailure: message => toast({ variant: "error", title: translate("titlebar.openProjectFailed"), message }),
		});
	},

	toggleGroupPin: cwd =>
		optimisticWrite({
			store: { getState: get, setState: set },
			mutate: state => ({
				pinnedGroups: state.pinnedGroups.includes(cwd)
					? state.pinnedGroups.filter(item => item !== cwd)
					: [...state.pinnedGroups, cwd],
			}),
			persist: () => writePrefs(get),
			onFailure: message => toast({ variant: "error", title: translate("sidebar.pinFailed"), message }),
		}),

	toggleNavPin: id =>
		optimisticWrite({
			store: { getState: get, setState: set },
			mutate: state => ({
				pinnedNav: state.pinnedNav.includes(id)
					? state.pinnedNav.filter(item => item !== id)
					: [...state.pinnedNav, id],
			}),
			persist: () => writePrefs(get),
			onFailure: message => toast({ variant: "error", title: translate("sidebar.pinFailed"), message }),
		}),

	toggleSessionPin: path =>
		optimisticWrite({
			store: { getState: get, setState: set },
			mutate: state => ({
				pinnedSessions: state.pinnedSessions.includes(path)
					? state.pinnedSessions.filter(item => item !== path)
					: [...state.pinnedSessions, path],
			}),
			persist: () => writePrefs(get),
			onFailure: message => toast({ variant: "error", title: translate("sidebar.pinFailed"), message }),
		}),

	setSessionsArchived: (paths, archived) =>
		optimisticWrite({
			store: { getState: get, setState: set },
			mutate: state => {
				const changed = new Set(paths);
				const rest = state.archivedSessions.filter(path => !changed.has(path));
				return { archivedSessions: archived ? [...rest, ...changed] : rest };
			},
			persist: () => writePrefs(get),
			onFailure: message => toast({ variant: "error", title: translate("sidebar.archiveFailed"), message }),
		}),

	forgetSessions: paths => {
		const gone = new Set(paths);
		const state = get();
		if (!state.pinnedSessions.some(path => gone.has(path)) && !state.archivedSessions.some(path => gone.has(path))) {
			return;
		}
		set({
			pinnedSessions: state.pinnedSessions.filter(path => !gone.has(path)),
			archivedSessions: state.archivedSessions.filter(path => !gone.has(path)),
		});
		persist(get);
	},

	inheritSessions: heirs => {
		const state = get();
		if (
			!state.pinnedSessions.some(path => heirs.has(path)) &&
			!state.archivedSessions.some(path => heirs.has(path))
		) {
			return;
		}
		const inherited = (paths: readonly string[]) => [...new Set(paths.map(path => heirs.get(path) ?? path))];
		set({
			pinnedSessions: inherited(state.pinnedSessions),
			archivedSessions: inherited(state.archivedSessions),
		});
		persist(get);
	},

	setGroupAlias: (cwd, alias) =>
		optimisticWrite({
			store: { getState: get, setState: set },
			mutate: state => {
				const groupAliases = { ...state.groupAliases };
				if (alias?.trim()) groupAliases[cwd] = alias.trim();
				else delete groupAliases[cwd];
				return { groupAliases };
			},
			persist: () => writePrefs(get),
			onFailure: message => toast({ variant: "error", title: translate("sidebar.renameFailed"), message }),
		}),

	setWorkspaceOrder: order =>
		optimisticWrite({
			store: { getState: get, setState: set },
			mutate: () => ({ workspaceOrder: order }),
			persist: () => writePrefs(get),
			onFailure: message => toast({ variant: "error", title: translate("sidebar.preferences.saveFailed"), message }),
		}),

	setListCollapsed: (id, collapsed) =>
		optimisticWrite({
			store: { getState: get, setState: set },
			mutate: state => ({ collapsedLists: { ...state.collapsedLists, [id]: collapsed } }),
			persist: () => writePrefs(get),
			onFailure: message => toast({ variant: "error", title: translate("sidebar.preferences.saveFailed"), message }),
		}),

	toggleListExpanded: id =>
		optimisticWrite({
			store: { getState: get, setState: set },
			mutate: state => ({
				expandedLists: state.expandedLists.includes(id)
					? state.expandedLists.filter(expanded => expanded !== id)
					: [...state.expandedLists, id],
			}),
			persist: () => writePrefs(get),
			onFailure: message => toast({ variant: "error", title: translate("sidebar.preferences.saveFailed"), message }),
		}),

	setLane: lane =>
		optimisticWrite({
			store: { getState: get, setState: set },
			mutate: () => ({ lane }),
			persist: () => writePrefs(get),
			onFailure: message => toast({ variant: "error", title: translate("sidebar.preferences.saveFailed"), message }),
		}),

	touchWorkspace: cwd => {
		if (!cwd) return;
		const state = get();
		const timestamp = nextTimestamp(state.workspaceLastUsed, state.sessionLastUsed);
		set({ workspaceLastUsed: touchedMap(state.workspaceLastUsed, cwd, timestamp, MAX_RECENT_WORKSPACES) });
		persist(get);
	},

	touchSession: (path, cwd) => {
		if (!path) return;
		const state = get();
		const timestamp = nextTimestamp(state.workspaceLastUsed, state.sessionLastUsed);
		set({
			sessionLastUsed: touchedMap(state.sessionLastUsed, path, timestamp, MAX_RECENT_SESSIONS),
			workspaceLastUsed: cwd
				? touchedMap(state.workspaceLastUsed, cwd, timestamp, MAX_RECENT_WORKSPACES)
				: state.workspaceLastUsed,
		});
		persist(get);
	},

	reset: () =>
		set({
			registeredWorkspaces: [],
			pinnedGroups: [],
			pinnedSessions: [],
			pinnedNav: [...DEFAULT_NAV_PINS],
			archivedSessions: [],
			groupAliases: {},
			workspaceLastUsed: {},
			sessionLastUsed: {},
			workspaceOrder: [],
			collapsedLists: {},
			expandedLists: [],
			lane: "code",
			hydrated: false,
		}),
}));
