import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../lib/format";
import { Button } from "./Button";

export function CatalogCard({
	title,
	byline,
	logo,
	description,
	metadata,
	openLabel,
	onOpen,
	install,
	error,
	square = false,
}: {
	title: string;
	byline?: string | null;
	logo: ReactNode;
	description: ReactNode;
	metadata?: ReactNode;
	openLabel: string;
	onOpen: () => void;
	install:
		| { unavailable: true; label: string }
		| { installed: true; label: string }
		| { installed: false; label: string; disabled?: boolean; loading?: boolean; title?: string; onClick: () => void };
	error?: ReactNode;
	square?: boolean;
}) {
	return (
		<article
			className={cx(
				"relative flex min-w-0 flex-col gap-2 rounded-xl border border-(--omp-border-muted) p-3.5 transition-colors hover:border-(--omp-border) hover:bg-(--omp-selected-bg)",
				square && "aspect-square",
			)}
		>
			{/* The card opens the details; the install button sits above it as a sibling. */}
			<button
				aria-label={openLabel}
				className="absolute inset-0 rounded-xl focus-visible:outline-2 focus-visible:outline-(--omp-accent)"
				onClick={onOpen}
				type="button"
			/>
			<div className="pointer-events-none flex items-start gap-3">
				{logo}
				<div className="min-w-0 flex-1">
					<h3 className="truncate text-omp-md font-medium text-(--omp-text)" title={title}>
						{title}
					</h3>
					{byline && <p className="truncate text-omp-xs text-(--omp-dim)">{byline}</p>}
				</div>
				<div className={square ? "absolute right-3.5 bottom-3.5" : "relative shrink-0"}>
					{"unavailable" in install ? (
						<span className="text-omp-xs text-(--omp-muted)">{install.label}</span>
					) : install.installed ? (
						<span className="flex items-center gap-1 py-1 text-omp-xs text-(--omp-success)">
							<Check aria-hidden="true" size={12} />
							{install.label}
						</span>
					) : (
						<Button
							className="pointer-events-auto"
							disabled={install.disabled}
							loading={install.loading}
							onClick={install.onClick}
							size="sm"
							title={install.title}
							variant="secondary"
						>
							{install.label}
						</Button>
					)}
				</div>
			</div>
			<p className="pointer-events-none line-clamp-2 min-h-[2lh] text-omp-sm leading-snug text-(--omp-muted)">
				{description}
			</p>
			<div className="pointer-events-none flex min-h-4 items-center gap-2 text-omp-xs text-(--omp-dim)">
				{metadata}
			</div>
			{error && <div className="relative">{error}</div>}
		</article>
	);
}
