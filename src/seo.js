// /sitemap.xml + /robots.txt
import { hoodCounts } from './lib/data.js';
import { CITIES } from './lib/data.js';
import { DAY_SLUGS } from './pages.js';

export async function sitemap({ env }) {
  const bars = await env.DB.prepare('SELECT slug FROM bars ORDER BY slug').all();
  const hoods = await hoodCounts(env.DB);
  // Only list cities that actually have bars — a 404 in the sitemap is a
  // crawl-budget leak and an avoidable Search Console error.
  const cities = new Set(hoods.map(h => h.city).filter(c => CITIES[c]));
  // Suburbs live in CITIES *and* HOODS under the same slug (a bar in Andover
  // has city 'andover' and neighborhood 'andover'), so the two lists collide.
  // One path, one entry: the router serves it from cityPage either way.
  const urls = [...new Set([
    '/', ...[...cities].map(c => `/${c}`),
    ...hoods.map(h => `/${h.slug}`),
    ...DAY_SLUGS.map(d => `/${d}`),
    ...bars.results.map(b => `/bar/${b.slug}`),
    '/submit', '/neighborhoods', '/privacy',
  ])];
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
