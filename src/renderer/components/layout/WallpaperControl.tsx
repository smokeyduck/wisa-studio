import { ImagePlus, Pause, Play, RotateCcw } from "lucide-react";
import { useT } from "../../lib/i18n";
import { useWallpaperStore } from "../../stores/wallpaper";

/** The label and secondary actions expand on hover/focus via the composer stylesheet. */
export function WallpaperControl() {
	const t = useT();
	const wallpaper = useWallpaperStore(state => state.wallpaper);
	const busy = useWallpaperStore(state => state.busy);
	const videoPaused = useWallpaperStore(state => state.videoPaused);
	const choose = useWallpaperStore(state => state.choose);
	const clear = useWallpaperStore(state => state.clear);
	const setVideoPaused = useWallpaperStore(state => state.setVideoPaused);
	return (
		<div className="omp-wallpaper-control" data-tour="wallpaper">
			<button
				type="button"
				className="omp-wallpaper-choose"
				aria-label={t("wallpaper.title")}
				title={t("wallpaper.title")}
				aria-busy={busy}
				disabled={busy}
				onClick={() => void choose()}
			>
				<ImagePlus size={14} aria-hidden="true" />
				<span className="omp-wallpaper-label" aria-hidden="true">
					{t("wallpaper.title")}
				</span>
			</button>
			{wallpaper && (
				<div className="omp-wallpaper-actions">
					{wallpaper.kind === "video" && (
						<button
							type="button"
							className="omp-wallpaper-action"
							aria-label={t(videoPaused ? "wallpaper.play" : "wallpaper.pause")}
							title={t(videoPaused ? "wallpaper.play" : "wallpaper.pause")}
							onClick={() => setVideoPaused(!videoPaused)}
						>
							{videoPaused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
						</button>
					)}
					<button
						type="button"
						className="omp-wallpaper-action"
						aria-label={t("wallpaper.reset")}
						title={t("wallpaper.reset")}
						disabled={busy}
						onClick={() => void clear()}
					>
						<RotateCcw size={13} aria-hidden="true" />
					</button>
				</div>
			)}
		</div>
	);
}
