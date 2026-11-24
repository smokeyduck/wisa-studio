import { createStore } from "zustand/vanilla";
import {
	type AvailableModelsResult,
	deriveThinkingSelectors,
	type ModelCatalogUpdateFrame,
	type ModelInfo,
	type ProviderDiscoveryState,
	type ProviderInfo,
	type ProvidersResult,
	type RpcSessionState,
	type ThinkingLevel,
} from "../../shared/rpc-types";
import { translate } from "../lib/i18n";
import { supportsFastMode, supportsPriorityMode, supportsUltrafastMode } from "../lib/service-tier";
import { activeTabCommand, createScopedStoreApi, type TabCommand, useScopedStore } from "./session-runtime-context";
import { toast } from "./toast";

export type ModelSpeed = "standard" | "fast" | "ultrafast";

export interface ModelStore {
	model: ModelInfo | null;
	thinkingLevel: ThinkingLevel | undefined;
	/** Configured selector ("auto" or a level) — what the composer picker checks, vs the effective `thinkingLevel`. */
	thinkingConfigured: ThinkingLevel | "auto" | undefined;
	/** Verified selectors for the active model, in menu order. */
	availableThinkingSelectors: (ThinkingLevel | "auto")[];
	fastModeEnabled: boolean;
	fastModeActive: boolean;
	fastModeUltrafast: boolean;
	fastModeUltrafastSupported: boolean;
	/** `/slow` applies to the active model (flex tier on OpenAI/Google, low priority on Claude subscriptions). */
	slowModeSupported: boolean;
	slowModeEnabled: boolean;
	slowModeScope: "session" | "global" | null;
	tokensPerSecond: number | null;
	availableModels: ModelInfo[];
	/** Configured providers with auth state and model counts, from the same
	 * catalog generation as `availableModels`. Consumers must never keep a second
	 * copy: a catalog push and a `get_providers` read race, and only this store
	 * knows which generation won. */
	providers: ProviderInfo[];
	discoveryStates: ProviderDiscoveryState[];
	catalogRefreshPending: boolean;
	catalogGeneration: number;
	setFromState: (state: RpcSessionState) => void;
	/** Fetch the model list from the active sidecar and commit it under its
	 * catalog generation. Force after any mutation that can change the catalog. */
	refreshAvailableModels: (forceRefresh?: boolean) => Promise<AvailableModelsResult>;
	/** Fetch provider rows and their catalog in one read, then commit both under
	 * the returned generation. `forceRefresh` must be true after any mutation
	 * (credential, models.yml, discovery): a non-forced read is satisfied by a
	 * still-fresh cache row and reports the old catalog. */
	refreshProviders: (forceRefresh?: boolean) => Promise<ProvidersResult>;
	applyCatalogUpdate: (update: ModelCatalogUpdateFrame) => void;
	/** Toggle fast mode via RPC and apply the returned {enabled, active} (fixes
	 * call sites that fired setFastMode and ignored the response, desyncing the store). */
	toggleFastMode: () => Promise<void>;
	setModelSpeed: (speed: ModelSpeed) => Promise<void>;
	reset: () => void;
}

interface CatalogSnapshot {
	models?: ModelInfo[];
	providers?: ProviderInfo[];
	/** Absent means the read did not describe discovery, so the commit must not
	 * clear what an earlier one reported. */
	discoveryStates?: ProviderDiscoveryState[];
	refreshPending?: boolean;
	generation: number;
}

const initialState = {
	model: null as ModelInfo | null,
	thinkingLevel: undefined as ThinkingLevel | undefined,
	thinkingConfigured: undefined as ThinkingLevel | "auto" | undefined,
	availableThinkingSelectors: [] as (ThinkingLevel | "auto")[],
	fastModeEnabled: false,
	fastModeActive: false,
	fastModeUltrafast: false,
	fastModeUltrafastSupported: false,
	slowModeSupported: false,
	slowModeEnabled: false,
	slowModeScope: null as "session" | "global" | null,
	tokensPerSecond: null as number | null,
	availableModels: [] as ModelInfo[],
	providers: [] as ProviderInfo[],
	discoveryStates: [] as ProviderDiscoveryState[],
	catalogRefreshPending: false,
	catalogGeneration: 0,
};

