import { CircleHelp } from "lucide-react";
import { type CSSProperties, Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "../../lib/format";
import { useT } from "../../lib/i18n";
import type { CompletionItem, CompletionMenu } from "./use-completion-menu";

const DESCRIPTION_DELAY_MS = 550;

export function CompletionMenuList({
	menu,
	onSelect,
}: {
	menu: CompletionMenu;
	onSelect: (item: CompletionItem) => void;
}) {
	const t = useT();
	const listRef = useRef<HTMLDivElement>(null);
	const timer = useRef<number>(undefined);
	const [help, setHelp] = useState<{ item: CompletionItem; position: CSSProperties } | null>(null);
	const slashMenu = menu.source === "command" || menu.source === "slash-arg";

	// biome-ignore lint/correctness/useExhaustiveDependencies: both changes can move the active row.
	useEffect(() => {
		listRef.current?.querySelector('[data-menu-active="true"]')?.scrollIntoView?.({ block: "nearest" });
	}, [menu.index, menu.items]);
	useEffect(() => {
		const dismiss = () => {
			window.clearTimeout(timer.current);
			setHelp(null);
		};
		window.addEventListener("resize", dismiss);
		return () => {
			window.removeEventListener("resize", dismiss);
			window.clearTimeout(timer.current);
		};
	}, []);

	function hideHelp() {
		window.clearTimeout(timer.current);
		setHelp(null);
	}

	function showHelpAfterDelay(item: CompletionItem, anchor: HTMLButtonElement) {
		hideHelp();
		timer.current = window.setTimeout(() => {
			const list = listRef.current;
			if (!list || !anchor.isConnected || !anchor.matches(":hover")) return;
			const bounds = list.getBoundingClientRect();
			const row = anchor.getBoundingClientRect();
			setHelp({
				item,
				position: {
					left: bounds.left,
					width: bounds.width,
					...(row.top > window.innerHeight - row.bottom
						? { bottom: window.innerHeight - row.top + 6 }
						: { top: row.bottom + 6 }),
				},
			});
		}, DESCRIPTION_DELAY_MS);
	}

	const visibleHelp = help && menu.items.includes(help.item) ? help : null;

	return (
		<div
			ref={listRef}
			onScroll={hideHelp}
			className="absolute bottom-full left-0 z-10 mb-2 max-h-[60vh] w-[420px] max-w-full overflow-y-auto rounded-xl border border-[var(--omp-border)] bg-[var(--omp-bg-elevated)] p-1 shadow-[var(--omp-shadow-lg)]"
		>
			{menu.items.map((item, index) => {
				const hasHelp = slashMenu && Boolean(item.description);
				return (
					<Fragment key={`${menu.source}:${item.label}`}>
						{menu.source === "command" && item.group && item.group !== menu.items[index - 1]?.group && (
							<div className="px-3 pt-2.5 pb-1 text-omp-xs font-medium text-(--omp-dim)">
								{t(`input.commandGroup.${item.group}`)}
							</div>
						)}
						<button
							data-menu-active={index === menu.index}
							type="button"
							onPointerEnter={
								hasHelp
									? event => {
											if (event.pointerType !== "touch") showHelpAfterDelay(item, event.currentTarget);
										}
									: undefined
							}
							onPointerLeave={hasHelp ? hideHelp : undefined}
							onMouseDown={event => {
								event.preventDefault();
								onSelect(item);
							}}
							className={cx(
								"flex w-full items-baseline gap-3 rounded-lg px-3 py-2.5 text-left",
								index === menu.index ? "bg-[var(--omp-selected-bg)]" : "",
							)}
						>
							<span
								className={cx(
									"font-mono text-omp-lg font-medium text-[var(--omp-accent)]",
									hasHelp && "max-w-[55%] shrink-0 truncate",
								)}
							>
								{item.label}
							</span>
							{item.description && (
								<span className="min-w-0 truncate text-omp-md text-[var(--omp-muted)]">{item.description}</span>
							)}
							{item.hint && (
								<span
									className={cx(
										"ml-auto font-mono text-omp-xs text-[var(--omp-dim)]",
										hasHelp ? "min-w-0 truncate" : "shrink-0",
									)}
								>
									{item.hint}
								</span>
							)}
							{hasHelp && (
								<CircleHelp
									aria-hidden="true"
									className={cx("size-3.5 shrink-0 self-center text-(--omp-dim)", !item.hint && "ml-auto")}
								/>
							)}
						</button>
					</Fragment>
				);
			})}
			{visibleHelp &&
				createPortal(
					<div
						aria-hidden="true"
						className="pointer-events-none fixed z-[100] rounded-lg border border-[var(--omp-border)] bg-[var(--omp-bg-elevated)] px-3 py-2 shadow-[var(--omp-shadow-md)]"
						style={visibleHelp.position}
					>
						<div className="mb-1 text-omp-xs font-medium text-(--omp-dim)">{t("input.commandDescription")}</div>
						<div className="whitespace-pre-wrap break-words text-omp-md text-(--omp-text)">
							{visibleHelp.item.description}
						</div>
					</div>,
					document.body,
				)}
		</div>
	);
}
