/** Remember successful picker selections for future empty sessions. */
import type { RpcSessionState } from "../../shared/rpc-types";
import type { SessionStore } from "../stores/session";
import { type SessionRuntime, sessionRuntime, sessionRuntimeStore } from "../stores/session-runtime-context";

const PREFS_KEY = "modelPicks";

/** Keep a bounded history in the existing preference format. */
const MAX_TRACKED = 24;

export interface ModelPick {
	provider: string;
	id: string;
	/** Retained for versions that read this preference by pick frequency. */
	count: number;
	/** Client clock of the most recent successful pick. */
	lastAt: number;
}

export type ModelPicks = Record<string, ModelPick>;

export function modelKey(provider: string, id: string): string {
	return `${provider}/${id}`;
}

/** Fold a successful selection into the history without evicting the latest pick. */
export function recordPick(picks: ModelPicks, provider: string, id: string, at: number): ModelPicks {
	const key = modelKey(provider, id);
	const previous = picks[key];
	const next: ModelPicks = {
		...picks,
		[key]: { provider, id, count: (previous?.count ?? 0) + 1, lastAt: at },
	};
	const keys = Object.keys(next);
	if (keys.length <= MAX_TRACKED) return next;
	// Retain the newest picks, not the models that were popular in the past.
	const keep = keys
		.sort((a, b) => {
			const left = next[a] as ModelPick;
			const right = next[b] as ModelPick;
			return right.lastAt - left.lastAt;
		})
		.slice(0, MAX_TRACKED);
	return Object.fromEntries(keep.map(key => [key, next[key] as ModelPick]));
}

function latestPick(picks: ModelPicks): ModelPick | undefined {
	let latest: ModelPick | undefined;
	for (const pick of Object.values(picks)) {
		if (!latest || pick.lastAt >= latest.lastAt) latest = pick;
	}
	return latest;
}

let cached: Promise<ModelPicks> | null = null;

function loadPicks(): Promise<ModelPicks> {
	cached ??= readPicks();
	return cached;
}

async function readPicks(): Promise<ModelPicks> {
	try {
		const raw = (await window.omp.prefs.get(PREFS_KEY)) as ModelPicks | null | undefined;
		return raw && typeof raw === "object" ? raw : {};
	} catch {
		return {};
	}
}

/** A preference write must never fail an already-successful model switch. */
export function rememberModelPick(provider: string, id: string): void {
	const at = Date.now();
	cached = loadPicks().then(picks => {
		const next = recordPick(picks, provider, id, Math.max(at, (latestPick(picks)?.lastAt ?? 0) + 1));
		void savePicks(next);
		return next;
	});
}

async function savePicks(picks: ModelPicks): Promise<void> {
	try {
		await window.omp.prefs.set(PREFS_KEY, picks);
	} catch {
		// Keep the selection in memory if persistence is unavailable.
	}
}

/** Test seam: forget the module-level copy so a suite can re-read prefs. */
export function resetModelPicksCache(): void {
	cached = null;
}

/** One startup default per runtime; do not override a session on sidecar restart. */
let applied = new WeakSet<SessionRuntime>();

export function resetAppliedModelDefaults(): void {
	applied = new WeakSet();
}

/**
 * Start a brand-new session on the remembered model. Only a session with no
 * messages is touched: a resumed session carries the model it was saved with,
 * and overriding that would rewrite history the user can see.
 */
export async function applyPreferredModel(tabId: string, state: RpcSessionState): Promise<boolean> {
	const runtime = sessionRuntime(tabId);
	if (!runtime || applied.has(runtime)) return false;
	applied.add(runtime);
	if (state.messageCount > 0 || state.isStreaming) return false;
	const generation = runtime.sessionGeneration;
	const target = latestPick(await loadPicks());
	if (!target || (state.model?.provider === target.provider && state.model.id === target.id)) return false;
	const live = sessionRuntimeStore<SessionStore>(tabId, "session")?.getState();
	if (
		sessionRuntime(tabId) !== runtime ||
		runtime.sessionGeneration !== generation ||
		!live ||
		(live.sessionId && live.sessionId !== state.sessionId) ||
		live.isStreaming ||
		live.messageCount > 0
	)
		return false;
	// Core resolves the exact ID and waits for pending discovery on a miss.
	// A cold renderer catalog cannot tell us that a remembered model is unavailable.
	try {
		const response = await runtime.command({ type: "set_model", provider: target.provider, modelId: target.id });
		return response.success;
	} catch {
		return false;
	}
}
