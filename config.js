/**
 * Runtime configuration for Old Town Explorer.
 *
 * The production build is designed to be served by PocketBase, so the API
 * defaults to the current origin. A separately hosted frontend can define
 * window.OLD_TOWN_CONFIG.pocketBaseUrl before this script loads.
 */
window.OLD_TOWN_CONFIG = Object.freeze({
  pocketBaseUrl: window.OLD_TOWN_CONFIG?.pocketBaseUrl || window.location.origin
});
