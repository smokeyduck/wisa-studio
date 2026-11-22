/**
 * WISA gateway facts both processes need. Kept in `shared/` so the renderer's
 * "sign in" button and the main process's deep-link handler cannot drift apart
 * on the provider id or the page they send the user to.
 */

/** The models.yml entry the gateway lives on (seeded by `wisa-provider.ts`). */
export const WISA_PROVIDER_ID = "wisa";

/** Public web origin; the console page and the exchange route live here. */
export const WISA_WEB_ORIGIN = "https://askwisa.com";

/** Where a user signs in and is handed the one-time deep-link code. */
export const WISA_CONNECT_PAGE_URL = `${WISA_WEB_ORIGIN}/console/desktop?app=wisa-studio`;
