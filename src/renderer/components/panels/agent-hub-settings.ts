/** Load Agent Hub settings and model projections together for the owning chat. */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RpcAgentDefinitionInfo } from "../../../shared/rpc-types";
import { describeError } from "../../lib/errors";
import { useT } from "../../lib/i18n";
import { useTabRpc } from "../../lib/tab-rpc";
import { useSessionStore } from "../../stores/session";
import { toast } from "../../stores/toast";

export interface AgentSettingsState {
	disabledAgents: string[];
	modelOverrides: Record<string, string | string[]>;
	prewalkOverrides: Record<string, string>;
	definitions: RpcAgentDefinitionInfo[];
}

const SETTINGS_PATHS = ["task.disabledAgents", "task.agentModelOverrides", "task.agentPrewalk"] as const;

type AgentSettingsPath = (typeof SETTINGS_PATHS)[number];

function isStringRecord(value: unknown): value is Record<string, string> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	return Object.values(value).every(entry => typeof entry === "string");
}

function isModelOverrideRecord(value: unknown): value is AgentSettingsState["modelOverrides"] {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	return Object.values(value).every(
		entry =>
			typeof entry === "string" || (Array.isArray(entry) && entry.every(pattern => typeof pattern === "string")),
	);
}

function pickAgentDefinitions(data: unknown): RpcAgentDefinitionInfo[] {
	const agents = typeof data === "object" && data !== null && "agents" in data ? data.agents : undefined;
	if (!Array.isArray(agents)) return [];
	return agents.filter((agent): agent is RpcAgentDefinitionInfo => {
		return (
			typeof agent === "object" &&
			agent !== null &&
			"name" in agent &&
			typeof agent.name === "string" &&
			"description" in agent &&
			typeof agent.description === "string" &&
			"source" in agent &&
			(agent.source === "bundled" || agent.source === "user" || agent.source === "project")
		);
	});
}

function pickAgentSettings(data: unknown, definitions: RpcAgentDefinitionInfo[]): AgentSettingsState {
	const rawValues = typeof data === "object" && data !== null && "values" in data ? data.values : undefined;
	const values = typeof rawValues === "object" && rawValues !== null ? rawValues : {};
	const disabled = "task.disabledAgents" in values ? values["task.disabledAgents"] : undefined;
	const models = "task.agentModelOverrides" in values ? values["task.agentModelOverrides"] : undefined;
	const prewalk = "task.agentPrewalk" in values ? values["task.agentPrewalk"] : undefined;
	return {
		disabledAgents: Array.isArray(disabled) ? disabled.filter((v): v is string => typeof v === "string") : [],
		modelOverrides: isModelOverrideRecord(models) ? models : {},
		prewalkOverrides: isStringRecord(prewalk) ? prewalk : {},
		definitions,
	};
}

export function useAgentSettings() {
	const t = useT();
	const rpc = useTabRpc();
	const ready = useSessionStore(s => s.status) === "ready";
	const [state, setState] = useState<AgentSettingsState | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [busy, setBusy] = useState(false);
	const generation = useRef(0);

	const load = useCallback(async () => {
		const request = ++generation.current;
		if (!ready) {
			setState(null);
			setError(t("agentHub.notConnected"));
			setLoading(false);
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const [settings, definitions] = await Promise.all([
				rpc.getSettings([...SETTINGS_PATHS]),
				rpc.getAgentDefinitions(),
			]);
			if (generation.current !== request) return;
			if (!settings.success) throw new Error(settings.error);
			if (!definitions.success) throw new Error(definitions.error);
			setState(pickAgentSettings(settings.data, pickAgentDefinitions(definitions.data)));
		} catch (cause) {
			if (generation.current !== request) return;
			setState(null);
			setError(describeError(cause));
		} finally {
			if (generation.current === request) setLoading(false);
		}
	}, [ready, rpc, t]);

	useEffect(() => {
		void load();
		return () => {
			generation.current++;
		};
	}, [load]);

	const mutate = useCallback(
		async (path: AgentSettingsPath, value: unknown) => {
			if (!ready || busy || loading) return;
			setBusy(true);
			const request = generation.current;
			try {
				const result = await rpc.setSetting(path, value);
				if (!result.success) throw new Error(result.error);
			} catch (cause) {
				toast({ variant: "error", title: t("agentHub.actionFailed"), message: describeError(cause) });
			} finally {
				// A settings echo does not include the newly resolved model or Prewalk target.
				if (generation.current === request) await load();
				setBusy(false);
			}
		},
		[ready, busy, loading, rpc, load, t],
	);

	return { state, error, loading, busy, ready, refresh: load, mutate };
}
