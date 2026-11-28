import "./agent-notch-settings.css";
import { ArrowDown, ArrowUp, Blocks, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	type AgentNotchState,
	DEFAULT_AGENT_NOTCH_SETTINGS,
	NOTCH_AGENTS,
	type NotchAgent,
	type AgentNotchSettings as NotchSettings,
	type NotchWidgetKind,
} from "../../../shared/agent-notch";
import type { NotchIntegrationInfo } from "../../../shared/notch-integrations";
import copilotMark from "../../assets/agent-copilot.svg";
import cursorMark from "../../assets/agent-cursor.svg";
import opencodeMark from "../../assets/agent-opencode.svg";
import anthropicMark from "../../assets/provider-anthropic.svg";
import geminiMark from "../../assets/provider-gemini.svg";
import openaiMark from "../../assets/provider-openai.svg";
import wisaMark from "../../assets/wisa-mark.png";
import { describeError } from "../../lib/errors";
import { useT } from "../../lib/i18n";
import { reportRuntimeError } from "../../lib/runtime-errors";
import { Button } from "../common";
import { Toggle } from "./editors/Toggle";
import { NotchMiniApps } from "./NotchMiniApps";

const widgetKinds: NotchWidgetKind[] = ["sessions", "clock", "note", "activity"];
const agentNames: Record<NotchAgent, string> = {
	wisa: "Wisa",
	claude: "Claude Code",
	codex: "Codex",
	cursor: "Cursor",
	gemini: "Gemini CLI",
	copilot: "GitHub Copilot",
	opencode: "OpenCode",
	custom: "Custom",
};

const agentMarks: Record<NotchAgent, string | null> = {
	wisa: wisaMark,
	claude: anthropicMark,
	codex: openaiMark,
	cursor: cursorMark,
	gemini: geminiMark,
	copilot: copilotMark,
	opencode: opencodeMark,
	custom: null,
};

