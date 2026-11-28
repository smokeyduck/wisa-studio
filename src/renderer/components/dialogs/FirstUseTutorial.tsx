import { ArrowLeft, ArrowRight, BookOpen, Check, List, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { describeError } from "../../lib/errors";
import { useT } from "../../lib/i18n";
import { isImeKeyEvent } from "../../lib/ime";
import { Button, WisaLogo } from "../common";
import { registerDialogLayer } from "../common/dialog-layer";
import { captureTourUi, FIRST_USE_TOUR, restoreTourUi } from "./first-use-tour";
import { placeTourCard, type TourRect } from "./tutorial-layout";

export const TUTORIAL_COMPLETION_KEY = "onboarding.tutorialCompleted.v1";

export function FirstUseTutorial({
	open,
	onComplete,
	onDismiss,
}: {
	open: boolean;
	onComplete: () => void;
	onDismiss: () => void;
}) {
	const t = useT();
	const maskId = useId();
	const titleId = useId();
	const descriptionId = useId();
	const rootRef = useRef<HTMLDivElement>(null);
	const cardRef = useRef<HTMLElement>(null);
	const dismissRef = useRef(onDismiss);
	dismissRef.current = onDismiss;
	const [step, setStep] = useState(0);
	const [contentsOpen, setContentsOpen] = useState(false);
	const [saving, setSaving] = useState(false);
	const savingRef = useRef(false);
	const [error, setError] = useState<string | null>(null);
	const [target, setTarget] = useState<TourRect | null>(null);
	const [viewport, setViewport] = useState({ width: 0, height: 0 });
	const [cardHeight, setCardHeight] = useState(360);
	const current = FIRST_USE_TOUR[step]!;
	const chapters = [...new Set(FIRST_USE_TOUR.map(item => item.chapter))];

	useLayoutEffect(() => {
		if (!open) return;
		const snapshot = captureTourUi();
		return () => restoreTourUi(snapshot);
	}, [open]);

	useLayoutEffect(() => {
		if (!open) return;
		current.reveal();
		let frame: number | undefined;
		let scrolled = false;
		let watched: Element | null = null;
		const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => schedule());
		const measure = () => {
			frame = undefined;
			const width = window.innerWidth || document.documentElement.clientWidth || 0;
			const height = window.innerHeight || document.documentElement.clientHeight || 0;
			setViewport(previous =>
				previous.width === width && previous.height === height ? previous : { width, height },
			);
			const element = [...document.querySelectorAll<HTMLElement>(current.target)].find(candidate => {
				const rect = candidate.getBoundingClientRect?.();
				return rect && rect.width > 0 && rect.height > 0;
			});
			if (element !== watched) {
				if (watched) resize?.unobserve(watched);
				watched = element ?? null;
				if (watched) resize?.observe(watched);
			}
			if (element && !scrolled) {
				element.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "instant" });
				scrolled = true;
			}
			const rect = element?.getBoundingClientRect();
			const left = rect ? Math.max(8, rect.left - 8) : 0;
			const top = rect ? Math.max(8, rect.top - 8) : 0;
			const right = rect ? Math.min(width - 8, rect.right + 8) : 0;
			const bottom = rect ? Math.min(height - 8, rect.bottom + 8) : 0;
			const next = right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
			setTarget(previous =>
				previous?.left === next?.left &&
				previous?.top === next?.top &&
				previous?.width === next?.width &&
				previous?.height === next?.height
					? previous
					: next,
			);
			const measured = cardRef.current?.getBoundingClientRect?.().height;
			if (measured) setCardHeight(previous => (previous === measured ? previous : measured));
		};
		function schedule() {
			if (frame === undefined) frame = requestAnimationFrame(measure);
		}
		const observer = new MutationObserver(records => {
			if (records.some(record => !rootRef.current?.contains(record.target))) schedule();
		});
		observer.observe(document.body, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ["class", "style", "hidden"],
		});
		if (cardRef.current) resize?.observe(cardRef.current);
		window.addEventListener("resize", schedule);
		document.addEventListener("scroll", schedule, true);
		measure();
		return () => {
			if (frame !== undefined && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
			observer.disconnect();
			resize?.disconnect();
			window.removeEventListener("resize", schedule);
			document.removeEventListener("scroll", schedule, true);
		};
	}, [open, current]);

	useEffect(() => {
		if (!open) return;
		const root = rootRef.current;
		const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const unregister = registerDialogLayer(root);
		const inert = new Map<HTMLElement, boolean>();
		const freezeBackground = () => {
			for (const child of document.body.children) {
				if (!(child instanceof HTMLElement) || child === root || inert.has(child)) continue;
				inert.set(child, child.inert);
				child.inert = true;
			}
		};
		freezeBackground();
		const observer = new MutationObserver(freezeBackground);
		observer.observe(document.body, { childList: true });
		root?.querySelector<HTMLButtonElement>("[data-tour-next]")?.focus();
		const onKeyDown = (event: KeyboardEvent) => {
			if (isImeKeyEvent(event)) return;
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopImmediatePropagation();
				if (!savingRef.current) dismissRef.current();
				return;
			}
			if (event.ctrlKey || event.metaKey || event.altKey) {
				// Copying guide text is safe; application shortcuts must not mutate the frozen session.
				if (!(event.key.toLowerCase() === "c" && (event.ctrlKey || event.metaKey))) event.preventDefault();
				event.stopImmediatePropagation();
				return;
			}
			if (event.key === "Tab") {
				const items = [
					...(root?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex="0"]') ?? []),
				].filter(element => !element.closest("[hidden]"));
				const first = items[0];
				const last = items.at(-1);
				if (!root?.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last)) {
					event.preventDefault();
					first?.focus();
				} else if (event.shiftKey && document.activeElement === first) {
					event.preventDefault();
					last?.focus();
				}
			}
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => {
			window.removeEventListener("keydown", onKeyDown, true);
			observer.disconnect();
			unregister();
			for (const [element, value] of inert) element.inert = value;
			if (previousFocus?.isConnected) previousFocus.focus();
		};
	}, [open]);

	const complete = async () => {
		if (savingRef.current) return;
		savingRef.current = true;
		setSaving(true);
		setError(null);
		try {
			await window.omp.prefs.set(TUTORIAL_COMPLETION_KEY, true);
			onComplete();
		} catch (cause) {
			setError(t("tutorial.saveFailed", { error: describeError(cause) }));
		} finally {
			savingRef.current = false;
			setSaving(false);
		}
	};
	const selectStep = (index: number) => {
		setTarget(null);
		setStep(index);
		setContentsOpen(false);
	};
	if (!open) return null;
	const card = placeTourCard(target, viewport, cardHeight);
	return createPortal(
		<div
			className="omp-first-use-tour"
			ref={rootRef}
			role="dialog"
			aria-modal="true"
			aria-label={t("tutorial.title")}
		>
			<div data-first-run>
				<svg className="omp-tour-shade" aria-hidden="true" width="100%" height="100%">
					<defs>
						<mask id={maskId}>
							<rect width="100%" height="100%" fill="white" />
							{target && (
								<rect
									x={target.left}
									y={target.top}
									width={target.width}
									height={target.height}
									rx="12"
									fill="black"
								/>
							)}
						</mask>
					</defs>
					<rect width="100%" height="100%" fill="rgb(0 0 0 / 78%)" mask={`url(#${maskId})`} />
					{target && (
						<rect
							data-tour-spotlight
							x={target.left}
							y={target.top}
							width={target.width}
							height={target.height}
							rx="12"
							fill="none"
							stroke="var(--omp-accent)"
							strokeWidth="2"
						/>
					)}
				</svg>
				<header className="omp-tour-header">
					<div className="flex min-w-0 items-center gap-3">
						<WisaLogo size={28} />
						<div className="min-w-0">
							<p className="text-omp-md font-semibold">{t("tutorial.title")}</p>
							<p className="text-omp-xs text-white/60">{t("tutorial.readOnly")}</p>
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<button
							type="button"
							className="omp-tour-header-button"
							aria-label={t("tutorial.contents")}
							aria-expanded={contentsOpen}
							aria-controls={`${titleId}-contents`}
							onClick={() => setContentsOpen(value => !value)}
						>
							<List size={16} />
							<span>{t("tutorial.contents")}</span>
						</button>
						<button
							type="button"
							className="omp-tour-header-button"
							disabled={saving}
							aria-label={t("tutorial.close")}
							title={t("tutorial.resumeLater")}
							onClick={onDismiss}
						>
							<X size={18} />
						</button>
					</div>
				</header>
				<nav
					id={`${titleId}-contents`}
					className="omp-tour-contents"
					aria-label={t("tutorial.contents")}
					hidden={!contentsOpen}
				>
					{chapters.map(chapter => (
						<div key={chapter}>
							<h2 className="px-3 pb-2 pt-4 text-omp-xs font-semibold text-(--omp-muted)">
								{t(`tutorial.chapter.${chapter}`)}
							</h2>
							{FIRST_USE_TOUR.map(
								(item, index) =>
									item.chapter === chapter && (
										<button
											key={item.id}
											type="button"
											disabled={saving}
											aria-current={step === index ? "step" : undefined}
											onClick={() => selectStep(index)}
										>
											<span className="w-5 shrink-0 text-omp-xs tabular-nums text-(--omp-dim)">
												{String(index + 1).padStart(2, "0")}
											</span>
											<span>{t(`tutorial.${item.id}.title`)}</span>
											{step === index && <Check size={14} className="ml-auto shrink-0" />}
										</button>
									),
							)}
						</div>
					))}
				</nav>
				<section
					className="omp-tour-card"
					ref={cardRef}
					data-tour-card={current.id}
					data-side={card.side}
					aria-labelledby={titleId}
					aria-describedby={descriptionId}
					style={{ left: card.left, top: card.top, width: card.width, maxHeight: card.maxHeight }}
				>
					<div className="omp-tour-progress" aria-hidden="true">
						<span style={{ width: `${((step + 1) / FIRST_USE_TOUR.length) * 100}%` }} />
					</div>
					<div className="omp-tour-card-scroll">
						<div className="mb-4 flex items-center justify-between gap-3 text-omp-xs text-(--omp-muted)">
							<span className="flex items-center gap-2">
								<BookOpen size={14} />
								{t(`tutorial.chapter.${current.chapter}`)}
							</span>
							<span className="tabular-nums">
								{t("tutorial.progress", { current: step + 1, total: FIRST_USE_TOUR.length })}
							</span>
						</div>
						<div aria-live="polite" aria-atomic="true">
							<h2 id={titleId} className="mb-3 text-omp-2xl font-semibold">
								{t(`tutorial.${current.id}.title`)}
							</h2>
							<p id={descriptionId} className="text-omp-md leading-relaxed text-(--omp-text-secondary)">
								{t(`tutorial.${current.id}.body`)}
							</p>
							<p className="omp-tour-tip">{t(`tutorial.${current.id}.tip`)}</p>
							{!target && (
								<p className="mt-3 text-omp-xs text-(--omp-warning)" role="status">
									{t("tutorial.targetUnavailable")}
								</p>
							)}
						</div>
						{error && (
							<p role="alert" className="mt-3 text-omp-sm text-(--omp-warning)">
								{error}
							</p>
						)}
					</div>
					<footer className="omp-tour-footer">
						<Button variant="ghost" disabled={saving} onClick={() => void complete()}>
							{t("tutorial.skip")}
						</Button>
						<div className="flex gap-2">
							<Button
								variant="ghost"
								disabled={step === 0 || saving}
								aria-label={t("tutorial.back")}
								icon={<ArrowLeft size={15} />}
								onClick={() => selectStep(step - 1)}
							/>
							{step === FIRST_USE_TOUR.length - 1 ? (
								<Button data-tour-next loading={saving} onClick={() => void complete()}>
									{t("tutorial.finish")}
								</Button>
							) : (
								<Button data-tour-next disabled={saving} onClick={() => selectStep(step + 1)}>
									{t("tutorial.next")}
									<ArrowRight size={14} />
								</Button>
							)}
						</div>
					</footer>
				</section>
			</div>
		</div>,
		document.body,
	);
}
