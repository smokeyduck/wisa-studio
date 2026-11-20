/**
 * Shared context menu: portal-rendered at cursor/trigger coordinates, with
 * full keyboard support (arrows navigate, Enter selects, Escape closes) and
 * outside-press dismissal. The one context menu for the whole app — sidebar,
 * tab strip, title bar, composer, panels and agent views all use it.
 */

import type { LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "../../lib/format";
import { isImeKeyEvent } from "../../lib/ime";

export interface ContextMenuItem {
	/** Stable id for keyboard focus tracking. */
	id: string;
	label: string;
	description?: string;
	icon?: LucideIcon;
	/** Right-aligned hint text (e.g. a chord). */
	hint?: string;
	/** Danger styling (destructive actions like delete). */
	danger?: boolean;
	/** Disabled items render but never fire. */
	disabled?: boolean;
	disabledReason?: string;
	onSelect: () => void;
	/**
	 * A secondary control drawn at the row's trailing edge (a pin, a mute). It is
	 * a sibling of the row's button, never a child: a button inside a button is
	 * invalid and the inner one would never receive the click.
	 */
	action?: {
		id: string;
		label: string;
		icon: LucideIcon;
		/** The action is already in effect (a pinned row draws its icon filled). */
		active?: boolean;
		onSelect: () => void;
	};
}

interface ContextMenuProps {
	items: ContextMenuItem[];
	/** Viewport coordinates for the menu's top-left corner (bottom-left with `placement="above"`). */
	x: number;
	y: number;
	/** `above` grows the menu upward from `y` — for triggers near the bottom edge, like the composer. */
	placement?: "below" | "above";
	onClose: () => void;
}

export function ContextMenu({ items, x, y, placement = "below", onClose }: ContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);
	const [activeIndex, setActiveIndex] = useState(() => items.findIndex(item => !item.disabled));
	const [pos, setPos] = useState({ left: x, top: y });

	// Clamp inside the viewport once mounted (menu height is content-driven).
	//
	// Measured with `offsetWidth`/`offsetHeight`, not `getBoundingClientRect()`:
	// the pop-in animation starts at `scale(0.92)`, and a rect taken then is
	// ~8% short, which under-corrects and lets the real menu hang off-screen.
	// Layout metrics ignore transforms, so they describe the settled box.
	useLayoutEffect(() => {
		const el = menuRef.current;
		if (!el) return;
		// `offsetWidth` is absent in the linkedom test DOM, where it reads as
		// undefined and turns the clamp into NaN. Fall back to the rect there.
		const width = el.offsetWidth || el.getBoundingClientRect().width || 0;
		const height = el.offsetHeight || el.getBoundingClientRect().height || 0;
		const GAP = 8;
		// A DOM without layout (linkedom in tests) reports no viewport size; treat
		// that as unbounded rather than letting NaN reach the style attribute.
		const viewWidth = Number.isFinite(window.innerWidth) ? window.innerWidth : Number.POSITIVE_INFINITY;
		const viewHeight = Number.isFinite(window.innerHeight) ? window.innerHeight : Number.POSITIVE_INFINITY;
		// Flip to whichever side has room instead of clamping a menu that then
		// overlaps its own trigger or spills past the edge.
		let top: number;
		if (placement === "above") {
			top = y - height;
			if (top < GAP) top = Math.min(y + height, viewHeight - height - GAP);
		} else {
			top = y;
			if (top + height > viewHeight - GAP) top = y - height - GAP * 2;
		}
		const left = Math.min(x, viewWidth - width - GAP);
		setPos({
			left: Math.max(GAP, left),
			top: Math.max(GAP, Math.min(top, viewHeight - height - GAP)),
		});
	}, [x, y, placement]);

	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	useEffect(() => {
		// Restore focus to the element that opened the menu — unmounting the
		// focused item otherwise drops focus to <body>. The restore runs ONLY
		// on unmount (onClose is read through a ref): re-running per render
		// would steal focus back to the trigger while the menu stays open.
		const restore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const onDown = (event: PointerEvent) => {
			// The trigger opens this menu from `click`, so its preceding pointerdown
			// has already finished before this effect is installed. Listening for the
			// next pointer press avoids treating the opening click itself as an
			// outside dismissal while still closing before a later outside click.
			if (!menuRef.current?.contains(event.target as globalThis.Node | null)) onCloseRef.current();
		};
		const onKey = (event: KeyboardEvent) => {
			if (isImeKeyEvent(event)) return;
			// Tab leaves an open menu for background controls while it stays
			// visible — close instead, per menu-button behavior.
			if (event.key === "Tab") {
				event.preventDefault();
				onCloseRef.current();
			}
		};
		document.addEventListener("pointerdown", onDown);
		document.addEventListener("keydown", onKey, true);
		return () => {
			document.removeEventListener("pointerdown", onDown);
			document.removeEventListener("keydown", onKey, true);
			if (restore?.isConnected) restore.focus();
		};
	}, []);

	// Focus the active item whenever the menu opens or the index moves.
	useEffect(() => {
		menuRef.current?.querySelectorAll<HTMLButtonElement>("[data-menu-item]")[activeIndex]?.focus();
	}, [activeIndex]);

	const step = (delta: number) => {
		setActiveIndex(current => {
			for (let i = 1; i <= items.length; i++) {
				const next = (current + delta * i + items.length) % items.length;
				if (!items[next]?.disabled) return next;
			}
			return current;
		});
	};

	return createPortal(
		<div
			ref={menuRef}
			role="menu"
			style={{ left: pos.left, top: pos.top }}
			onKeyDown={event => {
				if (event.key === "Escape") {
					event.preventDefault();
					// The menu owns this keypress: without stopping it, a dialog behind
					// the menu takes the same Escape and closes with it.
					event.stopPropagation();
					onClose();
				} else if (event.key === "ArrowDown") {
					event.preventDefault();
					step(1);
				} else if (event.key === "ArrowUp") {
					event.preventDefault();
					step(-1);
				} else if (event.key === "Enter") {
					event.preventDefault();
					const item = items[activeIndex];
					if (item && !item.disabled) item.onSelect();
				}
			}}
			className="omp-pop-in fixed z-50 min-w-44 overflow-hidden rounded-xl border border-[var(--omp-border)] bg-[var(--omp-bg-elevated)] py-1 shadow-xl"
		>
			{items.map((item, index) => (
				<div
					key={item.id}
					className={cx(
						"flex w-full items-stretch",
						index === activeIndex && "bg-[var(--omp-selected-bg)]",
					)}
				>
					<button
						type="button"
						role="menuitem"
						data-menu-item
						disabled={item.disabled}
						title={item.disabled ? item.disabledReason : item.label}
						onClick={() => {
							if (item.disabled) return;
							item.onSelect();
						}}
						onMouseEnter={() => setActiveIndex(index)}
						className={cx(
							"flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-omp-md hover:bg-[var(--omp-selected-bg)]",
							item.danger ? "text-[var(--omp-error)]" : "text-[var(--omp-text)]",
							item.disabled && "cursor-not-allowed opacity-70",
						)}
					>
						{item.icon && (
							<item.icon
								size={13}
								className={cx(
									"shrink-0",
									item.danger ? "text-[var(--omp-error)]" : "text-[var(--omp-muted)]",
								)}
							/>
						)}
						<span className="min-w-0 flex-1">
							<span className="block truncate">{item.label}</span>
							{item.description && (
								<span className="mt-0.5 block text-omp-xs font-normal text-[var(--omp-dim)]">
									{item.description}
								</span>
							)}
						</span>
						{item.hint && !item.action && <span className="text-omp-xs text-[var(--omp-dim)]">{item.hint}</span>}
					</button>
					{item.action && (
						<button
							type="button"
							aria-label={item.action.label}
							title={item.action.label}
							aria-pressed={item.action.active}
							onClick={event => {
								event.stopPropagation();
								item.action?.onSelect();
							}}
							className={cx(
								"omp-pressable flex w-9 shrink-0 items-center justify-center rounded-md hover:bg-[var(--omp-selected-bg)]",
								item.action.active ? "text-[var(--omp-accent)]" : "text-[var(--omp-muted)]",
							)}
						>
							<item.action.icon size={13} fill={item.action.active ? "currentColor" : "none"} />
						</button>
					)}
				</div>
			))}
		</div>,
		document.body,
	);
}

/** Cursor-anchored menu state for right-click surfaces. */
export interface ContextMenuAnchor {
	x: number;
	y: number;
}

export function anchorFromEvent(event: {
	clientX: number;
	clientY: number;
	preventDefault(): void;
}): ContextMenuAnchor {
	event.preventDefault();
	return { x: event.clientX, y: event.clientY };
}
