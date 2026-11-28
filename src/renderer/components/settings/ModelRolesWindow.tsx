/** Model role assignments and eligible candidates are owned by the backend. */

import { ChevronDown, RefreshCw, Search } from "lucide-react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import type { ModelRoleCandidate, ModelRoleEntry, ModelRolesResult, ThinkingLevel } from "../../../shared/rpc-types";
import { isDevOverlayEvent } from "../../lib/dev-overlay";
import { describeError } from "../../lib/errors";
import { useT } from "../../lib/i18n";
import { useTabRpc } from "../../lib/tab-rpc";
import { useModelStore } from "../../stores/model";
import { useSessionStore } from "../../stores/session";
import { toast } from "../../stores/toast";
import { useUiStore } from "../../stores/ui";
import { AsyncSection, Button, Modal } from "../common";
import { JevRoutingSection } from "./JevRoutingSection";

type ThinkingSelector = ThinkingLevel | "auto";
type Translate = (k: string, p?: Record<string, string | number>) => string;

const BUILTIN_ROLES: Record<string, true> = {
	default: true,
	smol: true,
	slow: true,
	vision: true,
	plan: true,
	commit: true,
	tiny: true,
	memory: true,
	task: true,
	advisor: true,
	widget: true,
	image: true,
	web: true,
	speech: true,
	dictation: true,
	judge: true,
};

function roleName(role: ModelRoleEntry, t: Translate): string {
	return Object.hasOwn(BUILTIN_ROLES, role.id) ? t(`modelRoles.role.${role.id}.name`) : role.name;
}

interface RoleChange {
	role: string;
	modelId: string | null;
	/** Saved by the backend as the selector's `:level` suffix. */
	thinkingLevel?: ThinkingSelector;
	/** Saved level the newly picked model does not offer, so the role falls back to inherit. */
	droppedLevel?: ThinkingSelector;
}

function candidateKey(model: { provider: string; id: string }): string {
	return `${model.provider}/${model.id}`;
}

function levelName(level: ThinkingSelector, t: Translate): string {
	return level === "inherit" ? t("modelRoles.thinking.inherit") : t(`input.thinking.name.${level}`);
}

/**
 * The change a model pick makes: the role's explicit level carries over when
 * the new model offers it; otherwise it is dropped and reported, never kept.
 */
function modelPickChange(role: ModelRoleEntry, model: ModelRoleCandidate): RoleChange {
	const saved = role.selected?.thinkingLevel;
	const modelId = candidateKey(model);
	if (saved === undefined || saved === "inherit") return { role: role.id, modelId };
	if (model.thinkingLevels?.includes(saved)) return { role: role.id, modelId, thinkingLevel: saved };
	return { role: role.id, modelId, droppedLevel: saved };
}

