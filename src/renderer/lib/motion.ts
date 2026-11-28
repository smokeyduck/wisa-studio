import { gsap } from "gsap/gsap-core";

export type MotionKind = "dialog" | "popover" | "drawer" | "page" | "collapse";
export const MOTION_ENTER_SECONDS = 0.28;
export const MOTION_EXIT_SECONDS = 0.14;

type StylePose = Partial<Pick<CSSStyleDeclaration, "opacity" | "transform" | "width" | "height" | "gridTemplateRows">>;

export function prefersReducedMotion(): boolean {
	return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Interpolate explicit style values: no computed-style reads or layout work per frame. */
export function tweenStyle(
	style: CSSStyleDeclaration,
	pose: StylePose,
	seconds: number,
	onComplete?: () => void,
): (() => void) | undefined {
	const media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
	if (seconds === 0 || media?.matches) {
		Object.assign(style, pose);
		onComplete?.();
		return;
	}
	const tween = gsap.to([style], {
		...pose,
		duration: seconds,
		ease: "power3.out",
		overwrite: true,
		onComplete: () => {
			media?.removeEventListener("change", settle);
			onComplete?.();
		},
	});
	const settle = () => {
		if (media?.matches) tween.progress(1);
	};
	media?.addEventListener("change", settle);
	return () => {
		media?.removeEventListener("change", settle);
		tween.kill();
	};
}

/** Completion, not a timeout, owns exit unmount and disclosure clipping. */
export function animateSurface(
	node: HTMLElement,
	kind: MotionKind,
	open: boolean,
	fresh: boolean,
	onComplete?: () => void,
	immediate = false,
): (() => void) | undefined {
	const collapsed = kind === "collapse";
	const resting = "translate3d(0px, 0px, 0px) scale(1)";
	const displaced =
		kind === "drawer"
			? "translate3d(12px, 0px, 0px) scale(1)"
			: `translate3d(0px, ${kind === "page" ? 5 : 8}px, 0px) scale(${kind === "page" ? 1 : 0.985})`;
	const hidden: StylePose = collapsed
		? { gridTemplateRows: "0fr", opacity: "0" }
		: { transform: displaced, opacity: "0" };
	const visible: StylePose = collapsed
		? { gridTemplateRows: "1fr", opacity: "1" }
		: { transform: resting, opacity: "1" };
	if (fresh && open) Object.assign(node.style, hidden);
	// Completed entrances clear these inline styles. Seed the known resting
	// pose before an exit so GSAP does not interpret an empty opacity as zero.
	if (!node.style.opacity) node.style.opacity = "1";
	if (!collapsed && !node.style.transform) node.style.transform = resting;
	if (collapsed) node.dataset.settled = "false";
	node.dataset.motion = open ? "entering" : "exiting";
	return tweenStyle(
		node.style,
		open ? visible : hidden,
		immediate ? 0 : open ? MOTION_ENTER_SECONDS : MOTION_EXIT_SECONDS,
		() => {
			node.dataset.motion = "idle";
			if (open) {
				node.style.removeProperty("opacity");
				node.style.removeProperty("transform");
				if (collapsed) {
					node.dataset.settled = "true";
				}
			}
			onComplete?.();
		},
	);
}
