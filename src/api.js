// GET /api/bars.json — compact payload for on-device filtering + distance sort.
import { allBarsWithHH } from './lib/data.js';

export async function barsJson({ env }) {
  const bars = await allBarsWithHH(env.DB);
  const payload = {
    generated: new Date().toISOString(),
    bars: bars.map(b => ({
      id: b.id, slug: b.slug, name: b.name, hood: b.neighborhood, city: b.city,
      lat: b.lat, lng: b.lng,
      patio: b.patio, rooftop: b.rooftop, skyway: b.skyway, verified: b.verified,
      price: b.price, category: b.category, seating: b.seating, food: b.food,
      hh: b.hh.map(h => ({ d: h.dow_mask, s: h.start_min, e: h.end_min, deals: h.deals })),
    })),
  };
  return new Response(JSON.stringify(payload), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'access-control-allow-origin': '*',
    },
  });
}

/**
 * POST /api/fav — bump a bar's heart tally.
 *
 * Body: {"slug": "aster-cafe", "on": true}. `on:false` decrements.
 *
 * Aggregate ONLY: we add or subtract one from a per-bar integer and store
 * nothing about who sent it. The visitor's own heart list never leaves their
 * localStorage, which is what /privacy promises. An unknown slug is rejected
 * rather than created, so this can't be used to seed junk rows.
 */
export async function favCount({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
  const slug = String(body?.slug || '');
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return new Response('bad slug', { status: 400 });
  const known = await env.DB.prepare('SELECT 1 FROM bars WHERE slug = ?').bind(slug).first();
  if (!known) return new Response('unknown bar', { status: 404 });
  // Unhearting floors at zero: counts drift from cleared browsers and shared
  // links, and a negative tally would be worse than a slightly stale one.
  const sql = body?.on
    ? `INSERT INTO fav_counts (slug, n) VALUES (?, 1)
       ON CONFLICT(slug) DO UPDATE SET n = n + 1, updated = datetime('now')`
    : `INSERT INTO fav_counts (slug, n) VALUES (?, 0)
       ON CONFLICT(slug) DO UPDATE SET n = MAX(n - 1, 0), updated = datetime('now')`;
  await env.DB.prepare(sql).bind(slug).run();
  return new Response(null, { status: 204 });
}