function RoleRow({
	role,
	onChange,
	busy,
	sidecarReady,
	t,
}: {
	role: ModelRoleEntry;
	onChange: (change: RoleChange) => void;
	busy: boolean;
	sidecarReady: boolean;
	t: Translate;
}) {
	const name = roleName(role, t);
	const candidates = role.candidates ?? [];
	// The backend splits the `:level` suffix off; an older sidecar without
	// `selected` still matches unsuffixed selectors verbatim.
	const selectedKey = role.selected ? candidateKey(role.selected) : role.model;
	const currentCandidate = candidates.find(model => candidateKey(model) === selectedKey);
	const savedOnly = role.model && !currentCandidate;
	const savedLevel = role.selected?.thinkingLevel ?? "inherit";
	const levelOptions = currentCandidate?.thinkingLevels ?? [];
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const rootRef = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const listId = useId();

	const moveOptionFocus = useCallback((direction: -1 | 1, edge?: "first" | "last") => {
		const options = rootRef.current
			? Array.from(rootRef.current.querySelectorAll<HTMLButtonElement>('[role="option"]'))
			: [];
		if (options.length === 0) return;
		const active = document.activeElement as HTMLButtonElement | null;
		const currentIndex = active ? options.indexOf(active) : -1;
		const nextIndex =
			edge === "first"
				? 0
				: edge === "last"
					? options.length - 1
					: currentIndex < 0
						? direction > 0
							? 0
							: options.length - 1
						: (currentIndex + direction + options.length) % options.length;
		options[nextIndex]?.focus();
	}, []);
	const closePicker = useCallback(() => {
		setOpen(false);
		triggerRef.current?.focus();
	}, []);
	const handleOptionKeyDown = useCallback(
		(event: ReactKeyboardEvent<HTMLButtonElement>) => {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				moveOptionFocus(1);
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				moveOptionFocus(-1);
			} else if (event.key === "Home") {
				event.preventDefault();
				moveOptionFocus(1, "first");
			} else if (event.key === "End") {
				event.preventDefault();
				moveOptionFocus(-1, "last");
			} else if (event.key === "Escape") {
				event.preventDefault();
				closePicker();
			}
		},
		[closePicker, moveOptionFocus],
	);

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			if (isDevOverlayEvent(event)) return;
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		searchRef.current?.focus();
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [open]);

	useEffect(() => {
		if (!sidecarReady) setOpen(false);
	}, [sidecarReady]);

	const needle = query.trim().toLowerCase();
	const providerGroups = new Map<string, ModelRoleCandidate[]>();
	for (const model of candidates) {
		if (!model.name.toLowerCase().includes(needle) && !candidateKey(model).toLowerCase().includes(needle)) continue;
		const group = providerGroups.get(model.provider) ?? [];
		group.push(model);
		providerGroups.set(model.provider, group);
	}
	const currentLabel =
		currentCandidate?.name ??
		(role.model ? (role.selected?.id ?? role.model.split("/").pop()) : t("modelRoles.default"));

	return (
		<div className="omp-list-row flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[var(--omp-border-muted)] py-2">
			<span className="min-w-0 basis-28 text-omp-sm font-medium text-[var(--omp-text)] sm:basis-36">{name}</span>
			<div className="relative min-w-0 flex-1 basis-36" ref={rootRef}>
				<button
					aria-expanded={open}
					aria-controls={open ? listId : undefined}
					aria-haspopup="listbox"
					aria-label={t("modelRoles.select", { role: name })}
					className="flex h-7 w-full items-center gap-1 rounded-md border border-[var(--omp-border-muted)] bg-[var(--omp-input-bg)] px-2 text-left text-omp-sm text-[var(--omp-text)] focus:border-[var(--omp-border-accent)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
					disabled={busy || !sidecarReady}
					onClick={() => {
						setQuery("");
						setOpen(value => !value);
					}}
					ref={triggerRef}
					title={!sidecarReady ? t("modelRoles.notConnected") : (role.model ?? t("modelRoles.default"))}
					type="button"
				>
					<span className="min-w-0 flex-1 truncate">{currentLabel}</span>
					<ChevronDown className="shrink-0 text-[var(--omp-dim)]" size={12} />
				</button>
				{open && (
					<div
						className="absolute inset-x-0 z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-[var(--omp-border)] bg-[var(--omp-panel-bg)] p-1 shadow-[var(--omp-shadow-lg)]"
						id={listId}
						role="listbox"
					>
						<div className="flex items-center gap-1 border-b border-[var(--omp-border-muted)] px-2 py-1">
							<Search className="shrink-0 text-[var(--omp-dim)]" size={12} />
							<input
								aria-label={t("modelRoles.search")}
								className="min-w-0 flex-1 bg-transparent text-omp-sm text-[var(--omp-text)] outline-none"
								onChange={event => setQuery(event.target.value)}
								onKeyDown={event => {
									if (event.key === "Escape") {
										event.preventDefault();
										closePicker();
									} else if (event.key === "ArrowDown") {
										event.preventDefault();
										moveOptionFocus(1);
									} else if (event.key === "ArrowUp") {
										event.preventDefault();
										moveOptionFocus(-1);
									}
								}}
								placeholder={t("modelRoles.search")}
								ref={searchRef}
								value={query}
							/>
						</div>
						<button
							aria-selected={!role.model}
							className="flex w-full items-center rounded px-2 py-1.5 text-left text-omp-sm hover:bg-[var(--omp-selected-bg)]"
							disabled={!sidecarReady}
							onClick={() => {
								closePicker();
								onChange({ role: role.id, modelId: null });
							}}
							role="option"
							onKeyDown={handleOptionKeyDown}
							tabIndex={-1}
							title={!sidecarReady ? t("modelRoles.notConnected") : undefined}
							type="button"
						>
							{t("modelRoles.default")}
						</button>
						{savedOnly && (
							<button
								aria-selected
								className="flex w-full items-center break-all rounded px-2 py-1.5 text-left text-omp-sm hover:bg-[var(--omp-selected-bg)]"
								disabled={!sidecarReady}
								onClick={() => {
									closePicker();
									onChange({ role: role.id, modelId: role.model ?? null });
								}}
								role="option"
								onKeyDown={handleOptionKeyDown}
								tabIndex={-1}
								title={!sidecarReady ? t("modelRoles.notConnected") : undefined}
								type="button"
							>
								{t("modelRoles.savedSelector", { model: role.model! })}
							</button>
						)}
						{candidates.length === 0 && (
							<p className="px-2 py-1 text-omp-xs text-[var(--omp-dim)]">{t("modelRoles.noCandidates")}</p>
						)}
						{[...providerGroups].map(([provider, models]) => (
							<div aria-label={provider} key={provider} role="group">
								<div className="px-2 pt-2 pb-0.5 text-omp-xxs font-semibold text-[var(--omp-dim)]">
									{provider}
								</div>
								{models.map(model => {
									const value = candidateKey(model);
									return (
										<button
											key={value}
											aria-selected={value === selectedKey}
											className="flex w-full min-w-0 flex-col items-start rounded px-2 py-1.5 text-left text-omp-sm hover:bg-[var(--omp-selected-bg)]"
											disabled={!sidecarReady}
											onClick={() => {
												closePicker();
												onChange(modelPickChange(role, model));
											}}
											onKeyDown={handleOptionKeyDown}
											role="option"
											tabIndex={-1}
											title={!sidecarReady ? t("modelRoles.notConnected") : value}
											type="button"
										>
											<span className="w-full truncate">{model.name}</span>
											<span className="w-full truncate font-mono text-omp-xs text-[var(--omp-dim)]">
												{model.provider}/{model.id}
											</span>
										</button>
									);
								})}
							</div>
						))}
					</div>
				)}
			</div>
			{currentCandidate && levelOptions.length > 0 && (
				<select
					aria-label={t("modelRoles.thinking", { role: name })}
					className="h-7 min-w-0 max-w-full rounded-md border border-[var(--omp-border-muted)] bg-[var(--omp-input-bg)] px-1.5 text-omp-sm text-[var(--omp-text)] focus:border-[var(--omp-border-accent)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
					disabled={busy || !sidecarReady}
					onChange={event =>
						onChange({
							role: role.id,
							modelId: candidateKey(currentCandidate),
							thinkingLevel: event.target.value as ThinkingSelector,
						})
					}
					title={!sidecarReady ? t("modelRoles.notConnected") : t("modelRoles.thinking", { role: name })}
					value={savedLevel}
				>
					{/* A hand-written level the model does not list still shows as saved. */}
					{!levelOptions.includes(savedLevel) && (
						<option value={savedLevel}>
							{t("modelRoles.thinking.saved", { level: levelName(savedLevel, t) })}
						</option>
					)}
					{levelOptions.map(level => (
						<option key={level} value={level}>
							{levelName(level, t)}
						</option>
					))}
				</select>
			)}
		</div>
	);
}

