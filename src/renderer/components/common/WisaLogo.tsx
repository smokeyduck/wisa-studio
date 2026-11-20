/**
 * The WISA mark: the interlocking white-and-gold ribbon on a transparent
 * ground (`assets/wisa-mark.png`, cut from the app artwork by removing its navy
 * plate). The dock, tray and installers keep the plated icon; the in-app mark
 * has to sit on the app's own background, and a baked-in plate would show up as
 * a mismatched square — navy on the graphite theme, navy on the light theme.
 *
 * The artwork is not square (305×220), so a size gives the height and the
 * width follows.
 */

import markUrl from "../../assets/wisa-mark.png";
import { cx } from "../../lib/format";

export interface WisaLogoProps {
	/** Rendered height in px; the width follows the artwork's aspect ratio. */
	size?: number;
	className?: string;
}

const ASPECT = 305 / 220;

export function WisaLogo({ size = 48, className }: WisaLogoProps) {
	return (
		<img
			alt=""
			aria-hidden="true"
			className={cx("omp-brand-mark shrink-0 select-none", className)}
			draggable={false}
			height={size}
			src={markUrl}
			width={Math.round(size * ASPECT)}
		/>
	);
}
