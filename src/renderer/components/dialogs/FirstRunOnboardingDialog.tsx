import { ArrowRight, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CustomProviderView } from "../../../shared/ipc-types";
import type { ModelInfo, ProviderInfo } from "../../../shared/rpc-types";
import { WISA_CONNECT_PAGE_URL } from "../../../shared/wisa";
import anthropicMark from "../../assets/provider-anthropic.svg";
import geminiMark from "../../assets/provider-gemini.svg";
import openaiMark from "../../assets/provider-openai.svg";
import { describeError } from "../../lib/errors";
import { useT } from "../../lib/i18n";
import { useTabRpc } from "../../lib/tab-rpc";
import { useAllPendingRequests } from "../../stores/extension-ui";
import { useModelStore } from "../../stores/model";
import { useSessionStore } from "../../stores/session";
import { useUiStore } from "../../stores/ui";
import { Button, Modal, WisaLogo } from "../common";
import { FirstUseTutorial, TUTORIAL_COMPLETION_KEY } from "./FirstUseTutorial";

function isProviderInfo(value: unknown): value is ProviderInfo {
	if (!value || typeof value !== "object") return false;
	return (
		"id" in value &&
		typeof value.id === "string" &&
		"name" in value &&
		typeof value.name === "string" &&
		"authenticated" in value &&
		typeof value.authenticated === "boolean" &&
		"loginAvailable" in value &&
		typeof value.loginAvailable === "boolean" &&
		"disabled" in value &&
		typeof value.disabled === "boolean" &&
		"modelCount" in value &&
		typeof value.modelCount === "number"
	);
}

/** Require a model in the live inventory belonging to this same usable provider. */
export function hasUsableModelProvider(
	providers: readonly ProviderInfo[],
	configs: readonly CustomProviderView[],
	models: readonly Pick<ModelInfo, "id" | "provider">[],
): boolean {
	return providers.some(
		provider =>
			!provider.disabled &&
			(provider.authenticated || configs.some(config => config.id === provider.id && config.auth === "none")) &&
			models.some(model => model.provider === provider.id && model.id.length > 0),
	);
}