export function ModelRolesWindow() {
	const tabRpc = useTabRpc();
	const open = useUiStore(s => s.modelRolesOpen);
	const close = useUiStore(s => s.closeModelRoles);
	const t = useT();
	const sidecarReady = useSessionStore(s => s.status) === "ready";
	const catalogGeneration = useModelStore(s => s.catalogGeneration);
	const requestVersion = useRef(0);

	const [roles, setRoles] = useState<ModelRoleEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [busyRole, setBusyRole] = useState<string | null>(null);

	const load = useCallback(async () => {
		const version = ++requestVersion.current;
		setLoading(true);
		if (!sidecarReady) {
			// Not connecting is a distinct state from an empty answer: the list keeps
			// whatever it last showed and says why it cannot refresh.
			setError(t("modelRoles.notConnected"));
			setLoading(false);
			return;
		}
		try {
			// The backend owns role metadata and the eligible candidate pool per
			// role; get_model_roles returns everything the window renders.
			const res = await tabRpc.getModelRoles();
			if (version !== requestVersion.current) return;
			if (res.success) {
				setRoles((res.data as ModelRolesResult).roles);
				setError(null);
			} else {
				setError(describeError(res.error));
			}
		} catch (cause) {
			if (version === requestVersion.current) setError(describeError(cause));
		} finally {
			if (version === requestVersion.current) setLoading(false);
		}
	}, [sidecarReady, t, tabRpc.getModelRoles]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: invalidate replies when their originating RPC client changes.
	useEffect(() => {
		return () => {
			requestVersion.current++;
		};
	}, [tabRpc.getModelRoles]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: discovery can change the eligible role pool without changing the RPC client.
	useEffect(() => {
		if (open) void load();
	}, [open, load, catalogGeneration]);

	const sections = useMemo(() => {
		const visible = roles.filter(role => !role.hidden);
		return [
			{ key: "chat" as const, roles: visible.filter(role => role.section === "chat") },
			{ key: "kind" as const, roles: visible.filter(role => role.section !== "chat") },
		].filter(section => section.roles.length > 0);
	}, [roles]);

	const handleChange = async ({ role, modelId, thinkingLevel, droppedLevel }: RoleChange) => {
		if (!sidecarReady) return;
		setBusyRole(role);
		try {
			const res = await tabRpc.setModelRole(role, modelId, thinkingLevel);
			if (res.success) {
				// The receipt carries the stored selector, `:level` suffix included.
				const saved = (res.data as { modelId?: string | null } | undefined)?.modelId ?? modelId;
				const entry = roles.find(entry => entry.id === role);
				const name = entry ? roleName(entry, t) : role;
				const message = saved
					? t("modelRoles.set", { role: name, model: saved })
					: t("modelRoles.cleared", { role: name });
				toast(
					droppedLevel && modelId
						? {
								variant: "warning",
								title: message,
								message: t("modelRoles.levelDropped", { model: modelId, level: levelName(droppedLevel, t) }),
							}
						: { variant: "success", message },
				);
				await load();
			} else {
				toast({ variant: "error", title: t("modelRoles.failed"), message: res.error });
			}
		} catch (cause) {
			toast({ variant: "error", title: t("modelRoles.failed"), message: String(cause) });
		} finally {
			setBusyRole(null);
		}
	};

	return (
		<Modal dockable open={open} onClose={close} title={t("modelRoles.title")} size="lg">
			<div className="flex min-w-0 flex-col gap-3" data-tour="roles">
				<JevRoutingSection open={open} roles={roles} onRefresh={load} />
				<div className="flex items-center justify-between">
					<span className="omp-section-label">{t("modelRoles.header")}</span>
					<Button
						size="sm"
						variant="ghost"
						icon={<RefreshCw size={12} />}
						onClick={() => void load()}
						disabled={!sidecarReady}
						loading={loading}
						title={!sidecarReady ? t("modelRoles.notConnected") : t("modelRoles.refresh")}
					>
						{t("modelRoles.refresh")}
					</Button>
				</div>

				<AsyncSection
					className="py-8"
					empty={sections.length === 0}
					emptyLabel={t("modelRoles.empty")}
					error={error}
					errorTitle={t("modelRoles.loadFailed")}
					hasData={sections.length > 0}
					loading={loading}
					onRetry={() => void load()}
					staleLabel={t("modelRoles.stale")}
				>
					{sections.map(section => (
						<div key={section.key} className="mb-3 flex min-w-0 flex-col">
							<span className="omp-section-label">{t(`modelRoles.section.${section.key}`)}</span>
							{section.roles.map(role => (
								<RoleRow
									key={role.id}
									role={role}
									onChange={handleChange}
									busy={busyRole === role.id}
									sidecarReady={sidecarReady}
									t={t}
								/>
							))}
						</div>
					))}
					<details className="text-omp-sm text-[var(--omp-muted)]">
						<summary className="cursor-pointer py-1 font-medium">{t("modelRoles.help")}</summary>
						<dl className="mt-2 grid gap-2">
							{sections
								.flatMap(section => section.roles)
								.map(role => (
									<div key={role.id}>
										<dt className="font-medium text-[var(--omp-text)]">{roleName(role, t)}</dt>
										{Object.hasOwn(BUILTIN_ROLES, role.id) && (
											<dd>{t(`modelRoles.role.${role.id}.description`)}</dd>
										)}
									</div>
								))}
						</dl>
					</details>
				</AsyncSection>
			</div>
		</Modal>
	);
}
