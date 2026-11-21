/**
 * Agentation — a dev-only visual feedback overlay (https://www.agentation.com).
 *
 * Activate the bottom-right toolbar, click any element, write a note, then copy
 * the result as markdown with the element's selector path. That beats describing
 * a widget in prose when asking an agent to change it.
 *
 * Development only, and it must stay that way: the overlay ships its own React
 * tree, styles and global key handlers (Cmd/Ctrl+Shift+F toggles selection, and
 * a bare key press captures an element while active). None of that belongs in a
 * user's window, so `App` renders this behind `import.meta.env.DEV`, which Vite
 * replaces with `false` when building — see `renderer-bundle.test.ts`, which
 * fails if the package reaches `out/`.
 *
 * No `endpoint`: the MCP sync target is an HTTP URL, and the renderer's CSP
 * pins `connect-src` to 'self'. Copy-to-clipboard works without it.
 *
 * Nothing here restyles the host. An earlier fix gave the host a real box
 * (`display: block`, `z-index: 95`) to stop it covering the composer's model
 * menu, but that box is also the containing block for the overlay's annotation
 * layers, so numbered markers landed off-target and the whole overlay sank
 * under the app's dialogs — it stopped being able to select them. The overlay
 * must stay topmost and box-less. What actually made the menu unusable was the
 * app dismissing its own popovers on the overlay's focus/pointer events, which
 * `lib/dev-overlay.ts` now filters out.
 */
import { Agentation } from "agentation";

export function DevAgentation() {
	return <Agentation appName="WISA STUDIO" />;
}
