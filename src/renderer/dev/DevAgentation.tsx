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
 */
import { Agentation } from "agentation";

export function DevAgentation() {
	return <Agentation appName="Wisa Studio" />;
}
