import { useEffect, useState } from "react";

type ClockListener = (now: number) => void;

const listeners = new Set<ClockListener>();
let interval: number | null = null;

function stopClock(): void {
	if (interval === null) return;
	window.clearInterval(interval);
	interval = null;
}

function tick(): void {
	const now = Date.now();
	for (const listener of listeners) listener(now);
}

function syncVisibility(): void {
	stopClock();
	if (document.hidden) return;
	tick();
	interval = window.setInterval(tick, 1000);
}

function subscribe(listener: ClockListener): () => void {
	listeners.add(listener);
	if (listeners.size === 1) {
		document.addEventListener("visibilitychange", syncVisibility);
		syncVisibility();
	}
	return () => {
		listeners.delete(listener);
		if (listeners.size === 0) {
			stopClock();
			document.removeEventListener("visibilitychange", syncVisibility);
		}
	};
}

/**
 * Wall clock that advances once a second while `active` and visible, then freezes.
 *
 * Every live elapsed-time row shares one interval: a turn with a dozen running
 * cards used to register a dozen timers, each forcing its own re-render, and
 * each had to be stopped by its row reaching a terminal status.
 */
export function useNowTick(active: boolean | undefined): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		setNow(Date.now());
		if (!active) return;
		return subscribe(setNow);
	}, [active]);
	return now;
}
