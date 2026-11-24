/**
 * State behind the Plugins page: every configured catalog's plugins, adding the
 * default catalogs, and the one mutation allowed at a time (activating a plugin
 * can restart the tab's agent, so two would race).
 */

import {
	createContext,
	createElement,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useEffectEvent,
	useRef,
	useState,
} from "react";
import type { RpcMarketplaceInfo, RpcMarketplacesResult, RpcResponse } from "../../../../shared/rpc-types";
import { useActiveTabRouteReady } from "../../../hooks/use-active-tab-route";
import { describeError } from "../../../lib/errors";
import { useT } from "../../../lib/i18n";
import {
	capturePluginActivationOrigin,
	handlePluginActivation,
	isPluginActivationOriginActive,
} from "../../../lib/plugin-activation";
import { useTabRpc } from "../../../lib/tab-rpc";
import { useSessionStore } from "../../../stores/session";
import { useTabsStore } from "../../../stores/tabs";
import { listAvailablePlugins, mutationError } from "../inventory/rpc-result";
import {
	type CatalogPlugin,
	DEFAULT_CATALOGS,
	type DefaultCatalog,
	isCatalogListed,
	type PluginAction,
	toCatalogPlugin,
} from "./catalog-model";

/** Sources of the default catalogs already added once, so removing one later isn't undone. */
const OFFERED_PREF = "pluginCatalogsOffered";
/** Sources of the catalogs the person has agreed to install from. */
const TRUSTED_PREF = "pluginCatalogsTrusted";
/** When GitHub can't be reached the rest would fail too, each after a long wait. */
const FAILURES_IN_A_ROW_BEFORE_STOPPING = 2;

/** A readable sentence, and the original text for a bug report when they differ. */
export interface PluginCatalogError {
	message: string;
	raw?: string;
}

function failureOf(res: RpcResponse, fallback: string): PluginCatalogError | null {
	const message = mutationError(res, fallback);
	if (message === null) return null;
	const raw = res.success ? (res.data as { error?: string } | undefined)?.error : res.error;
	return { message, ...(raw ? { raw } : {}) };
}

function failureFrom(cause: unknown): PluginCatalogError {
	return { message: describeError(cause), ...(cause instanceof Error ? { raw: cause.message } : {}) };
}

export type CatalogStatus = "connecting" | "loading" | "ready" | "error";

export interface PluginCatalogState {
	status: CatalogStatus;
	/** Why the catalogs couldn't be listed or set up. */
	error: PluginCatalogError | null;
	/** Default catalogs being added right now. */
	seeding: { done: number; total: number } | null;
	/** Why a default catalog wasn't added while others are there to browse. It's tried again next time. */
	seedError: PluginCatalogError | null;
	marketplaces: RpcMarketplaceInfo[];
	plugins: CatalogPlugin[];
	/** Catalogs that failed to list while others loaded. */
	listFailures: Array<{ marketplace: string; error: string }>;
	refreshing: boolean;
	refreshError: string | null;
	busy: { id: string; action: PluginAction } | null;
	/** Whether the page is connected to an agent that can act right now. */
	canAct: boolean;
	actionErrors: Readonly<Record<string, PluginCatalogError>>;
	/** Re-read the catalogs from what's cached. */
	reload: () => Promise<void>;
	/** Fetch the latest version of every catalog. */
	refresh: () => Promise<void>;
	/** Add the default catalogs on request, after they were removed. */
	addDefaultCatalogs: () => Promise<void>;
	runAction: (plugin: CatalogPlugin, action: PluginAction) => Promise<void>;
	isCatalogTrusted: (source: string) => boolean;
	trustCatalog: (source: string) => Promise<void>;
}

async function readSources(pref: string): Promise<string[]> {
	const stored = await window.omp.prefs.get(pref);
	return Array.isArray(stored) ? stored.filter((entry): entry is string => typeof entry === "string") : [];
}

async function rememberSources(pref: string, sources: readonly string[]): Promise<string[]> {
	const next = [...new Set([...(await readSources(pref)), ...sources])];
	await window.omp.prefs.set(pref, next);
	return next;
}