export function AgentNotchSettings({
	draft: externalDraft,
	onDraftChange,
}: {
	draft?: NotchSettings | null;
	onDraftChange?: (draft: NotchSettings | null) => void;
} = {}) {
	const t = useT();
	const api = window.omp?.notch;
	const [state, setState] = useState<AgentNotchState | null>(null);
	const [localDraft, setLocalDraft] = useState<NotchSettings | null>(null);
	const draft = externalDraft === undefined ? localDraft : externalDraft;
	const setDraft = onDraftChange ?? setLocalDraft;
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [saved, setSaved] = useState(false);
	const [integrations, setIntegrations] = useState<NotchIntegrationInfo[]>([]);
	const [confirmation, setConfirmation] = useState<"import" | NotchIntegrationInfo | null>(null);
	const locked = useRef(false);
	const revision = useRef(0);
	const mounted = useRef(false);
	const dragged = useRef<string | null>(null);
	const confirmationRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (confirmation) confirmationRef.current?.scrollIntoView?.({ block: "nearest" });
	}, [confirmation]);
	const fail = useCallback(
		(cause: unknown, operation: string) => {
			reportRuntimeError("preload", cause, { details: { feature: "agent-notch", operation } });
			if (mounted.current)
				setError(
					/No handler registered for ['"]agent-notch:/.test(String(cause))
						? t("notch.restartRequired")
						: describeError(cause),
				);
		},
		[t],
	);
	const loadState = useCallback(async () => {
		if (!api) return;
		const before = revision.current;
		setError(null);
		try {
			const next = await api.getState();
			if (mounted.current && revision.current === before) setState(next);
		} catch (cause) {
			fail(cause, "get");
		}
	}, [api, fail]);
	useEffect(() => {
		mounted.current = true;
		const unsubscribe = api?.onChanged(next => {
			revision.current++;
			setState(next);
		});
		void loadState();
		if (api) {
			if (
				typeof api.integrations !== "function" ||
				typeof api.connectAgent !== "function" ||
				typeof api.exportSetup !== "function" ||
				typeof api.importSetup !== "function"
			)
				setError(t("notch.restartRequired"));
			else
				void api
					.integrations()
					.then(next => {
						if (mounted.current) setIntegrations(next);
					})
					.catch(cause => fail(cause, "integrations"));
		}
		return () => {
			mounted.current = false;
			revision.current++;
			unsubscribe?.();
		};
	}, [api, loadState, fail, t]);
	const settings = draft ?? state?.settings ?? DEFAULT_AGENT_NOTCH_SETTINGS;
	const update = (patch: Partial<NotchSettings>) => {
		setDraft({ ...settings, ...patch });
		setSaved(false);
		// Toggle must not announce a persisted save for a local draft change.
		return Promise.resolve(false);
	};
	async function run(operation: string, action: () => Promise<void>) {
		if (locked.current) return;
		locked.current = true;
		setBusy(true);
		setError(null);
		setSaved(false);
		try {
			await action();
		} catch (cause) {
			fail(cause, operation);
		} finally {
			locked.current = false;
			if (mounted.current) setBusy(false);
		}
	}
	async function save() {
		if (!api || !state) return;
		await run("configure", async () => {
			const next = await api.configure(settings);
			if (!mounted.current) return;
			revision.current++;
			setState(next);
			if (next.error) {
				setError(next.error);
				return;
			}
			setDraft(null);
			setSaved(true);
		});
	}
	function move(id: string, to: number) {
		const widgets = [...settings.widgets];
		const from = widgets.findIndex(widget => widget.id === id);
		if (from < 0 || to < 0 || to >= widgets.length || from === to) return;
		const [widget] = widgets.splice(from, 1);
		widgets.splice(to, 0, widget);
		update({ widgets });
	}
	const problem =
		error ??
		state?.error ??
		(!api ? t("notch.restartRequired") : state && !state.available ? t("notch.unavailable") : null);
	return (
		<section id="setting-gui-agentNotch" className="notch-settings">
			<Toggle
				checked={settings.enabled}
				className="notch-toggle"
				disabled={busy || !state}
				label={t("notch.enabled")}
				onChange={enabled => update({ enabled })}
			/>
			<NotchMiniApps />
			<fieldset className="notch-settings-fields" disabled={busy || !state}>
				<details className="notch-options">
					<summary>{t("notch.behavior")}</summary>
					<div className="notch-control-grid">
						<label className="notch-display-select">
							{t("notch.displays")}
							<select
								className="omp-input"
								value={settings.displays}
								onChange={event => update({ displays: event.target.value === "primary" ? "primary" : "all" })}
							>
								<option value="all">{t("notch.all")}</option>
								<option value="primary">{t("notch.primary")}</option>
							</select>
						</label>
						{(
							[
								"showWhenIdle",
								"openOnHover",
								"openForApprovals",
								"approveInNotch",
								"shortcuts",
								"sounds",
							] as const
						).map(key => (
							<Toggle
								key={key}
								checked={settings[key]}
								className="notch-toggle"
								label={t(key === "showWhenIdle" ? "notch.idle" : `notch.${key}`)}
								onChange={value => update({ [key]: value })}
							/>
						))}
					</div>
				</details>
				<details className="notch-options">
					<summary>{t("notch.appearance")}</summary>
					<div className="notch-colors">
						{(["background", "foreground", "accent"] as const).map(key => (
							<label key={key}>
								<input
									type="color"
									value={settings[key]}
									onChange={event => update({ [key]: event.target.value })}
								/>
								{t(`notch.${key}`)}
							</label>
						))}
					</div>
					<div className="notch-control-grid">
						{(
							[
								{ key: "width", min: 560, max: 1100, step: 1 },
								{ key: "maxCards", min: 1, max: 10, step: 1 },
								{ key: "opacity", min: 0.4, max: 1, step: 0.01 },
								{ key: "radius", min: 0, max: 48, step: 1 },
							] as const
						).map(({ key, min, max, step }) => (
							<label key={key} className="notch-range">
								<span>
									{t(`notch.${key}`)} <output>{settings[key]}</output>
								</span>
								<input
									type="range"
									min={min}
									max={max}
									step={step}
									value={settings[key]}
									onChange={event => update({ [key]: Number(event.target.value) })}
								/>
							</label>
						))}
					</div>
				</details>
				<details className="notch-options">
					<summary>
						{t("notch.widgets")} <span className="notch-count">{settings.widgets.length}/12</span>
					</summary>
					<p className="notch-hint">{t("notch.widgetHelp")}</p>
					<div className="flex flex-wrap gap-2">
						{widgetKinds.map(kind => (
							<Button
								key={kind}
								size="sm"
								variant="secondary"
								disabled={settings.widgets.length >= 12}
								onClick={() =>
									update({
										widgets: [...settings.widgets, { id: crypto.randomUUID(), kind, title: "", text: "" }],
									})
								}
							>
								{t("notch.add", { kind: t(`notch.widget.${kind}`) })}
							</Button>
						))}
					</div>
					<ol className="notch-widget-list">
						{settings.widgets.map((widget, index) => (
							<li
								key={widget.id}
								draggable
								onDragStart={event => {
									dragged.current = widget.id;
									event.dataTransfer.setData("text/plain", widget.id);
								}}
								onDragEnd={() => {
									dragged.current = null;
								}}
								onDragOver={event => event.preventDefault()}
								onDrop={event => {
									event.preventDefault();
									if (dragged.current) move(dragged.current, index);
									dragged.current = null;
								}}
							>
								<div className="notch-widget-heading">
									<span>{t(`notch.widget.${widget.kind}`)}</span>
									<div className="flex gap-1">
										<Button
											size="sm"
											variant="ghost"
											aria-label={t("notch.up")}
											title={t("notch.up")}
											disabled={index === 0}
											onClick={() => move(widget.id, index - 1)}
										>
											<ArrowUp aria-hidden size={16} />
										</Button>
										<Button
											size="sm"
											variant="ghost"
											aria-label={t("notch.down")}
											title={t("notch.down")}
											disabled={index === settings.widgets.length - 1}
											onClick={() => move(widget.id, index + 1)}
										>
											<ArrowDown aria-hidden size={16} />
										</Button>
										<Button
											size="sm"
											variant="ghost"
											aria-label={t("notch.remove")}
											title={t("notch.remove")}
											onClick={() =>
												update({ widgets: settings.widgets.filter(item => item.id !== widget.id) })
											}
										>
											<X aria-hidden size={16} />
										</Button>
									</div>
								</div>
								<label className="notch-widget-input">
									{t("notch.widgetTitle")}
									<input
										className="omp-input"
										maxLength={120}
										value={widget.title}
										onChange={event =>
											update({
												widgets: settings.widgets.map(item =>
													item.id === widget.id ? { ...item, title: event.target.value } : item,
												),
											})
										}
									/>
								</label>
								{widget.kind === "note" && (
									<label className="notch-widget-input">
										{t("notch.noteText")}
										<textarea
											className="omp-input"
											rows={2}
											maxLength={4000}
											value={widget.text}
											onChange={event =>
												update({
													widgets: settings.widgets.map(item =>
														item.id === widget.id ? { ...item, text: event.target.value } : item,
													),
												})
											}
										/>
									</label>
								)}
							</li>
						))}
					</ol>
				</details>
				<section aria-label={t("notch.agents")} className="notch-agents">
					<h3>{t("notch.agents")}</h3>
					<p className="notch-hint">{t("notch.agentsHelp")}</p>
					<div className="notch-agent-grid">
						{NOTCH_AGENTS.map(agent => {
							const info = integrations.find(item => item.agent === agent);
							const name = agent === "custom" ? t("notch.custom") : agentNames[agent];
							const mark = agentMarks[agent];
							return (
								<article
									key={agent}
									aria-label={name}
									className="notch-agent-card"
									data-agent={agent}
									data-selected={settings.agents.includes(agent)}
								>
									<span aria-hidden="true" className="notch-agent-art">
										{mark ? <span style={{ maskImage: `url("${mark}")` }} /> : <Blocks strokeWidth={1} />}
									</span>
									<Toggle
										checked={settings.agents.includes(agent)}
										label={name}
										className="notch-agent-toggle"
										onChange={checked =>
											update({
												agents: checked
													? [...settings.agents, agent]
													: settings.agents.filter(item => item !== agent),
											})
										}
									/>
									<div className="notch-agent-footer">
										<span className="notch-hint">
											{t(
												agent === "wisa"
													? "notch.builtIn"
													: info?.connected
														? "notch.connected"
														: "notch.disconnected",
											)}
										</span>
										{info && (
											<Button size="sm" variant="ghost" onClick={() => setConfirmation(info)}>
												{t(info.connected ? "notch.disconnect" : "notch.connect")}
											</Button>
										)}
									</div>
								</article>
							);
						})}
					</div>
				</section>
				{integrations.length > 0 && (
					<details className="notch-options">
						<summary>{t("notch.connectionDetails")}</summary>
						<div className="notch-connection-details">
							{integrations.map(info => (
								<div key={info.agent}>
									<h4>{info.agent === "custom" ? t("notch.custom") : agentNames[info.agent]}</h4>
									<code>{info.command}</code>
									<code>{info.configPath}</code>
									{info.agent === "custom" && <p className="notch-hint">{t("notch.customHelp")}</p>}
								</div>
							))}
						</div>
					</details>
				)}
			</fieldset>
			<details className="notch-options">
				<summary>{t("notch.preview")}</summary>
				<p className="notch-hint">{t("notch.previewHelp")}</p>
				<div className="overflow-x-auto py-3">
					<div
						className="mx-auto space-y-2 p-4"
						style={{
							width: settings.width,
							background: settings.background,
							color: settings.foreground,
							opacity: settings.opacity,
							borderRadius: settings.radius,
						}}
					>
						{settings.widgets.length === 0 && <p>{t("notch.empty")}</p>}
						{settings.widgets.map(widget => (
							<section
								key={widget.id}
								className="space-y-1 border-b pb-3 last:border-0"
								style={{ borderColor: settings.accent }}
							>
								<h4 style={{ color: settings.accent }}>{widget.title || t(`notch.widget.${widget.kind}`)}</h4>
								<p className="whitespace-pre-wrap break-words">
									{widget.kind === "note"
										? widget.text
										: widget.kind === "clock"
											? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(
													new Date(),
												)
											: t(widget.kind === "sessions" ? "notch.noSessions" : "notch.noActivity")}
								</p>
							</section>
						))}
					</div>
				</div>
			</details>
			<div className="notch-actions">
				<Button size="sm" variant="primary" disabled={busy || !state || !draft} onClick={() => void save()}>
					{t("notch.save")}
				</Button>
				<Button
					size="sm"
					variant="ghost"
					disabled={busy || !draft}
					onClick={() => {
						setDraft(null);
						setSaved(false);
					}}
				>
					{t("notch.discard")}
				</Button>
				<div className="notch-preset-actions">
					<Button
						size="sm"
						variant="ghost"
						title={t("notch.saveHelp")}
						disabled={busy || !state || !!draft}
						onClick={() => {
							if (api)
								void run("export", async () => {
									await api.exportSetup();
								});
						}}
					>
						{t("notch.export")}
					</Button>
					<Button size="sm" variant="ghost" disabled={busy || !state} onClick={() => setConfirmation("import")}>
						{t("notch.import")}
					</Button>
				</div>
			</div>
			<p className="notch-hint">{t("notch.saveHint")}</p>
			{confirmation && (
				<div
					role="alertdialog"
					ref={confirmationRef}
					aria-label={t("notch.confirmTitle")}
					className="space-y-3 rounded-lg border border-(--omp-border) p-4"
				>
					<h3>
						{t("notch.confirmTitle")} —{" "}
						{t(
							confirmation === "import"
								? "notch.import"
								: confirmation.connected
									? "notch.disconnect"
									: "notch.connect",
						)}
					</h3>
					<p>
						{confirmation === "import"
							? t("notch.importConfirm")
							: t("notch.connectConfirm", {
									path: confirmation.configPath,
									agent: confirmation.agent === "custom" ? t("notch.custom") : agentNames[confirmation.agent],
								})}
					</p>
					<Button
						disabled={busy}
						onClick={() => {
							const target = confirmation;
							setConfirmation(null);
							if (!api) return;
							if (target === "import")
								void run("import", async () => {
									const next = await api.importSetup();
									if (next && mounted.current) {
										revision.current++;
										setState(next);
										if (next.error) setError(next.error);
										else {
											setDraft(null);
											setSaved(true);
										}
									}
								});
							else
								void run("connect", async () => {
									const next = await api.connectAgent(target.agent, !target.connected);
									if (mounted.current) setIntegrations(next);
								});
						}}
					>
						{t("notch.confirm")}
					</Button>
					<Button variant="secondary" disabled={busy} onClick={() => setConfirmation(null)}>
						{t("notch.cancel")}
					</Button>
				</div>
			)}
			{problem && (
				<p className="text-omp-sm text-(--omp-error)" role="alert">
					{t("notch.error", { error: problem })}
				</p>
			)}
			{saved && !problem && <p role="status">{t("notch.saved")}</p>}
			{error && (
				<Button onClick={() => void loadState()} size="sm" variant="secondary">
					{t("common.retry")}
				</Button>
			)}
		</section>
	);
}
