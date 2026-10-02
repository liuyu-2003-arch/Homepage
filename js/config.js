export const CONFIG = {
    // App version — bump on release
    APP_VERSION: '2.9.33',

    // Supabase (anon key is safe to expose when RLS is enabled)
    SUPABASE_URL: 'https://ossrsfyqbrzeauzksvpv.supabase.co',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zc3JzZnlxYnJ6ZWF1emtzdnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxMDgwMDksImV4cCI6MjA3OTY4NDAwOX0.IwEfjxM_wNBf2DXDC9ue8X6ztSOJV2rEN1vrQqv7eqI',

    // Third-party icon providers (publishable keys — rotate via this single file)
    LOGO_DEV_TOKEN: 'pk_CD4SuapcQDq1yZFMwSaYeA',
    BRANDFETCH_CID: '1idVW8VN57Jat7AexnZ',

    // Limits — single source of truth (keep CSS breakpoints in sync with MOBILE_MAX_WIDTH)
    MAX_IMPORT_SIZE: 2 * 1024 * 1024,
    MAX_AVATAR_BYTES: 2 * 1024 * 1024,
    MAX_AVATAR_URL_LENGTH: 3_000_000,
    MOBILE_MAX_WIDTH: 768
};
