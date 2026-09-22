// Single source of truth for the handful of off-site URLs the public pages
// link to. Everything here must be a real, working destination - no
// placeholder socials, no address, no hotline.

export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.dreek.rewally";

// Served by playwright-service (server.js) on the same public domain, so a
// root-relative path is correct in production and in docker-compose alike.
export const PRIVACY_URL = "/app/legal/privacy";
export const DATA_DELETION_URL = "/app/legal/data-deletion";

export const SITE_NAME = "Rewally";
export const SITE_TAGLINE = "Hoàn tiền mua sắm";
