import { useEffect, useRef } from "react";
import { useWallpaperStore } from "../../stores/wallpaper";

/** Decorative sibling of the transcript and composer, never a pointer/keyboard target. */
export function ConversationWallpaper({ active = true }: { active?: boolean } = {}) {
	const wallpaper = useWallpaperStore(state => state.wallpaper);
	const videoPaused = useWallpaperStore(state => state.videoPaused);
	const error = useWallpaperStore(state => state.error);
	const reportLoadError = useWallpaperStore(state => state.reportLoadError);
	const layerRef = useRef<HTMLDivElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const failed = error === "wallpaper.loadFailed";

	useEffect(() => {
		const video = videoRef.current;
		const layer = layerRef.current;
		if (!video || !layer || !wallpaper || failed) return;
		let disposed = false;
		let visible = true;
		let playback = 0;
		const syncPlayback = () => {
			const request = ++playback;
			if (!active || videoPaused || document.hidden || !visible) {
				video.pause();
				return;
			}
			video.muted = true;
			void video.play()?.catch(() => {
				if (!disposed && request === playback) reportLoadError(wallpaper.url);
			});
		};
		const observer =
			typeof IntersectionObserver === "undefined"
				? null
				: new IntersectionObserver(entries => {
						visible = entries.some(entry => entry.isIntersecting);
						syncPlayback();
					});
		observer?.observe(layer);
		document.addEventListener("visibilitychange", syncPlayback);
		syncPlayback();
		return () => {
			disposed = true;
			++playback;
			observer?.disconnect();
			document.removeEventListener("visibilitychange", syncPlayback);
			video.pause();
		};
	}, [active, videoPaused, wallpaper, failed, reportLoadError]);

	if (!wallpaper || failed) return null;
	return (
		<div className="omp-wallpaper-layer" aria-hidden="true" ref={layerRef}>
			{wallpaper.kind === "image" ? (
				<img
					key={wallpaper.url}
					className="omp-wallpaper-media"
					src={wallpaper.url}
					alt=""
					draggable={false}
					onError={() => reportLoadError(wallpaper.url)}
				/>
			) : (
				<video
					key={wallpaper.url}
					ref={videoRef}
					className="omp-wallpaper-media"
					src={wallpaper.url}
					autoPlay={active && !videoPaused}
					loop
					muted
					playsInline
					preload="metadata"
					onError={() => reportLoadError(wallpaper.url)}
				/>
			)}
		</div>
	);
}
