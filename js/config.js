export const CONFIG = {
    // App version — bump on release
    APP_VERSION: '2.9.51',

    // Auth + data are served by this site's own Pages Functions (/api/*), which
    // talk to the D1 database binding. No third-party backend keys live here.

    // Third-party icon providers (publishable keys — rotate via this single file)
    LOGO_DEV_TOKEN: 'pk_CD4SuapcQDq1yZFMwSaYeA',
    BRANDFETCH_CID: '1idVW8VN57Jat7AexnZ',

    // Limits — single source of truth (keep CSS breakpoints in sync with MOBILE_MAX_WIDTH)
    MAX_IMPORT_SIZE: 2 * 1024 * 1024,
    MAX_AVATAR_BYTES: 2 * 1024 * 1024,
    MAX_AVATAR_URL_LENGTH: 3_000_000,
    MOBILE_MAX_WIDTH: 768
};
