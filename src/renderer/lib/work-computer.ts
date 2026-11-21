/**
 * Work sessions start with desktop control on.
 *
 * A Work session exists to get something done on this machine, so a user who
 * never opens Settings still expects the agent to be able to look at the screen
 * and type. `computer.enabled` is a global agent setting, though, so this is
 * deliberately narrow: it runs once per Work tab, only when the setting is off,
 * and it says so in a toast — an implicit permission grant must never be
 * silent. Turning it back off sticks: nothing re-enables it for that tab.
 */
import type { RpcResponse } from "../../shared/rpc-types";
import { toast } from "../stores/toast";
import { isWorkCwd, useWorkspaceMode } from "../stores/workspace-mode";
import { translate } from "./i18n";

/** Tabs whose default has already been considered — a switch back must not repeat it. */
const considered = new Set<string>();

/** Test seam: forget every tab so a suite can re-run the decision. */
export function resetWorkComputerDefaults(): void {
	considered.clear();
}

async function send(tabId: string, command: Record<string, unknown>): Promise<RpcResponse> {
	return window.omp.rpc.commandForTab(tabId, command as never);
}

/**
 * Apply the Work default to a tab that just became ready. Resolves to whether
 * this call enabled the setting, so callers (and tests) can tell "nothing to do"
 * from "turned on".
 */
export async function applyWorkComputerDefault(tabId: string, cwd: string | null | undefined): Promise<boolean> {
	if (considered.has(tabId)) return false;
	// The workspace path is the only thing that distinguishes Work from a
	// project session; without it, do nothing rather than guess.
	if (!useWorkspaceMode.getState().defaultWorkspace) await useWorkspaceMode.getState().load();
	if (!isWorkCwd(cwd, useWorkspaceMode.getState().defaultWorkspace)) return false;
	considered.add(tabId);
	try {
		const read = await send(tabId, { type: "get_settings", paths: ["computer.enabled"] });
		if (!read.success) return false;
		const values = (read.data as { values?: Record<string, unknown> } | undefined)?.values;
		if (values?.["computer.enabled"] === true) return false;
		const written = await send(tabId, { type: "set_setting", path: "computer.enabled", value: true });
		if (!written.success) return false;
		toast({ variant: "success", message: translate("computer.on") });
		return true;
	} catch {
		// A sidecar that cannot answer is not a reason to fail the session boot.
		return false;
	}
}
