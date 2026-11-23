// DIAGNOSTIC ONLY (branch diagnostic/packaged-gui-0.9.54). Never merged.
// Opaque per-process counters + enum/number fields only: no paths, tab ids, cwd, or payload text.
import { appendFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

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

export function diagLog(event: string, fields: Record<string, string | number | boolean | null>): void {
	try {
		const line = `${JSON.stringify({ t: Math.round(performance.now() * 1000) / 1000, event, ...fields })}\n`;
		appendFileSync(path.join(app.getPath("userData"), "sidecar-diag.jsonl"), line);
	} catch {
		// Diagnostics must never change product behavior.
	}
}
