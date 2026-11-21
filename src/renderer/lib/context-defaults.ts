/**
 * Compaction defaults the GUI applies once, then never again.
 *
 * The agent's own default is `thresholdPercent: -1` (reserve-based, roughly
 * 85% of the window). Readers kept reading that as "Auto" and asking for 20%,
 * so the first time this build sees an unset threshold it writes 20% to the
 * global settings. The marker in prefs is what makes it a migration rather
 * than a policy: a user who later picks Auto keeps Auto, on this machine and
 * after a restart.
 */
import { CONTEXT_SETTING_PATHS, type CompactionConfig } from "./context-strategy";

const PREFS_KEY = "compactionDefaults";

/** Percent of the window at which maintenance starts, once applied. */
export const DEFAULT_THRESHOLD_PERCENT = 20;

/** Test seam: forget that this run already looked. */
let checked = false;

export function resetCompactionDefaultsCheck(): void {
	checked = false;
}

export async function ensureCompactionDefaults(
	config: CompactionConfig,
	write: (patch: Array<{ path: string; value: unknown }>) => Promise<boolean>,
): Promise<void> {
	if (checked) return;
	checked = true;
	let applied = false;
	try {
		applied = (await window.omp.prefs.get(PREFS_KEY)) === true;
	} catch {
		// An unreadable pref must not rewrite settings on every launch.
		return;
	}
	if (applied) return;
	if (config.thresholdPercent > 0) {
		// Already the reader's own number: remember that there is nothing to do.
		try {
			await window.omp.prefs.set(PREFS_KEY, true);
		} catch {
			// Retried next launch; harmless, the value is already set.
		}
		return;
	}
	if (!(await write([{ path: CONTEXT_SETTING_PATHS.thresholdPercent, value: DEFAULT_THRESHOLD_PERCENT }]))) return;
	try {
		await window.omp.prefs.set(PREFS_KEY, true);
	} catch {
		// The write landed; a lost marker only re-checks next launch, and the
		// threshold then reads back as set, so nothing is overwritten.
	}
}
