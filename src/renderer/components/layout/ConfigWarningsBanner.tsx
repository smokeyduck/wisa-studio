/**
 * Configuration warnings the sidecar collected — the GUI counterpart of the
 * TUI header's "Warning: …" rows. Startup's missing-default warning is setup
 * guidance, not a persistent configuration failure: the live session model
 * decides whether a model still needs choosing. Other configuration and proxy
 * problems stay visible. Dismissal hides the current warning set only.
 */

import { AlertTriangle, ChevronDown, ChevronUp, Info, X } from "lucide-react";
import { useState } from "react";
import { useT } from "../../lib/i18n";
import { useModelStore } from "../../stores/model";
import { useSessionStore } from "../../stores/session";
import { useUiStore } from "../../stores/ui";

const MISSING_DEFAULT_MODEL_WARNING = "No default model selected.";

export function ConfigWarningsBanner() {
	const t = useT();
	const configWarnings = useSessionStore(s => s.configWarnings);
	const proxyWarnings = useSessionStore(s => s.proxyWarnings);
	const dismissed = useSessionStore(s => s.configWarningsDismissed);
	const model = useModelStore(s => s.model);
	const status = useSessionStore(s => s.status);
	const openModelPicker = useUiStore(s => s.openModelPicker);
	const [expanded, setExpanded] = useState(false);
	// Core collects this at startup and may return it even after set_model.
	const showModelSetup =
		!model && status === "ready" && configWarnings.some(warning => warning.startsWith(MISSING_DEFAULT_MODEL_WARNING));
	const warnings = [
		...proxyWarnings.map(dropped =>
			t(
				`proxy.dropped.${dropped.source}`,
				dropped.source === "environment" ? { names: dropped.names.join(", ") } : undefined,
			),
		),
		...configWarnings.filter(warning => !warning.startsWith(MISSING_DEFAULT_MODEL_WARNING)),
	];
	const key = warnings.join("\n");
	const showWarnings = warnings.length > 0 && dismissed !== key;
	if (!showWarnings && !showModelSetup) return null;
	const multiple = warnings.length > 1;

	return (
		<>
			{showModelSetup && (
				<div
					role="status"
					className="flex items-center gap-3 border-b border-[var(--omp-border)] bg-[var(--omp-bg-secondary)] px-4 py-2.5"
				>
					<Info size={16} className="shrink-0 text-[var(--omp-muted)]" />
					<div className="min-w-0 flex-1">
						<div className="text-omp-md font-medium text-[var(--omp-text)]">
							{t("configWarnings.modelSetupTitle")}
						</div>
						<div className="text-omp-sm text-[var(--omp-muted)]">{t("configWarnings.modelSetupDescription")}</div>
					</div>
					<button
						type="button"
						onClick={openModelPicker}
						className="omp-pressable shrink-0 rounded-md border border-[var(--omp-border)] px-2.5 py-1 text-omp-sm font-medium text-[var(--omp-text)] hover:bg-[var(--omp-selected-bg)]"
					>
						{t("configWarnings.chooseModel")}
					</button>
				</div>
			)}
			{showWarnings && (
				<div
					role="status"
					className="flex items-start gap-3 border-b border-[var(--omp-warning)]/30 bg-[var(--omp-warning-dim)] px-4 py-2.5"
				>
					<AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--omp-warning)]" />
					<div className="min-w-0 flex-1">
						<div className="text-omp-md font-medium text-[var(--omp-warning)]">
							{multiple ? t("configWarnings.titleMany", { count: warnings.length }) : t("configWarnings.title")}
						</div>
						{expanded ? (
							<ul className="mt-1 space-y-1">
								{warnings.map(warning => (
									<li
										key={warning}
										className="whitespace-pre-wrap break-words text-omp-sm text-[var(--omp-muted)]"
									>
										{warning}
									</li>
								))}
							</ul>
						) : (
							<div className="truncate text-omp-sm text-[var(--omp-muted)]" title={warnings[0]}>
								{warnings[0]}
							</div>
						)}
					</div>
					{(multiple || (warnings[0]?.length ?? 0) > 80) && (
						<button
							type="button"
							onClick={() => setExpanded(open => !open)}
							className="omp-pressable flex shrink-0 items-center gap-1 rounded-md border border-[var(--omp-border-muted)] px-2.5 py-1 text-omp-sm font-medium text-[var(--omp-text)] hover:bg-[var(--omp-selected-bg)]"
						>
							{expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
							{expanded ? t("configWarnings.showLess") : t("configWarnings.showAll")}
						</button>
					)}
					<button
						type="button"
						onClick={() => useSessionStore.setState({ configWarningsDismissed: key })}
						aria-label={t("common.close")}
						className="omp-pressable flex shrink-0 items-center justify-center rounded-md p-1 text-[var(--omp-dim)] hover:bg-[var(--omp-selected-bg)] hover:text-[var(--omp-text)]"
					>
						<X size={14} />
					</button>
				</div>
			)}
		</>
	);
}
