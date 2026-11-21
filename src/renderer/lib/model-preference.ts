/**
 * Remembering which model the user actually reaches for.
 *
 * A brand-new session otherwise opens on whatever the sidecar lists first, which
 * is a catalog ordering detail and nothing about the person using it. So the
 * picker records every deliberate pick, and a fresh session starts on the model
 * that history says this user prefers. Nothing here is a guess about quality: it
 * is purely "what did you choose before", so it stays correct as the catalog and
 * the user's subscriptions change, and it can only ever pick a model that is
 * available right now.
 */
import type { ModelInfo, RpcResponse, RpcSessionState } from "../../shared/rpc-types";
import type { ModelStore } from "../stores/model";
import { sessionRuntimeStore } from "../stores/session-runtime-context";

const PREFS_KEY = "modelPicks";

/** Enough history to notice a habit, small enough to stay a preference blob. */
const MAX_TRACKED = 24;

export interface ModelPick {
	provider: string;
	id: string;
	/** How many times the user picked this model deliberately. */
	count: number;
	/** Client clock of the most recent pick — the tie-breaker, not the ranking. */
	lastAt: number;
}

export type ModelPicks = Record<string, ModelPick>;

export function modelKey(provider: string, id: string): string {
	return `${provider}/${id}`;
}

/**
 * Fold one deliberate pick into the history. Count leads because a habit is
 * repetition; `lastAt` only separates models the user has picked equally often,
 * which is what makes switching taste follow the most recent choice.
 */
export function recordPick(picks: ModelPicks, provider: string, id: string, at: number): ModelPicks {
	const key = modelKey(provider, id);
	const previous = picks[key];
	const next: ModelPicks = {
		...picks,
		[key]: { provider, id, count: (previous?.count ?? 0) + 1, lastAt: at },
	};
	const keys = Object.keys(next);
	if (keys.length <= MAX_TRACKED) return next;
	// Evict the least-used, then the least-recent: a one-off experiment on an
	// unfamiliar model must not outlive the model the user returns to daily.
	const keep = keys
		.sort((a, b) => {
			const left = next[a] as ModelPick;
			const right = next[b] as ModelPick;
			return right.count - left.count || right.lastAt - left.lastAt;
		})
		.slice(0, MAX_TRACKED);
	return Object.fromEntries(keep.map(key => [key, next[key] as ModelPick]));
}

/** Picks ranked the way the default is chosen, best first. */
export function rankPicks(picks: ModelPicks): ModelPick[] {
	return Object.values(picks).sort((left, right) => right.count - left.count || right.lastAt - left.lastAt);
}

/**
 * The model a fresh session should open on, or null to leave the sidecar's own
 * default alone. Restricted to models present in the current catalog, so a
 * remembered pick that was unsubscribed or renamed simply stops applying instead
 * of failing the switch.
 */
export function preferredModel(
	picks: ModelPicks,
	available: readonly ModelInfo[],
	current: ModelInfo | null | undefined,
): { provider: string; id: string } | null {
	for (const pick of rankPicks(picks)) {
		const usable = available.some(model => model.provider === pick.provider && model.id === pick.id);
		if (!usable) continue;
		if (current && current.provider === pick.provider && current.id === pick.id) return null;
		return { provider: pick.provider, id: pick.id };
	}
	return null;
}

let cached: ModelPicks | null = null;

async function loadPicks(): Promise<ModelPicks> {
	if (cached) return cached;
	try {
		const raw = (await window.omp.prefs.get(PREFS_KEY)) as ModelPicks | null | undefined;
		cached = raw && typeof raw === "object" ? raw : {};
	} catch {
		cached = {};
	}
	return cached;
}

/** Record a deliberate pick from the picker. Fire-and-forget: a preference write must never fail a model switch. */
export function rememberModelPick(provider: string, id: string): void {
	void (async () => {
		const picks = recordPick(await loadPicks(), provider, id, Date.now());
		cached = picks;
		try {
			await window.omp.prefs.set(PREFS_KEY, picks);
		} catch {
			// The in-memory copy still applies for this run.
		}
	})();
}

/** Test seam: forget the module-level copy so a suite can re-read prefs. */
export function resetModelPicksCache(): void {
	cached = null;
}

/** Tabs already offered the remembered model · a restart must not repeat it. */
const applied = new Set<string>();

export function resetAppliedModelDefaults(): void {
	applied.clear();
}

async function send(tabId: string, command: Record<string, unknown>): Promise<RpcResponse> {
	return window.omp.rpc.commandForTab(tabId, command as never);
}

/**
 * Start a brand-new session on the remembered model. Only a session with no
 * messages is touched: a resumed session carries the model it was saved with,
 * and overriding that would rewrite history the user can see.
 */
export async function applyPreferredModel(tabId: string, state: RpcSessionState): Promise<boolean> {
	if (applied.has(tabId)) return false;
	applied.add(tabId);
	if (state.messageCount > 0) return false;
	const picks = await loadPicks();
	if (Object.keys(picks).length === 0) return false;
	// The catalog may not have landed yet on a cold tab, so ask for it rather
	// than trusting whatever the first `get_state` happened to carry.
	const store = sessionRuntimeStore<ModelStore>(tabId, "model");
	const refreshed = store ? (await store.getState().refreshAvailableModels()).models : [];
	const available = refreshed.length > 0 ? refreshed : (store?.getState().availableModels ?? []);
	if (available.length === 0) return false;
	const target = preferredModel(picks, available, state.model);
	if (!target) return false;
	try {
		const response = await send(tabId, { type: "set_model", provider: target.provider, modelId: target.id });
		return response.success;
	} catch {
		return false;
	}
}
