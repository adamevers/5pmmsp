// /sitemap.xml + /robots.txt
import { hoodCounts } from './lib/data.js';
import { CITIES } from './lib/data.js';

export async function sitemap({ env }) {
  const bars = await env.DB.prepare('SELECT slug FROM bars ORDER BY slug').all();
  const hoods = await hoodCounts(env.DB);
  const urls = [
    '/', ...Object.keys(CITIES).map(c => `/${c}`),
    ...hoods.map(h => `/${h.slug}`),
    ...bars.results.map(b => `/bar/${b.slug}`),
    '/submit', '/neighborhoods', '/privacy',
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>https://5pmmsp.com${u}</loc></url>`).join('\n')}
</urlset>`;
  return new Response(body, {
    headers: { 'content-type': 'application/xml', 'cache-control': 'public, max-age=3600' },
  });
}

export function robots() {
  return new Response('User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: https://5pmmsp.com/sitemap.xml\n', {
    headers: { 'content-type': 'text/plain' },
  });
}
