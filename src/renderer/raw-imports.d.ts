/**
 * Ambient declarations for Vite `?raw` imports (embed file contents as
 * strings; used by ChangelogDialog for the bundled CHANGELOG.md) and for plain
 * image imports (Vite rewrites those to a hashed asset URL at build time; the
 * brand mark in components/common/WisaLogo.tsx is the only user). Must live in
 * a non-module .d.ts — wildcard module declarations are ignored in module files
 * like global.d.ts.
 */
declare module "*.md?raw" {
	const content: string;
	export default content;
}

declare module "*.png" {
	const url: string;
	export default url;
}
