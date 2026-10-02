// Canonical-host redirect worker: https://www.324893.xyz/* -> https://324893.xyz/*
//
// Deploy (from this directory):
//   wrangler deploy
//
// The route in wrangler.toml only matches traffic that is proxied by
// Cloudflare, so the www DNS record must stay proxied (orange cloud).
// The apex stays DNS-only and keeps the exact origin headers from Pages.

const APEX = '324893.xyz';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, `https://${APEX}`);
    return new Response(null, {
      status: 301,
      headers: {
        location: target.toString(),
        'cache-control': 'public, max-age=3600',
      },
    });
  },
};
