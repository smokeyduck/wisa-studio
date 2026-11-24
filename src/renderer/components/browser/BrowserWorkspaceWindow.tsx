import { ArrowLeft, ArrowRight, Globe2, Link2, Plus, RotateCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { BrowserWorkspaceAction, BrowserWorkspaceState } from "../../../shared/browser-workspace";
import { cx } from "../../lib/format";
import { useT } from "../../lib/i18n";

const control =
	"grid h-8 w-8 shrink-0 place-items-center rounded hover:bg-[var(--omp-surface-hover)] disabled:opacity-35";

export function BrowserWorkspaceWindow() {
	const t = useT();
	const [state, setState] = useState<BrowserWorkspaceState>();
	const [draft, setDraft] = useState<string | null>(null);
	const [error, setError] = useState<"address" | "action" | null>(null);
	const addressRef = useRef<HTMLInputElement>(null);
	const active = state?.pages.find(page => page.id === state.activeId);
	const address = active?.url === "about:blank" ? "" : (active?.url ?? "");

	useEffect(() => {
		const browser = window.omp.browser;
		const stop = browser.onState(setState);
		void browser.action({ type: "state" }).then(setState, () => setError("action"));
		const focusAddress = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
				event.preventDefault();
				addressRef.current?.focus();
				addressRef.current?.select();
			}
		};
		window.addEventListener("keydown", focusAddress);
		return () => {
			stop();
			window.removeEventListener("keydown", focusAddress);
		};
	}, []);

	async function run(action: BrowserWorkspaceAction) {
		setError(null);
		try {
			setState(await window.omp.browser.action(action));
			setDraft(null);
			if (action.type === "new") addressRef.current?.focus();
		} catch {
			setError(action.type === "navigate" ? "address" : "action");
		}
	}

	return (
		<main className="flex h-screen flex-col bg-[var(--omp-bg)] text-[var(--omp-fg)]">
			<div className="flex h-[88px] shrink-0 flex-col border-b border-[var(--omp-border-muted)]">
				<div className="flex h-10 shrink-0 items-center gap-1 px-2">
					<div className="flex min-w-0 items-center gap-1 overflow-x-auto" aria-label={t("browserWorkspace.tabs")}>
						{state?.pages.map(page => (
							<div
								key={page.id}
								className={cx(
									"flex h-8 min-w-24 max-w-52 shrink-0 items-center rounded",
									page.id === state.activeId && "bg-[var(--omp-surface)]",
								)}
							>
								<button
									type="button"
									aria-pressed={page.id === state.activeId}
									className="min-w-0 flex-1 truncate px-2 text-left"
									onClick={() => void run({ type: "select", id: page.id })}
								>
									{page.driven && (
										<Link2 size={12} className="mr-1 inline" aria-label={t("browserWorkspace.driven")} />
									)}
									{page.url === "about:blank"
										? t("browserWorkspace.newTab")
										: page.title || page.url || t("browserWorkspace.newTab")}
								</button>
								<button
									type="button"
									className={control}
									aria-label={t("common.close")}
									onClick={() => void run({ type: "close", id: page.id })}
								>
									<X size={13} />
								</button>
							</div>
						))}
					</div>
					<button
						type="button"
						className={control}
						title={t("browserWorkspace.newTab")}
						aria-label={t("browserWorkspace.newTab")}
						onClick={() => void run({ type: "new" })}
					>
						<Plus size={16} />
					</button>
				</div>
				<form
					className="flex h-12 items-center gap-1 px-2"
					onSubmit={event => {
						event.preventDefault();
						if ((draft ?? address).trim()) void run({ type: "navigate", address: draft ?? address });
					}}
				>
					<button
						type="button"
						className={control}
						disabled={!state?.back}
						aria-label={t("browserWorkspace.back")}
						onClick={() => void run({ type: "back" })}
					>
						<ArrowLeft size={16} />
					</button>
					<button
						type="button"
						className={control}
						disabled={!state?.forward}
						aria-label={t("browserWorkspace.forward")}
						onClick={() => void run({ type: "forward" })}
					>
						<ArrowRight size={16} />
					</button>
					<button
						type="button"
						className={control}
						disabled={!address}
						aria-label={t("common.refresh")}
						onClick={() => void run({ type: "reload" })}
					>
						<RotateCw size={15} className={state?.loading ? "animate-spin" : undefined} />
					</button>
					<label className="flex min-w-0 flex-1 items-center gap-2 rounded border border-[var(--omp-border-muted)] px-2 focus-within:border-[var(--omp-accent)]">
						<Globe2 size={15} className="shrink-0" />
						<input
							ref={addressRef}
							aria-label={t("browserWorkspace.address")}
							placeholder={t("browserWorkspace.address")}
							type="text"
							spellCheck={false}
							className="h-8 min-w-0 flex-1 bg-transparent outline-none"
							value={draft ?? address}
							onChange={event => setDraft(event.target.value)}
							onKeyDown={event => {
								if (event.key === "Escape") setDraft(null);
							}}
						/>
					</label>
					{error && (
						<span
							role="alert"
							className="max-w-40 shrink-0 text-xs text-[var(--omp-error)]"
							title={t(`browserWorkspace.error.${error}`)}
						>
							{t(`browserWorkspace.error.${error}`)}
						</span>
					)}
				</form>
			</div>
		</main>
	);
}
