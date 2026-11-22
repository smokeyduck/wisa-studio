/**
 * Phone dialog: one row per tab, each with the browser link a phone opens and a
 * QR code for it, so a session can be picked up from a phone without retyping a
 * 60-character key. Links and rooms are the agent's own collab feature — this
 * dialog only collects them per tab and renders them.
 */
import { Copy, ExternalLink, LogOut, Radio, RefreshCw, RotateCcw, ShieldCheck, Smartphone } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import type { CollabPhoneEntry } from "../../../shared/collab-phone";
import { copyText } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { qrDrawing } from "../../lib/qr";
import { useCollabPhoneStore } from "../../stores/collab-phone";
import { usePhoneHubStore } from "../../stores/phone-hub";
import { type SessionTab, useTabsStore } from "../../stores/tabs";
import { toast } from "../../stores/toast";
import { useUiStore } from "../../stores/ui";
import { Button, Modal, Spinner } from "../common";

/** How often the open dialog re-reads each tab's room (participants change live). */
const REFRESH_MS = 3000;

export function PhoneDialog() {
	const t = useT();
	const open = useUiStore(state => state.phoneOpen);
	const close = useUiStore(state => state.closePhone);
	const snapshot = useCollabPhoneStore(state => state.snapshot);
	const error = useCollabPhoneStore(state => state.error);
	const pending = useCollabPhoneStore(state => state.pending);
	const refresh = useCollabPhoneStore(state => state.refresh);
	const setAutoStart = useCollabPhoneStore(state => state.setAutoStart);
	const tabs = useTabsStore(state => state.tabs);

	useEffect(() => {
		if (!open) return;
		void refresh();
		const timer = window.setInterval(() => {
			if (document.visibilityState === "visible") void refresh();
		}, REFRESH_MS);
		return () => window.clearInterval(timer);
	}, [open, refresh]);

	/** Entries are matched to tabs for their labels; a tab with no sidecar has no entry. */
	const rows = useMemo(() => {
		const byTab = new Map((snapshot?.tabs ?? []).map(entry => [entry.tabId, entry]));
		return tabs.map(tab => ({ tab, entry: byTab.get(tab.id) ?? null }));
	}, [snapshot, tabs]);

	const hosting = rows.filter(row => row.entry?.role === "host").length;

	return (
		<Modal onClose={close} open={open} size="lg" title={t("phone.title")}>
			<div className="space-y-4">
				<p className="text-omp-xs text-(--omp-dim)">{t("phone.desc")}</p>
				<HubRow />
				<AutoHostRow
					disabled={!snapshot}
					mode={snapshot?.autoStart ?? "off"}
					onChange={mode => void setAutoStart(mode)}
				/>
				<div className="flex items-center justify-between text-omp-xs text-(--omp-dim)">
					<span>{t("phone.hostingCount").replace("{count}", String(hosting))}</span>
					<Button onClick={() => void refresh()} size="sm" variant="ghost">
						<RefreshCw size={13} /> {t("phone.refresh")}
					</Button>
				</div>
				{error ? <div className="text-omp-md text-(--omp-error)">{error}</div> : null}
				<div className="space-y-3">
					{rows.map(({ tab, entry }) => (
						<TabRow entry={entry} key={tab.id} pending={pending[tab.id] === true} tab={tab} />
					))}
				</div>
			</div>
		</Modal>
	);
}

/**
 * The one link that reaches every session.
 *
 * This is the feature the per-tab rows below cannot give: one scan, then the
 * phone can list, open, switch and start sessions, because the hub it reaches
 * speaks a protocol about the whole app rather than one agent room. The trade
 * is that the link is a credential for all of them, which is why revoking is a
 * first-class button here and not hidden behind "turn it off".
 */
