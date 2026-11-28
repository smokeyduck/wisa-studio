import { useEffect, useRef, useState } from "react";
import type { NotchAppsSnapshot } from "../../../shared/notch-apps";
import { describeError } from "../../lib/errors";
import { useT } from "../../lib/i18n";
import { Button } from "../common";

/** Management stays in Wisa, outside the untrusted mini-app's renderer. */
export function NotchMiniApps() {
	const t = useT();
	const api = window.omp?.notchApps;
	const [snapshot, setSnapshot] = useState<NotchAppsSnapshot | null>(null);
	const [selected, setSelected] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<string | null>(null);
	const mounted = useRef(false);
	const locked = useRef(false);
	useEffect(() => {
		mounted.current = true;
		if (!api)
			return () => {
				mounted.current = false;
			};
		let changed = false;
		const off = api.onChanged(value => {
			changed = true;
			setSnapshot(value);
		});
		void api
			.command({ action: "list" })
			.then(value => {
				if (mounted.current && !changed) setSnapshot(value);
			})
			.catch(cause => {
				if (mounted.current) setError(describeError(cause));
			});
		return () => {
			mounted.current = false;
			off();
		};
	}, [api]);
	async function command(action: string, id?: string, revisionId?: string) {
		if (!api || locked.current) return;
		locked.current = true;
		setBusy(true);
		setError(null);
		try {
			const next = await api.command({ action, id, revisionId });
			if (mounted.current) {
				setSnapshot(next);
				setDeleting(null);
			}
		} catch (cause) {
			if (mounted.current) setError(describeError(cause));
		} finally {
			locked.current = false;
			if (mounted.current) setBusy(false);
		}
	}
	return (
		<section className="notch-miniapps" aria-label={t("notch.apps.title")}>
			<h3>{t("notch.apps.title")}</h3>
			<p className="notch-hint">{t("notch.apps.help")}</p>
			<p className="notch-hint">{t("notch.apps.permissions")}</p>
			{!api && <p role="alert">{t("notch.restartRequired")}</p>}
			{snapshot?.apps.length === 0 && <p className="notch-hint">{t("notch.apps.empty")}</p>}
			{snapshot?.apps.map(app => {
				const revisionId = app.revisions.some(revision => revision.id === selected[app.id])
					? selected[app.id]
					: app.currentRevision;
				const active = snapshot.active?.appId === app.id;
				return (
					<article key={app.id} className="notch-miniapp-row">
						<strong>{app.name}</strong>
						{active && <span className="notch-hint">{t("notch.apps.active")}</span>}
						<label className="notch-miniapp-version">
							{t("notch.apps.version")}
							<select
								className="omp-input"
								value={revisionId}
								disabled={busy}
								onChange={event => setSelected(previous => ({ ...previous, [app.id]: event.target.value }))}
							>
								{app.revisions.map(revision => (
									<option key={revision.id} value={revision.id}>
										{new Date(revision.createdAt).toLocaleString()} · {revision.id.slice(0, 8)}
									</option>
								))}
							</select>
						</label>
						<div className="notch-actions">
							<Button size="sm" disabled={busy} onClick={() => void command("preview", app.id, revisionId)}>
								{t("notch.apps.preview")}
							</Button>
							<Button
								size="sm"
								variant="secondary"
								disabled={busy}
								onClick={() => void command(active ? "rollback" : "apply", app.id, revisionId)}
							>
								{t(active ? "notch.apps.restore" : "notch.apps.apply")}
							</Button>
							<Button size="sm" variant="ghost" disabled={busy} onClick={() => setDeleting(app.id)}>
								{t("notch.remove")}
							</Button>
						</div>
						{deleting === app.id && (
							<div role="alertdialog" aria-label={t("notch.apps.deleteTitle")}>
								<p>{t("notch.apps.deleteConfirm", { name: app.name })}</p>
								<Button size="sm" disabled={busy} onClick={() => void command("delete", app.id)}>
									{t("notch.confirm")}
								</Button>
								<Button size="sm" variant="ghost" disabled={busy} onClick={() => setDeleting(null)}>
									{t("notch.cancel")}
								</Button>
							</div>
						)}
					</article>
				);
			})}
			{(snapshot?.active || snapshot?.preview) && (
				<Button size="sm" variant="secondary" disabled={busy} onClick={() => void command("stop")}>
					{t("notch.apps.stop")}
				</Button>
			)}
			{(error || snapshot?.error) && (
				<p role="alert" className="text-(--omp-error)">
					{error || snapshot?.error}
				</p>
			)}
		</section>
	);
}
