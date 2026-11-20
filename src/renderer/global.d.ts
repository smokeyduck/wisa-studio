import type { OmpApi } from "../shared/ipc-types";

declare global {
	interface Window {
		omp: OmpApi;
	}

	interface ImportMeta {
		/**
		 * Vite replaces this object at build time, so `import.meta.env.DEV`
		 * folds to `false` in a production bundle and the branch it guards is
		 * dropped. Only the renderer is built by Vite; the tsconfig has no
		 * `vite/client` types, so the shape is declared here.
		 */
		readonly env: {
			readonly DEV: boolean;
			readonly PROD: boolean;
			readonly MODE: string;
		};
	}
}
