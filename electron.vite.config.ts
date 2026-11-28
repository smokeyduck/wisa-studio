import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

/**
 * Main-process packages bundled into out/main/index.js so packaged apps need no node_modules.
 * Anything the main entry imports that is NOT listed here stays a bare `import` in the
 * bundle, and the installed app only resolves it if electron-builder happened to collect
 * that package — in this nested checkout bun hoists most deps to the monorepo root, so the
 * traversal misses them and the app dies at launch with ERR_MODULE_NOT_FOUND.
 */
const MAIN_BUNDLED_DEPS = ["chokidar", "electron-store", "electron-updater", "yaml", "zod"];

/**
 * Renderer vendor families with stable chunk names. Keep shared dependencies
 * outside lazy-only families so an eager consumer cannot pull the whole family
 * into startup. Rollup places unmatched dependencies according to their consumers.
 */
const VENDOR_CHUNK_RULES: ReadonlyArray<readonly [RegExp, string]> = [
	// React core is shared by the shell and every overlay.
	[/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/, "react"],
	// Markdown pipeline: react-markdown + the unified/remark/rehype/mdast/hast ecosystem.
	[
		/[\\/]node_modules[\\/](react-markdown|lowlight|remark-|rehype-|mdast-|hast-|hastscript|unist-|unified|micromark|vfile|devlop|trough|bail|extend|zwitch|ccount|comma-separated-tokens|space-separated-tokens|decode-named-character-reference|character-entities|property-information|html-url-attributes|trim-lines|markdown-table|longest-streak|is-plain-obj|estree-util-|estree-walker|stringify-entities|web-namespaces)/,
		"markdown",
	],
	// KaTeX (pulled in by rehype-katex; kept separate so the markdown chunk stays lean).
	[/[\\/]node_modules[\\/]katex[\\/]/, "katex"],
	// DOMPurify is also used by the eager file preview, not just Mermaid.
	[/[\\/]node_modules[\\/]dompurify[\\/]/, "dompurify"],
	// Mermaid + its rendering stack (lazy-imported).
	[
		/[\\/]node_modules[\\/](mermaid|@mermaid-js|d3[^\\/]*|dagre[^\\/]*|@dagrejs|elkjs|khroma|cytoscape|stylis|ts-dedent|marked|lodash-es|dayjs|uuid|robust-predicates|topojson-client)[\\/]/,
		"mermaid",
	],
	// chart.js + react-chartjs-2.
	[/[\\/]node_modules[\\/](chart\.js|react-chartjs-2|@kurkle)[\\/]/, "charts"],
	// xterm terminal.
	[/[\\/]node_modules[\\/]@xterm[\\/]/, "xterm"],
	// CodeMirror editor.
	[/[\\/]node_modules[\\/](@codemirror|@lezer)[\\/]/, "codemirror"],
	// highlight.js core + common grammars, shared by rehype-highlight (static,
	// via lowlight in the markdown chunk) and CodeBlock (dynamic import of
	// highlight.js/lib/common). Kept lowlight-free so chunk imports stay one-way.
	[/[\\/]node_modules[\\/]highlight\.js[\\/]/, "highlight"],
	// dnd-kit drag and drop.
	[/[\\/]node_modules[\\/]@dnd-kit[\\/]/, "dnd-kit"],
];

function manualChunks(id: string): string | undefined {
	if (!id.includes("node_modules")) return undefined;
	for (const [pattern, chunk] of VENDOR_CHUNK_RULES) {
		if (pattern.test(id)) return chunk;
	}
	return undefined;
}

export default defineConfig({
	main: {
		// Main is ESM; all bundled asset lookups resolve beside their emitted chunk.
		define: { __dirname: "import.meta.dirname" },
		plugins: [externalizeDepsPlugin({ exclude: MAIN_BUNDLED_DEPS })],
		build: {
			rollupOptions: {
				input: { index: resolve(__dirname, "src/main/index.ts") },
				external: ["electron"],
				// Main chunks resolve preload and renderer assets relative to this directory.
				output: { chunkFileNames: "[name]-[hash].js" },
			},
		},
	},
	preload: {
		plugins: [externalizeDepsPlugin()],
		build: {
			rollupOptions: {
				input: {
					index: resolve(__dirname, "src/preload/index.ts"),
					"notch-panel": resolve(__dirname, "src/preload/notch-panel.ts"),
					"notch-app": resolve(__dirname, "src/preload/notch-app.ts"),
				},
				external: ["electron"],
				output: { format: "cjs" },
			},
		},
	},
	renderer: {
		plugins: [tailwindcss()],
		resolve: {
			alias: {
				"@renderer": resolve(__dirname, "src/renderer"),
				"@shared": resolve(__dirname, "src/shared"),
			},
		},
		build: {
			rollupOptions: {
				input: {
					index: resolve(__dirname, "src/renderer/index.html"),
					notchPanel: resolve(__dirname, "src/renderer/notch-panel/index.html"),
				},
				output: {
					manualChunks,
					// Do not absorb shared helpers (notably Vite's preload helper) into
					// Mermaid: the eager shell needs them without evaluating Mermaid.
					onlyExplicitManualChunks: true,
				},
			},
		},
	},
});