export const createModelStore = (command: TabCommand = activeTabCommand) =>
	createStore<ModelStore>()((set, get) => {
		let catalogEpoch = 0;
		const applyCatalog = (snapshot: CatalogSnapshot): void => {
			set(state => {
				if (snapshot.generation < state.catalogGeneration) return state;
				// Discovery can report a partial list while its provider requests run.
				// Keep warm rows until a completed read or push replaces them.
				const keepModels = snapshot.refreshPending && state.availableModels.length > 0;
				const keepProviders = snapshot.refreshPending && state.providers.length > 0;
				return {
					...(!keepModels && snapshot.models ? { availableModels: snapshot.models } : {}),
					...(!keepProviders && snapshot.providers ? { providers: snapshot.providers } : {}),
					...(snapshot.discoveryStates ? { discoveryStates: snapshot.discoveryStates } : {}),
					...(snapshot.refreshPending !== undefined ? { catalogRefreshPending: snapshot.refreshPending } : {}),
					catalogGeneration: snapshot.generation,
				};
			});
		};
		const refreshCatalog = async (
			type: "get_available_models" | "get_providers",
			forceRefresh: boolean,
		): Promise<ProvidersResult> => {
			const epoch = catalogEpoch;
			const response = await command({ type, forceRefresh });
			if (!response.success) throw new Error(response.error);
			if (epoch === catalogEpoch) {
				const data = response.data as Partial<ProvidersResult> | undefined;
				applyCatalog({ ...data, generation: data?.generation ?? 0 });
			}
			const state = get();
			return {
				models: state.availableModels,
				providers: state.providers,
				discoveryStates: state.discoveryStates,
				refreshPending: state.catalogRefreshPending,
				generation: state.catalogGeneration,
			};
		};
		return {
			...initialState,
			setFromState: state =>
				set({
					model: state.model ?? null,
					thinkingLevel: state.thinkingLevel,
					thinkingConfigured: state.thinkingConfigured ?? state.configuredThinkingLevel,
					availableThinkingSelectors: deriveThinkingSelectors(state),
					fastModeEnabled: state.fastModeEnabled,
					fastModeActive: state.fastModeActive,
					fastModeUltrafast: state.fastModeUltrafast === true,
					fastModeUltrafastSupported: typeof state.fastModeUltrafast === "boolean",
					slowModeSupported: state.slowModeSupported ?? false,
					slowModeEnabled: state.slowModeEnabled ?? false,
					slowModeScope: state.slowModeScope ?? null,
					tokensPerSecond: state.tokensPerSecond,
				}),
			refreshAvailableModels: (forceRefresh = false) => refreshCatalog("get_available_models", forceRefresh),
			refreshProviders: (forceRefresh = false) => refreshCatalog("get_providers", forceRefresh),
			applyCatalogUpdate: update =>
				applyCatalog({
					models: update.models,
					providers: update.providers,
					discoveryStates: update.discoveryStates,
					refreshPending: update.refreshPending,
					generation: update.generation,
				}),
			toggleFastMode: async () => get().setModelSpeed(get().fastModeEnabled ? "standard" : "fast"),
			setModelSpeed: async speed => {
				const { model, fastModeUltrafastSupported } = get();
				if (speed === "ultrafast" && !(fastModeUltrafastSupported && supportsUltrafastMode(model))) return;
				if (speed === "fast" && !supportsPriorityMode(model)) return;
				if (speed === "standard" && !supportsFastMode(model)) return;
				const res = await command({
					type: "set_fast_mode",
					enabled: speed !== "standard",
					...(speed === "ultrafast" ? { ultrafast: true } : {}),
				});
				if (res.success) {
					if (get().model?.id !== model?.id || get().model?.provider !== model?.provider) return;
					const data = res.data as { enabled?: boolean; active?: boolean; ultrafast?: boolean } | undefined;
					set({
						fastModeEnabled: data?.enabled ?? false,
						fastModeActive: data?.active ?? false,
						fastModeUltrafast: data?.ultrafast === true,
					});
				} else {
					toast({ variant: "error", title: translate("model.fastMode"), message: res.error });
				}
			},
			reset: () => {
				catalogEpoch++;
				set(initialState);
			},
		};
	});

const defaultModelStore = createModelStore();
function useModel(): ModelStore;
function useModel<U>(selector: (state: ModelStore) => U): U;
function useModel<U = ModelStore>(selector?: (state: ModelStore) => U): U {
	return useScopedStore("model", defaultModelStore, selector);
}
export const useModelStore = Object.assign(useModel, createScopedStoreApi("model", defaultModelStore));