function HubRow() {
	const t = useT();
	const state = usePhoneHubStore(store => store.state);
	const pending = usePhoneHubStore(store => store.pending);
	const error = usePhoneHubStore(store => store.error);
	const refresh = usePhoneHubStore(store => store.refresh);
	const start = usePhoneHubStore(store => store.start);
	const stop = usePhoneHubStore(store => store.stop);
	const revoke = usePhoneHubStore(store => store.revoke);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const link = state?.link ?? "";
	/**
	 * The link shown in the dialog. It is the room and key with no scheme: the
	 * page URL in front of them is plumbing (the QR and Copy carry the full
	 * URL), and the relay's own path cannot be opened on its own, so showing
	 * the bare socket URL would invite a 400 in a phone browser.
	 */
	const shown = (state?.socketLink ?? "").replace(/^wss?:\/\//, "");
	const copy = useCallback(
		async (value: string) => {
			if (await copyText(value)) toast({ variant: "success", message: t("phone.copied") });
			else toast({ variant: "error", message: t("phone.copyFailed") });
		},
		[t],
	);

	return (
		<div className="space-y-3 rounded-lg border border-(--omp-border) p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2 text-omp-md font-medium text-(--omp-text)">
						<Smartphone size={14} />
						{t("phone.hubTitle")}
					</div>
					<p className="mt-1 text-omp-xs text-(--omp-dim)">{t("phone.hubDesc")}</p>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{pending ? <Spinner size="sm" /> : null}
					{link ? (
						<>
							<Button disabled={pending} onClick={() => void revoke()} size="sm" variant="secondary">
								<RotateCcw size={13} /> {t("phone.hubRevoke")}
							</Button>
							<Button disabled={pending} onClick={() => void stop()} size="sm" variant="danger">
								<LogOut size={13} /> {t("phone.hubStop")}
							</Button>
						</>
					) : (
						<Button disabled={pending} onClick={() => void start()} size="sm">
							<Radio size={13} /> {t("phone.hubStart")}
						</Button>
					)}
				</div>
			</div>
			{error ? <div className="text-omp-md text-(--omp-error)">{error}</div> : null}
			{link ? (
				<div className="flex items-start gap-3">
					<QrCode value={link} />
					<div className="min-w-0 flex-1 space-y-2">
						<code
							className="block overflow-hidden text-ellipsis whitespace-nowrap rounded bg-(--omp-code-bg) px-2 py-1 text-omp-xs text-(--omp-text)"
							title={link}
						>
							{shown}
						</code>
						<div className="flex items-center gap-3 text-omp-xs text-(--omp-dim)">
							<span className="flex items-center gap-1">
								<ShieldCheck size={12} />
								{state?.live ? t("phone.hubLive") : t("phone.hubConnecting")}
							</span>
							<span>{t("phone.hubListeners").replace("{count}", String(state?.listeners ?? 0))}</span>
						</div>
						<div className="flex gap-2">
							<Button onClick={() => void copy(link)} size="sm" variant="secondary">
								<Copy size={13} /> {t("phone.copy")}
							</Button>
							<Button onClick={() => void window.omp.system.openExternal(link)} size="sm" variant="secondary">
								<ExternalLink size={13} /> {t("phone.open")}
							</Button>
						</div>
					</div>
				</div>
			) : (
				<p className="text-omp-xs text-(--omp-dim)">{t("phone.hubOff")}</p>
			)}
		</div>
	);
}

function AutoHostRow(props: {
	disabled: boolean;
	mode: "off" | "view" | "control";
	onChange: (mode: "off" | "view" | "control") => void;
}) {
	const t = useT();
	return (
		<div className="space-y-2 rounded-lg border border-(--omp-border-muted) p-3">
			<div className="text-omp-md font-medium text-(--omp-text)">{t("phone.autoHost")}</div>
			<p className="text-omp-xs text-(--omp-dim)">{t("phone.autoHostDesc")}</p>
			<div className="flex gap-2">
				{(["off", "control"] as const).map(mode => (
					<Button
						disabled={props.disabled}
						key={mode}
						onClick={() => props.onChange(mode)}
						size="sm"
						variant={props.mode === mode ? "primary" : "secondary"}
					>
						{mode === "off" ? t("phone.autoOff") : t("phone.autoControl")}
					</Button>
				))}
			</div>
			{/* A `view` policy set elsewhere still applies to terminal sessions;
			    the GUI cannot host a read-only room (see src/main/collab-phone.ts). */}
			{props.mode === "view" ? (
				<p className="text-omp-xs text-(--omp-warning)">{t("phone.autoViewTerminal")}</p>
			) : null}
		</div>
	);
}

function TabRow(props: { entry: CollabPhoneEntry | null; pending: boolean; tab: SessionTab }) {
	const t = useT();
	const start = useCollabPhoneStore(state => state.start);
	const stop = useCollabPhoneStore(state => state.stop);
	const { entry, pending, tab } = props;
	const link = entry?.webLink ?? entry?.webViewLink ?? "";
	const copy = useCallback(
		async (value: string) => {
			if (await copyText(value)) toast({ variant: "success", message: t("phone.copied") });
			else toast({ variant: "error", message: t("phone.copyFailed") });
		},
		[t],
	);

	return (
		<div className="rounded-lg border border-(--omp-border-muted) p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate text-omp-md font-medium text-(--omp-text)">{tab.title || tab.cwd}</div>
					{/* The cwd is only worth a second line when a title says something else. */}
					{tab.title ? <div className="truncate text-omp-xs text-(--omp-dim)">{tab.cwd}</div> : null}
					<div className="mt-1 flex items-center gap-2 text-omp-xs">
						{entry?.role === "host" ? (
							<span className="flex items-center gap-1 text-(--omp-success)">
								<Radio size={12} />
								{entry.readOnly ? t("phone.readOnlyRoom") : t("phone.liveRoom")}
							</span>
						) : entry?.ready ? (
							<span className="text-(--omp-dim)">{t("phone.notHosting")}</span>
						) : (
							<span className="text-(--omp-dim)">{entry?.error ?? t("phone.notReady")}</span>
						)}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{pending ? <Spinner size="sm" /> : null}
					{entry?.role === "host" ? (
						<Button disabled={pending} onClick={() => void stop(tab.id)} size="sm" variant="danger">
							<LogOut size={13} /> {t("phone.stop")}
						</Button>
					) : (
						<Button
							disabled={pending || !entry?.ready}
							onClick={() => void start(tab.id)}
							size="sm"
							title={entry?.ready ? undefined : t("phone.notReady")}
						>
							<Smartphone size={13} /> {t("phone.start")}
						</Button>
					)}
				</div>
			</div>
			{link ? (
				<div className="mt-3 flex items-start gap-3">
					<QrCode value={link} />
					<div className="min-w-0 flex-1 space-y-1">
						<code className="block overflow-hidden text-ellipsis whitespace-nowrap rounded bg-(--omp-code-bg) px-2 py-1 text-omp-xs text-(--omp-text)">
							{link}
						</code>
						{entry?.webViewLink ? (
							<button
								className="text-omp-xs text-(--omp-dim) underline-offset-2 hover:underline"
								onClick={() => void copy(entry.webViewLink ?? "")}
								type="button"
							>
								{t("phone.copyReadOnly")}
							</button>
						) : null}
						<div className="flex gap-2">
							<Button onClick={() => void copy(link)} size="sm" variant="secondary">
								<Copy size={13} /> {t("phone.copy")}
							</Button>
							<Button onClick={() => void window.omp.system.openExternal(link)} size="sm" variant="secondary">
								<ExternalLink size={13} /> {t("phone.open")}
							</Button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}

/** A scannable symbol, drawn as plain SVG so no HTML string is injected. */
function QrCode(props: { value: string }) {
	const result = useMemo(() => qrDrawing(props.value), [props.value]);
	if (!result.ok) return null;
	const { path, size } = result.drawing;
	return (
		<svg
			aria-hidden="true"
			className="shrink-0 rounded bg-white p-1"
			height={104}
			viewBox={`0 0 ${size} ${size}`}
			width={104}
		>
			<path d={path} fill="#000" />
		</svg>
	);
}
