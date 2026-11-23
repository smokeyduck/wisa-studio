// DIAGNOSTIC ONLY (branch diagnostic/packaged-gui-0.9.54). Never merged.
// Opaque per-process counters + enum/number fields only: no paths, tab ids, cwd, or payload text.
// The timeline lives in main-process memory and is read by the smoke through gui.evaluate.

type DiagField = string | number | boolean | null;
type DiagGlobal = typeof globalThis & { __wisaDiagTimeline?: Record<string, DiagField>[] };

const managerIds = new WeakMap<object, number>();
const tabIds = new Map<string, number>();
let nextId = 0;

export function diagManager(manager: object): number {
	let id = managerIds.get(manager);
	if (id === undefined) {
		id = ++nextId;
		managerIds.set(manager, id);
	}
	return id;
}

export function diagTab(tabId: string): number {
	let id = tabIds.get(tabId);
	if (id === undefined) {
		id = ++nextId;
		tabIds.set(tabId, id);
	}
	return id;
}

export function diagLog(event: string, fields: Record<string, DiagField>): void {
	const g = globalThis as DiagGlobal;
	const buffer = (g.__wisaDiagTimeline ??= []);
	if (buffer.length >= 1000) return;
	buffer.push({ t: Math.round(performance.now() * 1000) / 1000, event, ...fields });
}

export function diagError(where: string, error: unknown): void {
	diagLog("diag-error", { where, name: error instanceof Error ? error.name : "non-error" });
}
