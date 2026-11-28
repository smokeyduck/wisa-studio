import { KeyRound, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ModelRoleEntry } from "../../../shared/rpc-types";
import { useProviderCredentials } from "../../hooks/use-provider-credentials";
import { describeError } from "../../lib/errors";
import { useT } from "../../lib/i18n";
import { useTabRpc } from "../../lib/tab-rpc";
import { useModelStore } from "../../stores/model";
import { useSessionStore } from "../../stores/session";
import { Badge, Button } from "../common";
import { ApiKeyDialog } from "./ApiKeyDialog";
import { ProviderRow } from "./ProvidersWindow";

interface JevRoutingSectionProps {
	open: boolean;
	roles: ModelRoleEntry[];
	onRefresh: () => Promise<void>;
}

/** TypeSafe credentials and the native Judge route, without changing any chat role. */
export function JevRoutingSection({ open, roles, onRefresh }: JevRoutingSectionProps) {
	const t = useT();
	const rpc = useTabRpc();
	const sidecarReady = useSessionStore(state => state.status) === "ready";
	const providers = useModelStore(state => state.providers);
	const refreshProviders = useModelStore(state => state.refreshProviders);
	const discoveryPending = useModelStore(state => state.catalogRefreshPending);
	const [routingEnabled, setRoutingEnabled] = useState<boolean | null>(null);
	const [loading, setLoading] = useState(false);
	const [savingRoute, setSavingRoute] = useState(false);
	const [keyOpen, setKeyOpen] = useState(false);
	const [choice, setChoice] = useState("");
	const [error, setError] = useState<string | null>(null);
	const readVersion = useRef(0);
	const scopeRef = useRef({ rpc, active: true });

	useEffect(() => {
		const scope = { rpc, active: true };
		scopeRef.current = scope;
		setRoutingEnabled(null);
		setKeyOpen(false);
		setChoice("");
		setError(null);
		setSavingRoute(false);
		return () => {
			scope.active = false;
			readVersion.current++;
		};
	}, [rpc]);

	const load = useCallback(
		async (forceRefresh = false) => {
			if (!sidecarReady) return;
			const version = ++readVersion.current;
			setLoading(true);
			setError(null);
			try {
				const [, settings] = await Promise.all([
					refreshProviders(forceRefresh),
					rpc.getSettings(["task.judgeRouting"]),
				]);
				if (version !== readVersion.current) return;
				if (!settings.success) throw new Error(settings.error);
				const values = (settings.data as { values?: Record<string, unknown> } | undefined)?.values;
				if (typeof values?.["task.judgeRouting"] !== "boolean") {
					throw new Error(t("modelRoles.jev.unavailable"));
				}
				setRoutingEnabled(values["task.judgeRouting"]);
			} catch (cause) {
				if (version === readVersion.current) setError(describeError(cause));
			} finally {
				if (version === readVersion.current) setLoading(false);
			}
		},
		[sidecarReady, refreshProviders, rpc, t],
	);

	useEffect(() => {
		if (open) void load();
	}, [open, load]);

	useEffect(() => {
		if (!open || !sidecarReady || !discoveryPending) return;
		const timer = setInterval(() => {
			void load();
		}, 1000);
		return () => clearInterval(timer);
	}, [open, sidecarReady, discoveryPending, load]);

	const { busyProvider, signIn, handleLogin, handleSaveApiKey } = useProviderCredentials({
		rpc,
		providers,
		reload: async () => {
			await load(true);
			await onRefresh();
		},
	});
	const provider = providers.find(candidate => candidate.id === "typesafe");
	const judge = roles.find(role => role.id === "judge");
	const candidates =
		judge?.candidates.filter(candidate => candidate.provider === "typesafe" && candidate.kind === "judge") ?? [];
	const savedSelector = judge?.selected ? `${judge.selected.provider}/${judge.selected.id}` : judge?.model;
	const savedJev = candidates.find(candidate => `${candidate.provider}/${candidate.id}` === savedSelector);
	const selected =
		candidates.find(candidate => `${candidate.provider}/${candidate.id}` === choice) ?? savedJev ?? candidates[0];
	const selectedSelector = selected ? `${selected.provider}/${selected.id}` : undefined;
	const busy = savingRoute || busyProvider !== null;
	const canEnable =
		sidecarReady &&
		provider?.authenticated &&
		!provider.disabled &&
		selected !== undefined &&
		routingEnabled !== null;

	const changeRouting = async (enabled: boolean) => {
		if (!sidecarReady || busy || (enabled && !canEnable)) return;
		const scope = scopeRef.current;
		if (!scope.active || scope.rpc !== rpc) return;
		setSavingRoute(true);
		setError(null);
		try {
			if (enabled && selectedSelector) {
				const assigned = await rpc.setModelRole("judge", selectedSelector);
				if (!scope.active) return;
				if (!assigned.success) throw new Error(assigned.error);
			}
			const configured = await rpc.setSetting("task.judgeRouting", enabled);
			if (!scope.active) return;
			if (!configured.success) throw new Error(configured.error);
			setRoutingEnabled(enabled);
		} catch (cause) {
			if (scope.active) setError(describeError(cause));
		} finally {
			if (scope.active) {
				setSavingRoute(false);
				await onRefresh();
			}
		}
	};

	return (
		<section
			data-tour="typesafe"
			aria-label={t("modelRoles.jev.title")}
			className="omp-note flex flex-col gap-2 rounded-lg border border-[var(--omp-border-muted)] p-3"
		>
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
				<h3 className="text-omp-md font-semibold text-[var(--omp-text)]">{t("modelRoles.jev.title")}</h3>
				{routingEnabled !== null && (
					<Badge variant={routingEnabled && savedJev ? "success" : "muted"}>
						{t(
							routingEnabled
								? savedJev
									? "modelRoles.jev.enabled"
									: "modelRoles.jev.otherJudge"
								: "modelRoles.jev.disabled",
						)}
					</Badge>
				)}
				<p className="text-omp-sm text-[var(--omp-muted)]">{t("modelRoles.jev.description")}</p>
			</div>
			{/* Keep sign-in reachable without expanding technical details. */}
			<div hidden={provider?.authenticated}>
				{provider ? (
					<ProviderRow
						provider={provider}
						customConfigs={[]}
						onLogin={handleLogin}
						onApiKey={() => setKeyOpen(true)}
						busy={busy}
						signInStartedAt={signIn?.providerId === provider.id ? signIn.startedAt : undefined}
						sidecarReady={sidecarReady}
						t={t}
					/>
				) : (
					!loading && <p className="text-omp-sm text-[var(--omp-muted)]">{t("modelRoles.jev.unavailable")}</p>
				)}
			</div>
			{discoveryPending && <p className="text-omp-sm text-[var(--omp-muted)]">{t("providers.refreshPending")}</p>}
			{provider?.authenticated && !loading && !discoveryPending && candidates.length === 0 && (
				<p className="text-omp-sm text-[var(--omp-muted)]">{t("modelRoles.jev.noModels")}</p>
			)}
			<div className="flex flex-wrap items-center gap-2">
				{candidates.length > 0 && (
					<label className="flex min-w-0 flex-1 basis-64 items-center gap-2 text-omp-sm text-[var(--omp-text-secondary)]">
						{t("modelRoles.jev.model")}
						<select
							aria-label={t("modelRoles.jev.model")}
							className="h-8 min-w-0 flex-1 rounded-md border border-[var(--omp-border-muted)] bg-[var(--omp-input-bg)] px-2 text-omp-sm text-[var(--omp-text)]"
							value={selectedSelector}
							disabled={!sidecarReady || busy}
							onChange={event => setChoice(event.target.value)}
						>
							{candidates.map(candidate => (
								<option key={candidate.id} value={`${candidate.provider}/${candidate.id}`}>
									{candidate.name}
								</option>
							))}
						</select>
					</label>
				)}
				{(!routingEnabled || savedSelector !== selectedSelector) && (
					<Button
						size="sm"
						variant="primary"
						disabled={!canEnable || busy || loading}
						loading={savingRoute}
						onClick={() => void changeRouting(true)}
					>
						{t(routingEnabled ? "common.apply" : "modelRoles.jev.enable")}
					</Button>
				)}
				{routingEnabled && (
					<Button
						size="sm"
						variant="ghost"
						disabled={!sidecarReady || busy}
						onClick={() => void changeRouting(false)}
					>
						{t("modelRoles.jev.disable")}
					</Button>
				)}
			</div>
			<p className="text-omp-sm leading-relaxed text-[var(--omp-muted)]">{t("modelRoles.jev.privacy")}</p>
			<details>
				<summary className="cursor-pointer text-omp-sm text-[var(--omp-text-secondary)]">
					{t("modelRoles.jev.details")}
				</summary>
				<div className="mt-2 flex flex-col gap-2">
					<div className="flex flex-wrap gap-2">
						{provider?.authenticated && provider.apiKeyLogin && (
							<Button
								size="sm"
								variant="ghost"
								icon={<KeyRound size={12} />}
								disabled={!sidecarReady || busy}
								onClick={() => setKeyOpen(true)}
							>
								{t("providers.updateCredentials", { provider: provider.name })}
							</Button>
						)}
						<Button
							size="sm"
							variant="ghost"
							icon={<RefreshCw size={12} />}
							disabled={!sidecarReady || busy}
							loading={loading}
							onClick={() => {
								void load(true);
								void onRefresh();
							}}
						>
							{t("modelRoles.refresh")}
						</Button>
					</div>
					<p className="text-omp-sm leading-relaxed text-[var(--omp-muted)]">{t("modelRoles.jev.behavior")}</p>
				</div>
			</details>
			{!sidecarReady && <p className="text-omp-sm text-[var(--omp-muted)]">{t("modelRoles.notConnected")}</p>}
			{error && (
				<p role="alert" className="text-omp-sm text-[var(--omp-error)]">
					{error}
				</p>
			)}
			{keyOpen && (
				<ApiKeyDialog
					open
					providerName={provider?.name ?? "TypeSafe"}
					onClose={() => setKeyOpen(false)}
					onSave={key => handleSaveApiKey("typesafe", key)}
				/>
			)}
		</section>
	);
}
