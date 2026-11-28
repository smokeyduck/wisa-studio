import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import { animateSurface, type MotionKind, prefersReducedMotion } from "../lib/motion";

/** Exit duration plus one frame; consumers that wait for dismissal use this bound. */
export const OVERLAY_EXIT_MS = 160;

export interface OverlayPresence {
	/** Render gate: true while the overlay is open or still playing its exit animation. */
	mounted: boolean;
	/** Exit phase: the overlay is already logically closed and only animating out. */
	closing: boolean;
}

type Phase = "closed" | "open" | "closing";

/** Keep exits mounted; release focus and interactivity as soon as `open` changes. */
export function useOverlayPresence(
	open: boolean,
	ref: RefObject<HTMLElement | null>,
	kind: MotionKind,
): OverlayPresence {
	const [phase, setPhase] = useState<Phase>(open ? "open" : "closed");
	const previousNode = useRef<HTMLElement | null>(null);
	const initiallyOpen = useRef(open);
	const stop = useRef<(() => void) | null>(null);
	const last = useRef<{ node: HTMLElement | null; phase: Phase; kind: MotionKind } | null>(null);
	if (open && phase !== "open") setPhase("open");
	else if (!open && phase === "open") setPhase(prefersReducedMotion() ? "closed" : "closing");

	useLayoutEffect(() => {
		const node = ref.current;
		if (last.current?.node === node && last.current.phase === phase && last.current.kind === kind) return;
		stop.current?.();
		stop.current = null;
		last.current = { node, phase, kind };
		if (!node || phase === "closed") {
			previousNode.current = null;
			return;
		}
		const fresh = previousNode.current !== node;
		previousNode.current = node;
		const immediate = kind === "collapse" && fresh && initiallyOpen.current;
		initiallyOpen.current = false;
		stop.current =
			animateSurface(
				node,
				kind,
				open,
				fresh,
				() => {
					if (!open) setPhase("closed");
				},
				immediate,
			) ?? null;
	});
	useLayoutEffect(
		() => () => {
			stop.current?.();
			last.current = null;
		},
		[],
	);

	return { closing: phase === "closing", mounted: phase !== "closed" };
}

/** Entrance for a mounted surface or a deliberate page change, never each render. */
export function useSurfaceMotion(
	ref: RefObject<HTMLElement | null>,
	kind: "page" | "drawer" | "popover",
	key?: unknown,
): void {
	const last = useRef<{ node: HTMLElement | null; key: unknown; kind: string } | null>(null);
	const stop = useRef<(() => void) | null>(null);
	useLayoutEffect(() => {
		const node = ref.current;
		if (last.current?.node === node && Object.is(last.current.key, key) && last.current.kind === kind) return;
		stop.current?.();
		stop.current = null;
		last.current = { node, key, kind };
		if (node) stop.current = animateSurface(node, kind, true, true) ?? null;
	});
	useLayoutEffect(
		() => () => {
			stop.current?.();
			last.current = null;
		},
		[],
	);
}
