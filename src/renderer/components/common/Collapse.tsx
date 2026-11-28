/**
 * GSAP animates disclosure rows without measuring content height. Once settled,
 * clipping is lifted so focus rings and in-body popovers remain visible.
 */

import { ChevronUp } from "lucide-react";
import { type MouseEventHandler, type ReactNode, useRef } from "react";
import { useOverlayPresence } from "../../hooks/use-overlay-presence";
import { cx } from "../../lib/format";

export interface CollapseProps {
	open: boolean;
	children: ReactNode;
	className?: string;
}

export function CollapseButton({ label, onClick }: { label: string; onClick: MouseEventHandler<HTMLButtonElement> }) {
	return (
		<button
			className="omp-collapse-button omp-pressable mt-1 inline-flex min-h-7 items-center gap-1 rounded-md border border-(--omp-border-muted) px-2 text-omp-sm font-medium text-(--omp-text) hover:bg-(--omp-selected-bg)"
			onClick={onClick}
			type="button"
		>
			<ChevronUp aria-hidden size={14} />
			{label}
		</button>
	);
}

export function Collapse({ open, children, className }: CollapseProps) {
	const ref = useRef<HTMLDivElement>(null);
	const { mounted, closing } = useOverlayPresence(open, ref, "collapse");

	if (!mounted) return null;
	return (
		<div
			ref={ref}
			aria-hidden={closing || undefined}
			className={cx("omp-collapse", className)}
			data-open={open}
			inert={closing || undefined}
		>
			<div className="omp-collapse-inner">{children}</div>
		</div>
	);
}