/** Default catalogs to add now: never offered here, and not already there under some other address. */
async function pendingDefaults(catalogs: readonly RpcMarketplaceInfo[]): Promise<DefaultCatalog[]> {
	const offered = await readSources(OFFERED_PREF);
	const unoffered = DEFAULT_CATALOGS.filter(entry => !offered.includes(entry.source));
	// A copy someone added themselves counts: removing it later must not bring ours back.
	const present = unoffered.filter(entry => isCatalogListed(catalogs, entry));
	if (present.length > 0)
		await rememberSources(
			OFFERED_PREF,
			present.map(entry => entry.source),
		);
	return unoffered.filter(entry => !isCatalogListed(catalogs, entry));
}

function usePluginCatalogState(): PluginCatalogState {
	const t = useT();
	const tabRpc = useTabRpc();
	const sidecarReady = useSessionStore(s => s.status) === "ready";
	const cwd = useSessionStore(s => s.cwd);
	const activeTabId = useTabsStore(s => s.activeTabId);
	const routeReady = useActiveTabRouteReady();
	const connected = sidecarReady && routeReady;
	const routeKey = `${activeTabId ?? "none"}:${cwd}`;

	const [status, setStatus] = useState<CatalogStatus>("connecting");
	const [loadedRoute, setLoadedRoute] = useState<string | null>(null);
	const [error, setError] = useState<PluginCatalogError | null>(null);
	const [seeding, setSeeding] = useState<PluginCatalogState["seeding"]>(null);
	const [seedError, setSeedError] = useState<PluginCatalogError | null>(null);
	const [marketplaces, setMarketplaces] = useState<RpcMarketplaceInfo[]>([]);
	const [plugins, setPlugins] = useState<CatalogPlugin[]>([]);
	const [listFailures, setListFailures] = useState<Array<{ marketplace: string; error: string }>>([]);
	const [refreshing, setRefreshing] = useState(false);
	const [refreshError, setRefreshError] = useState<string | null>(null);
	const [busy, setBusy] = useState<PluginCatalogState["busy"]>(null);
	const [actionErrors, setActionErrors] = useState<Readonly<Record<string, PluginCatalogError>>>({});
	const [trusted, setTrusted] = useState<readonly string[]>([]);

	// Answers from a tab the person has since left, or a load since replaced, are dropped.
	const requestRef = useRef(0);
	const loadingRequestRef = useRef<number | null>(null);
	const busyRef = useRef(false);
	const isCurrent = useCallback(
		(request: number) =>
			request === requestRef.current &&
			routeKey === `${useTabsStore.getState().activeTabId ?? "none"}:${useSessionStore.getState().cwd}`,
		[routeKey],
	);
	useEffect(
		() => () => {
			requestRef.current++;
		},
		[],
	);

	const fallbackError = t("marketplace.unknownError");

	const readCatalogs = useCallback(
		async (request: number): Promise<RpcMarketplaceInfo[] | null> => {
			if (!isCurrent(request)) return null;
			const res = await tabRpc.getMarketplaces();
			if (!isCurrent(request)) return null;
			if (!res.success) throw new Error(res.error);
			return (res.data as RpcMarketplacesResult | undefined)?.marketplaces ?? [];
		},
		[isCurrent, tabRpc],
	);

	const readPlugins = useCallback(
		async (
			request: number,
			catalogs: RpcMarketplaceInfo[],
			previous?: readonly RpcMarketplaceInfo[],
		): Promise<void> => {
			const current = new Map(catalogs.map(entry => [entry.name, entry.source]));
			const unchanged = new Set(
				previous?.filter(entry => current.get(entry.name) === entry.source).map(entry => entry.name),
			);
			const lists = await Promise.all(
				catalogs
					.filter(entry => !unchanged.has(entry.name))
					.map(async marketplace => {
						try {
							const res = await tabRpc.marketplaceAction({
								action: "list_available",
								marketplace: marketplace.name,
							});
							return { marketplace, result: listAvailablePlugins(res, fallbackError) };
						} catch (cause) {
							return { marketplace, result: { ok: false as const, error: describeError(cause) } };
						}
					}),
			);
			if (!isCurrent(request)) return;
			const next: CatalogPlugin[] = [];
			const failures: Array<{ marketplace: string; error: string }> = [];
			for (const { marketplace, result } of lists) {
				if (result.ok) next.push(...result.plugins.map(info => toCatalogPlugin(marketplace, info)));
				else failures.push({ marketplace: marketplace.name, error: result.error });
			}
			setMarketplaces(catalogs);
			setPlugins(previous => [...previous.filter(plugin => unchanged.has(plugin.marketplace)), ...next]);
			setListFailures(previous => [...previous.filter(failure => unchanged.has(failure.marketplace)), ...failures]);
		},
		[fallbackError, isCurrent, tabRpc],
	);

	/** One at a time, so the order is predictable and the page fills in as each one arrives. */
	const addDefaults = useCallback(
		async (request: number, pending: readonly DefaultCatalog[], catalogs: RpcMarketplaceInfo[]): Promise<void> => {
			setSeedError(null);
			setSeeding({ done: 0, total: pending.length });
			let firstFailure: PluginCatalogError | null = null;
			let failuresInARow = 0;
			let latest = catalogs;
			try {
				for (const [index, entry] of pending.entries()) {
					if (!isCurrent(request)) return;
					let failure: PluginCatalogError | null;
					try {
						const res = await tabRpc.marketplaceAction({ action: "add", source: entry.source });
						failure = failureOf(res, fallbackError);
					} catch (cause) {
						failure = failureFrom(cause);
					}
					const updated = await readCatalogs(request).catch(() => null);
					if (updated !== null) {
						await readPlugins(request, updated, latest);
						latest = updated;
					}
					// Another window adding it first also reports a failure, so go by what's listed now.
					if (failure === null || isCatalogListed(latest, entry)) {
						failuresInARow = 0;
						await rememberSources(OFFERED_PREF, [entry.source]);
					} else {
						firstFailure ??= failure;
						failuresInARow++;
						if (failuresInARow >= FAILURES_IN_A_ROW_BEFORE_STOPPING) break;
					}
					if (!isCurrent(request)) return;
					setSeeding({ done: index + 1, total: pending.length });
				}
			} finally {
				setSeeding(null);
			}
			if (firstFailure === null || !isCurrent(request)) return;
			if (latest.length === 0) {
				setError(firstFailure);
				setStatus("error");
			} else {
				setSeedError(firstFailure);
			}
		},
		[fallbackError, isCurrent, readCatalogs, readPlugins, tabRpc],
	);

	const load = useCallback(
		async (forceDefaults = false): Promise<void> => {
			if (!connected || refreshing || loadingRequestRef.current === requestRef.current || busyRef.current) return;
			const request = ++requestRef.current;
			loadingRequestRef.current = request;
			setStatus("loading");
			setError(null);
			try {
				const catalogs = await readCatalogs(request);
				if (catalogs === null) return;
				const pending = forceDefaults
					? DEFAULT_CATALOGS.filter(entry => !isCatalogListed(catalogs, entry))
					: await pendingDefaults(catalogs);
				if (!isCurrent(request)) return;
				await readPlugins(request, catalogs);
				if (!isCurrent(request)) return;
				setStatus("ready");
				if (pending.length > 0) await addDefaults(request, pending, catalogs);
			} catch (cause) {
				if (!isCurrent(request)) return;
				setError(failureFrom(cause));
				setStatus("error");
			} finally {
				if (loadingRequestRef.current === request) loadingRequestRef.current = null;
			}
		},
		[addDefaults, connected, isCurrent, readCatalogs, readPlugins, refreshing],
	);

	// Start on the first routed connection, independently of either catalog surface.
	// A same-route restart keeps the current catalog visible; a new route gets its own list.
	const loadRoute = useEffectEvent(() => {
		setLoadedRoute(routeKey);
		setMarketplaces([]);
		setPlugins([]);
		setListFailures([]);
		setActionErrors({});
		setSeedError(null);
		setRefreshError(null);
		void load();
		void readSources(TRUSTED_PREF).then(setTrusted, () => {});
	});
	useEffect(() => {
		if (loadedRoute !== null && loadedRoute !== routeKey) {
			// Invalidate even when the destination isn't connected. Returning to the
			// old tab before that connection settles must restart any interrupted load.
			requestRef.current++;
			setLoadedRoute(null);
			return;
		}
		if (!connected || loadedRoute !== null || seeding !== null || busy !== null || refreshing) return;
		loadRoute();
	}, [busy, connected, loadedRoute, refreshing, routeKey, seeding]);

	const activeRoute = loadedRoute === routeKey;
	const canAct = connected && activeRoute && status === "ready";
	const reload = useCallback(() => load(), [load]);
	const addDefaultCatalogs = useCallback(() => load(true), [load]);

	const refresh = useCallback(async (): Promise<void> => {
		if (!canAct || refreshing || busyRef.current || loadingRequestRef.current === requestRef.current) return;
		const request = ++requestRef.current;
		setRefreshing(true);
		setRefreshError(null);
		try {
			for (const marketplace of marketplaces) {
				const res = await tabRpc.marketplaceAction({ action: "update", marketplace: marketplace.name });
				if (!isCurrent(request)) return;
				const failure = mutationError(res, fallbackError);
				if (failure !== null) setRefreshError(failure);
			}
			const catalogs = await readCatalogs(request);
			if (catalogs !== null) await readPlugins(request, catalogs);
		} catch (cause) {
			if (isCurrent(request)) setRefreshError(describeError(cause));
		} finally {
			setRefreshing(false);
		}
	}, [canAct, fallbackError, isCurrent, marketplaces, readCatalogs, readPlugins, refreshing, tabRpc]);

	const runAction = useCallback(
		async (plugin: CatalogPlugin, action: PluginAction): Promise<void> => {
			if (!canAct || busyRef.current || loadingRequestRef.current === requestRef.current || refreshing) return;
			const fail = (failure: PluginCatalogError): void =>
				setActionErrors(prev => ({ ...prev, [plugin.id]: failure }));
			const origin = capturePluginActivationOrigin();
			if (!origin) {
				fail({ message: t("pluginActivation.routePending") });
				return;
			}
			busyRef.current = true;
			setBusy({ id: plugin.id, action });
			setActionErrors(prev => {
				if (!(plugin.id in prev)) return prev;
				const rest = { ...prev };
				delete rest[plugin.id];
				return rest;
			});
			try {
				const res = await tabRpc.marketplaceAction({
					action,
					marketplace: plugin.marketplace,
					plugin: plugin.info.name,
				});
				const failure = failureOf(res, fallbackError);
				if (failure !== null) {
					if (isPluginActivationOriginActive(origin)) fail(failure);
					return;
				}
				const data = res.data as { activation?: string } | undefined;
				await handlePluginActivation(
					data?.activation,
					{ pluginId: plugin.id, expected: action === "uninstall" ? "disabled" : "enabled" },
					origin,
				);
				if (!isPluginActivationOriginActive(origin)) return;
				const request = ++requestRef.current;
				const catalogs = await readCatalogs(request);
				if (catalogs !== null) await readPlugins(request, catalogs);
			} catch (cause) {
				if (isPluginActivationOriginActive(origin)) fail(failureFrom(cause));
			} finally {
				busyRef.current = false;
				setBusy(null);
			}
		},
		[canAct, fallbackError, readCatalogs, readPlugins, refreshing, t, tabRpc],
	);

	const isCatalogTrusted = useCallback((source: string) => trusted.includes(source), [trusted]);

	const trustCatalog = useCallback(async (source: string): Promise<void> => {
		setTrusted(prev => [...new Set([...prev, source])]);
		setTrusted(await rememberSources(TRUSTED_PREF, [source]));
	}, []);

	return {
		status: activeRoute ? status : "connecting",
		error,
		seeding,
		seedError,
		marketplaces,
		plugins,
		listFailures,
		refreshing,
		refreshError,
		busy,
		canAct,
		actionErrors,
		reload,
		refresh,
		addDefaultCatalogs,
		runAction,
		isCatalogTrusted,
		trustCatalog,
	};
}

const PluginCatalogContext = createContext<PluginCatalogState | null>(null);

export function PluginCatalogProvider({ children }: { children: ReactNode }) {
	return createElement(PluginCatalogContext.Provider, { value: usePluginCatalogState() }, children);
}

export function usePluginCatalog(open: boolean): PluginCatalogState {
	const catalog = useContext(PluginCatalogContext);
	if (!catalog) throw new Error("Missing PluginCatalogProvider");
	const revalidate = useEffectEvent(() => {
		// Preserve cached cards when reopening after edits elsewhere. If startup is
		// still loading, opening a surface joins that load instead of replacing it.
		if (catalog.status === "ready" || catalog.status === "error") void catalog.reload();
	});
	useEffect(() => {
		if (open) revalidate();
	}, [open]);
	return catalog;
}
