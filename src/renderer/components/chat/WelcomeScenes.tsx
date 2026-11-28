import { useEffect, useRef, useState } from "react";
import { useT } from "../../lib/i18n";
import { tweenStyle } from "../../lib/motion";
import { WisaLogo } from "../common";

const SCENE_MS = 10_000;
const SCENES = ["constellation", "blueprint", "folio"] as const;
type WelcomeMode = "code" | "work" | "chat";

/** Artwork and welcome copy share one slow scene loop; the composer stays put. */
export function WelcomeScenes({ mode }: { mode: WelcomeMode }) {
	const t = useT();
	const stage = useRef<HTMLDivElement>(null);
	const copy = useRef<HTMLDivElement>(null);
	const [activeScene, setActiveScene] = useState(0);

	useEffect(() => {
		const node = stage.current;
		if (!node) return;
		const layers = Array.from(node.querySelectorAll<HTMLElement>("[data-welcome-layer]"));
		const copyLayers = Array.from(copy.current?.querySelectorAll<HTMLElement>("[data-welcome-copy]") ?? []);
		const media =
			typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
		let scene = 0;
		let timer: number | undefined;
		let tweens: Array<(() => void) | undefined> = [];
		const cancel = () => {
			window.clearTimeout(timer);
			timer = undefined;
			for (const kill of tweens) kill?.();
			tweens = [];
		};
		const settle = () => {
			layers.forEach((layer, index) => {
				layer.style.opacity = index === scene ? "1" : "0";
				layer.style.transform = "translate3d(0px, 0px, 0px) scale(1)";
				const artwork = layer.querySelector("svg");
				if (artwork) artwork.style.transform = "translate3d(0px, 0px, 0px) scale(1)";
			});
			node.dataset.scene = SCENES[scene];
			copyLayers.forEach((layer, index) => {
				layer.style.opacity = index === scene ? "1" : "0";
				layer.style.transform = "translate3d(0px, 0px, 0px)";
			});
			setActiveScene(scene);
		};
		const schedule = () => {
			if (mode === "chat" || media?.matches || document.hidden) return;
			const artwork = layers[scene]?.querySelector("svg");
			if (artwork) {
				artwork.style.transform = "translate3d(0px, 0px, 0px) scale(1)";
				tweens.push(tweenStyle(artwork.style, { transform: "translate3d(0px, -4px, 0px) scale(1.045)" }, 9.5));
			}
			timer = window.setTimeout(() => {
				cancel();
				const previous = layers[scene];
				scene = (scene + 1) % SCENES.length;
				node.dataset.scene = SCENES[scene];
				setActiveScene(scene);
				const previousCopy = copyLayers[(scene + SCENES.length - 1) % SCENES.length];
				const nextCopy = copyLayers[scene];
				if (previousCopy && nextCopy) {
					tweens.push(
						tweenStyle(
							previousCopy.style,
							{ opacity: "0", transform: "translate3d(0px, -4px, 0px)" },
							0.22,
							() => {
								nextCopy.style.transform = "translate3d(0px, 6px, 0px)";
								tweens.push(
									tweenStyle(nextCopy.style, { opacity: "1", transform: "translate3d(0px, 0px, 0px)" }, 0.65),
								);
							},
						),
					);
				}
				const next = layers[scene];
				if (previous) tweens.push(tweenStyle(previous.style, { opacity: "0" }, 1.2));
				if (next) {
					next.style.transform = "translate3d(0px, 4px, 0px) scale(0.96)";
					tweens.push(
						tweenStyle(next.style, { opacity: "1", transform: "translate3d(0px, 0px, 0px) scale(1)" }, 1.2),
					);
				}
				schedule();
			}, SCENE_MS);
		};
		const sync = () => {
			cancel();
			if (media?.matches) scene = 0;
			settle();
			schedule();
		};
		sync();
		media?.addEventListener("change", sync);
		document.addEventListener("visibilitychange", sync);
		return () => {
			cancel();
			media?.removeEventListener("change", sync);
			document.removeEventListener("visibilitychange", sync);
		};
	}, [mode]);

	const isWork = mode === "work";
	const title =
		mode === "chat" ? t("chat.empty.title.chat") : isWork ? t("chat.empty.title.work") : t("chat.empty.title");
	const subtitle =
		mode === "chat"
			? t("chat.empty.subtitle.chat")
			: isWork
				? t("chat.empty.subtitle.work")
				: t("chat.empty.subtitle");
	const copies = [
		{ title, subtitle },
		...(mode === "chat"
			? []
			: [
					{
						title: t(`chat.empty.title.${mode}.blueprint`),
						subtitle: t(`chat.empty.subtitle.${mode}.blueprint`),
					},
					{
						title: t(`chat.empty.title.${mode}.folio`),
						subtitle: t(`chat.empty.subtitle.${mode}.folio`),
					},
				]),
	];

	return (
		<div className="omp-empty-canvas">
			<div className="omp-empty-content" style={{ animation: "none" }}>
				<div
					ref={stage}
					data-mode={mode}
					data-scene="constellation"
					className="omp-welcome-stage relative mx-auto mb-6 flex h-40 w-72 max-w-full items-center justify-center"
					aria-hidden="true"
				>
					{SCENES.map((scene, index) => (
						<div
							key={scene}
							data-welcome-layer={scene}
							className="pointer-events-none absolute inset-0 text-[var(--omp-accent)]"
							style={{ opacity: index === 0 ? 1 : 0, transitionProperty: "none" }}
						>
							<svg
								viewBox="0 0 288 160"
								fill="none"
								className="h-full w-full"
								focusable="false"
								style={{ transitionProperty: "none", transformOrigin: "center" }}
							>
								{scene === "constellation" && (
									<>
										<ellipse
											cx="144"
											cy="80"
											rx="112"
											ry="51"
											stroke="currentColor"
											opacity="0.18"
											transform="rotate(-12 144 80)"
										/>
										<ellipse
											cx="144"
											cy="80"
											rx="83"
											ry="66"
											stroke="currentColor"
											opacity="0.1"
											transform="rotate(18 144 80)"
										/>
										<path
											d={isWork ? "M41 98 88 35 203 41 249 105" : "M41 98 88 35M203 41 249 105"}
											stroke="currentColor"
											strokeDasharray="3 6"
											opacity="0.24"
										/>
										{[
											[41, 98],
											[88, 35],
											[203, 41],
											[249, 105],
										].map(([cx, cy], i) => (
											<circle
												key={cx}
												cx={cx}
												cy={cy}
												r={i % 2 ? 3 : 5}
												fill="var(--omp-bg-primary)"
												stroke="currentColor"
												opacity="0.65"
											/>
										))}
									</>
								)}
								{scene === "blueprint" && (
									<>
										<path
											d="M48 40H240M48 80H240M48 120H240M72 20V140M120 20V140M168 20V140M216 20V140"
											stroke="currentColor"
											opacity="0.1"
										/>
										<path
											d={
												isWork
													? "M55 53H89V107H55ZM199 53H233V107H199M62 65H82M62 74H78M206 65H226M206 74H222"
													: "m88 49-25 31 25 31m112-62 25 31-25 31"
											}
											stroke="currentColor"
											strokeWidth="1.5"
											strokeLinecap="round"
											strokeLinejoin="round"
											opacity="0.45"
										/>
										<path
											d="M33 48V25H56M232 25H255V48M255 112V135H232M56 135H33V112"
											stroke="currentColor"
											opacity="0.25"
										/>
									</>
								)}
								{scene === "folio" && (
									<>
										<rect
											x="63"
											y="38"
											width="162"
											height="90"
											rx="8"
											transform="rotate(-12 144 83)"
											fill="var(--omp-bg-primary)"
											stroke="currentColor"
											strokeOpacity="0.18"
										/>
										<rect
											x="63"
											y="32"
											width="162"
											height="90"
											rx="8"
											transform="rotate(9 144 77)"
											fill="var(--omp-bg-primary)"
											stroke="currentColor"
											strokeOpacity="0.3"
										/>
										<rect
											x="62"
											y="30"
											width="164"
											height="96"
											rx="8"
											fill="var(--omp-bg-primary)"
											stroke="currentColor"
											strokeOpacity="0.35"
										/>
										<path
											d={
												isWork
													? "M77 48H102M77 56H94M187 99H211M187 107H204"
													: "M76 48h3m5 0h3m5 0h3M187 99h24M196 107h15"
											}
											stroke="currentColor"
											strokeWidth="2"
											strokeLinecap="round"
											opacity="0.4"
										/>
									</>
								)}
							</svg>
						</div>
					))}
					<div className="omp-empty-logo relative z-10 flex h-20 w-20 items-center justify-center">
						<WisaLogo size={56} />
					</div>
				</div>
				<div ref={copy} className="mx-auto grid max-w-2xl">
					{copies.map((entry, index) => (
						<div
							key={SCENES[index]}
							data-welcome-copy={SCENES[index]}
							aria-hidden={activeScene !== index}
							className="col-start-1 row-start-1 min-w-0 self-center text-center"
							style={{
								opacity: index === 0 ? 1 : 0,
								pointerEvents: activeScene === index ? "auto" : "none",
								transitionProperty: "none",
							}}
						>
							<h1
								className={
									index === 1
										? "font-mono text-omp-2xl font-medium leading-snug tracking-tight text-[var(--omp-accent)]"
										: index === 2
											? "font-display text-omp-display font-medium italic leading-tight tracking-[-0.025em] text-[var(--omp-text)]"
											: "font-display text-omp-display font-semibold leading-tight tracking-[-0.025em] text-[var(--omp-text)]"
								}
							>
								{entry.title}
							</h1>
							{index > 0 && (
								<span
									aria-hidden="true"
									className={
										index === 1
											? "mx-auto mt-3 block h-px w-16 bg-[var(--omp-accent)] opacity-40"
											: "mx-auto mt-3 block h-1 w-8 rounded-full bg-[var(--omp-accent)] opacity-40"
									}
								/>
							)}
							<p className="mx-auto mt-2 max-w-2xl text-omp-xl leading-relaxed text-[var(--omp-muted)]">
								{entry.subtitle}
							</p>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