export function FirstRunOnboardingDialog() {
	const tabRpc = useTabRpc();
	const t = useT();
	const sidecarStatus = useSessionStore(state => state.status);
	const isStreaming = useSessionStore(state => state.isStreaming);
	const requests = useAllPendingRequests();
	const tutorialOpen = useUiStore(state => state.tutorialOpen);
	const closeTutorial = useUiStore(state => state.closeTutorial);
	const [tourStarted, setTourStarted] = useState(false);
	const [tourDismissed, setTourDismissed] = useState(false);
	const openProviders = useUiStore(state => state.openProviders);
	const setupVisible = useUiStore(state => state.providersOpen || state.providerConfigOpen || state.settingsOpen);
	const [completed, setCompleted] = useState<boolean | null>(null);
	const [usable, setUsable] = useState(false);
	const [dismissed, setDismissed] = useState(false);
	const [dialogBlocked, setDialogBlocked] = useState(false);
	const requestVersion = useRef(0);
	const [open, setOpen] = useState(false);
	const [checking, setChecking] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let active = true;
		void window.omp.prefs
			.get(TUTORIAL_COMPLETION_KEY)
			.then(value => {
				if (active) setCompleted(value === true);
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		const update = () =>
			setDialogBlocked(
				[...document.querySelectorAll('[role="dialog"]')].some(dialog => !dialog.querySelector("[data-first-run]")),
			);
		update();
		const observer = new MutationObserver(update);
		observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["role"] });
		return () => observer.disconnect();
	}, []);

	const checkReadiness = useCallback(
		async (manual: boolean) => {
			if (sidecarStatus !== "ready") {
				setUsable(false);
				setError(t("common.notConnected"));
				return;
			}
			const version = ++requestVersion.current;
			setChecking(true);
			if (manual) setError(null);
			try {
				const [providerResult, configResult] = await Promise.allSettled([
					tabRpc.getProviders(),
					window.omp.models.listProviders(),
				]);
				if (version !== requestVersion.current) return;
				if (providerResult.status === "rejected") throw providerResult.reason;
				if (configResult.status === "rejected") throw configResult.reason;
				if (!providerResult.value.success) throw new Error(providerResult.value.error);

				const data = providerResult.value.data;
				if (
					!data ||
					typeof data !== "object" ||
					!("providers" in data) ||
					!Array.isArray(data.providers) ||
					!data.providers.every(isProviderInfo)
				) {
					throw new Error(t("onboarding.invalidResponse"));
				}
				const providers = data.providers;
				const configs = configResult.value;
				if (
					!("models" in data) ||
					!Array.isArray(data.models) ||
					!data.models.every(
						model =>
							model &&
							typeof model === "object" &&
							typeof model.id === "string" &&
							typeof model.provider === "string",
					)
				) {
					throw new Error(t("onboarding.invalidResponse"));
				}
				const ready = hasUsableModelProvider(providers, configs, data.models);
				setUsable(ready);
				if (ready) {
					setOpen(false);
					setError(null);
					return;
				}
				if (!manual && (dismissed || setupVisible || document.querySelector('[role="dialog"]'))) return;
				setOpen(true);
				setError(manual ? t("onboarding.stillMissing") : null);
			} catch (cause) {
				if (version !== requestVersion.current) return;
				setUsable(false);
				if (!manual) return;
				setOpen(true);
				setError(t("onboarding.checkFailed", { error: describeError(cause) }));
			} finally {
				if (version === requestVersion.current) setChecking(false);
			}
		},
		[sidecarStatus, t, tabRpc.getProviders, dismissed, setupVisible],
	);

	useEffect(() => {
		if (sidecarStatus !== "ready") {
			setUsable(false);
			return;
		}
		if (completed === null) return;
		void checkReadiness(false);
		if (completed) return;
		const refresh = () => void checkReadiness(false);
		const unsubscribe = useModelStore.subscribe((next, previous) => {
			if (
				next.catalogGeneration !== previous.catalogGeneration ||
				next.availableModels !== previous.availableModels
			) {
				refresh();
			}
		});
		const timer = window.setInterval(refresh, 5000);
		window.addEventListener("focus", refresh);
		return () => {
			unsubscribe();
			window.clearInterval(timer);
			window.removeEventListener("focus", refresh);
			requestVersion.current++;
		};
	}, [sidecarStatus, completed, checkReadiness]);

	useEffect(() => {
		if (
			completed === false &&
			usable &&
			sidecarStatus === "ready" &&
			!setupVisible &&
			!dialogBlocked &&
			!open &&
			!isStreaming &&
			!requests.length &&
			!tourDismissed
		)
			setTourStarted(true);
	}, [
		completed,
		usable,
		sidecarStatus,
		setupVisible,
		dialogBlocked,
		open,
		isStreaming,
		requests.length,
		tourDismissed,
	]);

	const closeSetup = () => {
		setOpen(false);
		setDismissed(true);
	};

	return (
		<>
			<Modal
				ariaLabel={t("onboarding.title")}
				bodyClassName="p-0"
				chromeless
				onClose={closeSetup}
				open={open && !setupVisible && !dialogBlocked}
				size="lg"
			>
				<div className="omp-onboarding" data-first-run>
					<header className="relative pr-9">
						<p className="mb-3 text-omp-xs font-medium tracking-[0.16em] text-(--omp-dim)">Wisa</p>
						<h2 className="font-display text-omp-display font-semibold leading-tight tracking-[-0.035em]">
							{t("onboarding.heading")}
						</h2>
						<p className="mt-2 text-omp-md text-(--omp-muted)">{t("onboarding.description")}</p>
						<button
							aria-label={t("common.close")}
							className="absolute top-0 right-0 rounded-lg p-1.5 text-(--omp-muted) hover:bg-(--omp-bg-tertiary) focus-visible:outline-2 focus-visible:outline-(--omp-accent)"
							onClick={closeSetup}
							type="button"
						>
							<X size={16} />
						</button>
					</header>

					<div className="omp-onboarding-choices">
						<button
							className="omp-onboarding-choice omp-onboarding-wisa"
							onClick={() => {
								closeSetup();
								void window.omp.system.openExternal(WISA_CONNECT_PAGE_URL);
							}}
							type="button"
						>
							<span aria-hidden="true" className="omp-onboarding-art">
								<span className="omp-onboarding-tile omp-onboarding-wisa-back" />
								<span className="omp-onboarding-tile omp-onboarding-wisa-mid" />
								<span className="omp-onboarding-tile omp-onboarding-wisa-mark">
									<WisaLogo size={52} />
								</span>
							</span>
							<span className="omp-onboarding-copy">
								<span className="text-omp-2xl font-semibold tracking-[-0.02em]">
									{t("onboarding.wisa.title")}
								</span>
								<span className="text-omp-md leading-relaxed text-(--omp-muted)">
									{t("onboarding.wisa.description")}
								</span>
								<span className="omp-onboarding-action">
									{t("onboarding.wisa.action")}
									<ArrowRight aria-hidden="true" size={16} />
								</span>
							</span>
						</button>

						<button
							className="omp-onboarding-choice"
							onClick={() => {
								closeSetup();
								openProviders();
							}}
							type="button"
						>
							<span aria-hidden="true" className="omp-onboarding-art">
								<span className="omp-onboarding-tile omp-onboarding-gemini">
									<img alt="" draggable={false} height={44} src={geminiMark} width={44} />
								</span>
								<span className="omp-onboarding-tile omp-onboarding-anthropic">
									<img alt="" draggable={false} height={44} src={anthropicMark} width={44} />
								</span>
								<span className="omp-onboarding-tile omp-onboarding-openai">
									<img alt="" draggable={false} height={44} src={openaiMark} width={44} />
								</span>
							</span>
							<span className="omp-onboarding-copy">
								<span className="text-omp-2xl font-semibold tracking-[-0.02em]">
									{t("onboarding.provider.title")}
								</span>
								<span className="text-omp-md leading-relaxed text-(--omp-muted)">
									{t("onboarding.provider.description")}
								</span>
								<span className="omp-onboarding-action">
									{t("onboarding.provider.action")}
									<ArrowRight aria-hidden="true" size={16} />
								</span>
							</span>
						</button>
					</div>

					{error && (
						<p role="alert" className="text-omp-sm leading-relaxed text-(--omp-warning)">
							{error}
						</p>
					)}

					<footer className="flex flex-wrap items-center justify-between gap-2">
						<Button onClick={closeSetup} variant="ghost">
							{t("onboarding.later")}
						</Button>
						<Button
							icon={<RefreshCw size={13} />}
							disabled={sidecarStatus !== "ready"}
							loading={checking}
							onClick={() => void checkReadiness(true)}
							title={sidecarStatus !== "ready" ? t("common.notConnected") : undefined}
							variant="ghost"
						>
							{t("onboarding.recheck")}
						</Button>
					</footer>
				</div>
			</Modal>
			<FirstUseTutorial
				open={
					(tourStarted || tutorialOpen) &&
					!requests.length &&
					(tutorialOpen || (usable && sidecarStatus === "ready"))
				}
				onDismiss={() => {
					setTourStarted(false);
					setTourDismissed(true);
					closeTutorial();
				}}
				onComplete={() => {
					setCompleted(true);
					setTourStarted(false);
					closeTutorial();
				}}
			/>
		</>
	);
}
