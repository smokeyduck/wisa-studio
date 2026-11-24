// WinSell's contributions in this file: PolyForm Strict 1.0.0; see LICENSE-SCOPE.md.
import { ChevronRight, ClipboardCopy, ListChecks, MessageSquareText, Play, Search, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { IpcProjectAuditResponse } from "../../../shared/ipc-types";
import type { RunReport } from "../../../shared/scheduler-types";
import { describeProviderError } from "../../lib/errors";
import { useT } from "../../lib/i18n";
import { MarkdownRenderer } from "../../lib/markdown";
import { useTabsStore } from "../../stores/tabs";
import { toast } from "../../stores/toast";
import { useUiStore } from "../../stores/ui";
import { Badge, Button, Modal } from "../common";

type AuditFailure = Extract<IpcProjectAuditResponse, { error: string }>;
const SEVERITIES = ["error", "warn", "info"] as const;
const SEVERITY_VARIANT = { error: "error", warn: "warning", info: "info" } as const;
const AUDIT_AREAS = [
	{ id: "seo", label: "SEO", icon: Search },
	{ id: "geo", label: "GEO", icon: Sparkles },
	{ id: "aeo", label: "AEO", icon: MessageSquareText },
] as const;

type AuditFinding = RunReport["findings"][number];

function FindingDisclosure({ finding }: { finding: AuditFinding }) {
	const t = useT();
	const [expanded, setExpanded] = useState(false);
	return (
		<details
			className="group border-t border-(--omp-border-muted)"
			onToggle={event => setExpanded(event.currentTarget.open)}
		>
			<summary className="flex cursor-pointer list-none items-start gap-2.5 px-3 py-2.5 text-omp-sm font-medium wrap-anywhere hover:bg-(--omp-bg-tertiary) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--omp-accent) [&::-webkit-details-marker]:hidden">
				<ChevronRight aria-hidden className="mt-0.5 shrink-0 text-(--omp-muted) group-open:rotate-90" size={14} />
				{finding.title}
			</summary>
			{expanded && (
				<div className="px-4 pt-1 pb-3 text-omp-sm wrap-anywhere text-(--omp-muted) sm:pl-9">
					{finding.detail ? (
						<MarkdownRenderer content={finding.detail} omitImages />
					) : (
						<p>{t("projectAudit.noDetail")}</p>
					)}
				</div>
			)}
		</details>
	);
}

function AuditResults({ report }: { report: RunReport }) {
	const t = useT();
	const groups = SEVERITIES.map(severity => ({
		severity,
		findings: report.findings.filter(finding => (finding.severity ?? "info") === severity),
	})).filter(group => group.findings.length > 0);
	const copy = async () => {
		const lines = [t("projectAudit.results"), "", report.summary];
		for (const { severity, findings } of groups) {
			for (const finding of findings) {
				lines.push("", `- [${t(`projectAudit.severity.${severity}`)}] ${finding.title}`);
				if (finding.detail) lines.push(finding.detail);
			}
		}
		if (report.next) lines.push("", t("projectAudit.next"), report.next);
		try {
			await navigator.clipboard.writeText(lines.join("\n"));
			toast({ variant: "success", message: t("projectAudit.copied") });
		} catch {
			toast({ variant: "error", message: t("projectAudit.copyError") });
		}
	};
	return (
		<section className="space-y-4" aria-labelledby="project-audit-report">
			<div className="rounded-xl border border-(--omp-border-muted) p-4 sm:p-5">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 id="project-audit-report" className="text-omp-lg font-semibold">
						{t("projectAudit.results")}
					</h2>
					<Button icon={<ClipboardCopy size={14} />} onClick={() => void copy()} size="sm" variant="secondary">
						{t("projectAudit.copy")}
					</Button>
				</div>
				{(report.status === "partial" || report.status === "blocked") && (
					<div className="mt-2">
						<Badge variant="warning">{t(`tasks.run.reportStatus.${report.status}`)}</Badge>
					</div>
				)}
				<div className="mt-2 text-omp-sm wrap-anywhere text-(--omp-muted)">
					<MarkdownRenderer content={report.summary} omitImages />
				</div>
			</div>
			<section aria-labelledby="project-audit-findings">
				<h3 id="project-audit-findings" className="mb-2 text-omp-md font-semibold">
					{t("projectAudit.findings")}
				</h3>
				{groups.length > 0 ? (
					<div className="space-y-2">
						{groups.map(({ severity, findings }) => (
							<div key={severity} className="rounded-lg border border-(--omp-border-muted)">
								<h4 className="px-3 py-2">
									<Badge dot variant={SEVERITY_VARIANT[severity]}>
										{t(`projectAudit.severity.${severity}`)} · {findings.length}
									</Badge>
								</h4>
								{findings.map((finding, index) => (
									<FindingDisclosure key={index} finding={finding} />
								))}
							</div>
						))}
					</div>
				) : (
					<p className="text-omp-sm text-(--omp-muted)">{t("projectAudit.noFindings")}</p>
				)}
			</section>
			{report.next && (
				<section className="space-y-1.5 rounded-lg border border-(--omp-border-muted) p-4 text-omp-sm wrap-anywhere">
					<h3 className="flex items-center gap-2 font-semibold">
						<ListChecks aria-hidden size={15} className="shrink-0 text-(--omp-muted)" />
						{t("projectAudit.next")}
					</h3>
					<div className="text-(--omp-muted)">
						<MarkdownRenderer content={report.next} omitImages />
					</div>
				</section>
			)}
		</section>
	);
}

function AuditWorkspace({ cwd, tabId }: { cwd: string; tabId: string }) {
	const t = useT();
	const [busy, setBusy] = useState(false);
	const [cancelling, setCancelling] = useState(false);
	const [failure, setFailure] = useState<AuditFailure>();
	const [report, setReport] = useState<RunReport>();
	const pending = useRef<string>(null);
	useEffect(
		() => () => {
			const id = pending.current;
			pending.current = null;
			if (id) void window.omp.projectAudit.cancel(id).catch(() => {});
		},
		[],
	);

	const run = async () => {
		if (pending.current) return;
		const id = crypto.randomUUID();
		pending.current = id;
		setBusy(true);
		setFailure(undefined);
		setReport(undefined);
		try {
			const result = await window.omp.projectAudit.run(id, tabId);
			if (pending.current !== id) return;
			if ("report" in result) setReport(result.report);
			else setFailure(result);
		} catch (cause) {
			if (pending.current === id) setFailure({ error: "failed", detail: String(cause) });
		} finally {
			if (pending.current === id) {
				pending.current = null;
				setBusy(false);
				setCancelling(false);
			}
		}
	};
	const cancel = () => {
		const id = pending.current;
		if (!id) return;
		setCancelling(true);
		void window.omp.projectAudit.cancel(id).catch(() => {
			if (pending.current === id) setCancelling(false);
		});
	};

	return (
		<div className="space-y-4">
			<section className="space-y-4 rounded-xl border border-(--omp-border-muted) p-4 sm:p-5">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0 flex-1 basis-52">
						<h2 className="text-omp-lg font-semibold">{t("projectAudit.shortTitle")}</h2>
						<p className="mt-1 text-omp-sm text-(--omp-muted)">{t("projectAudit.description")}</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button icon={<Play size={14} />} loading={busy} onClick={() => void run()} variant="primary">
							{t("projectAudit.run")}
						</Button>
						{busy && (
							<Button disabled={cancelling} onClick={cancel} variant="ghost">
								{t("common.cancel")}
							</Button>
						)}
					</div>
				</div>
				<ul className="flex flex-wrap gap-2">
					{AUDIT_AREAS.map(({ id, label, icon: Icon }) => (
						<li key={id} className="min-w-0 flex-1 basis-40 rounded-lg border border-(--omp-border-muted) p-3">
							<div className="flex items-center gap-2 text-omp-sm font-semibold">
								<Icon aria-hidden className="shrink-0 text-(--omp-accent)" size={15} />
								{label}
							</div>
							<p className="mt-1 text-omp-xs text-(--omp-muted)">{t(`projectAudit.area.${id}`)}</p>
						</li>
					))}
				</ul>
				<div className="space-y-1 text-omp-xs text-(--omp-muted)">
					<p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
						<span className="font-medium text-(--omp-text)">{t("projectAudit.workspace")}</span>
						<span className="min-w-0 font-mono wrap-anywhere">{cwd}</span>
					</p>
					<p>{t("projectAudit.scope")}</p>
				</div>
			</section>
			{busy && (
				<p className="text-omp-sm text-(--omp-muted)" role="status">
					{t("projectAudit.running")}
				</p>
			)}
			{failure && (
				<div className="rounded-lg border border-(--omp-border-muted) p-3 text-omp-sm" role="status">
					<p className="font-medium">{t(`projectAudit.error.${failure.error}`)}</p>
					{failure.detail && (
						<p className="mt-1 text-omp-xs wrap-anywhere text-(--omp-muted)">
							{describeProviderError(failure.detail)}
						</p>
					)}
				</div>
			)}
			{report && <AuditResults report={report} />}
		</div>
	);
}

export function ProjectAuditPage() {
	const t = useT();
	const tab = useTabsStore(state => state.tabs.find(tab => tab.id === state.activeTabId));
	const close = useUiStore(state => state.returnToConversation);
	return (
		<Modal bodyClassName="p-0" dockable onClose={close} open title={t("projectAudit.title")}>
			<div className="settings-page-frame settings-content py-6">
				{tab?.cwd ? (
					<AuditWorkspace cwd={tab.cwd} key={`${tab.id}:${tab.cwd}`} tabId={tab.id} />
				) : (
					<p className="text-omp-sm text-(--omp-muted)">{t("projectAudit.error.noProject")}</p>
				)}
			</div>
		</Modal>
	);
}
