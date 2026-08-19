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

/** Hearts one sender may cast site-wide in a day before we stop counting. */
const FAV_DAILY_CAP = 40;

/**
 * Unreversible per-day key. HMAC-SHA256 over a server-side secret plus today's
 * date, so the same input yields a different key tomorrow and nobody without
 * the secret can test a guess. Returns hex.
 *
 * FAV_SALT is a wrangler secret. If it's ever missing we fall back to the
 * Turnstile secret rather than hashing with a known constant, which would make
 * the keys guessable.
 */
async function dayKey(env, day, ...parts) {
  const secret = env.FAV_SALT || env.TURNSTILE_SECRET || 'dev-only-unsafe-salt';
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode([day, ...parts].join('|')));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * POST /api/fav — bump a bar's heart tally.
 *
 * Body: {"slug": "aster-cafe", "on": true}. `on:false` decrements.
 *
 * Aggregate only: one integer per bar, nothing about who sent it. Gaming is
 * held down by two hashed, self-expiring guards (see 0010_fav_guard.sql) —
 * one heart per source per bar per day, and a daily ceiling per source across
 * the site. A blocked call still answers 204: telling a stuffer exactly which
 * request was rejected just teaches them the shape of the limit.
 */
export async function favCount({ request, env, ctx }) {
  let body;
  try { body = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
  const slug = String(body?.slug || '');
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return new Response('bad slug', { status: 400 });
  const known = await env.DB.prepare('SELECT 1 FROM bars WHERE slug = ?').bind(slug).first();
  if (!known) return new Response('unknown bar', { status: 404 });

  const on = !!body?.on;
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get('cf-connecting-ip') || '';
  const [barKey, srcKey] = await Promise.all([
    dayKey(env, day, ip, slug),
    dayKey(env, day, ip),
  ]);

  if (on) {
    // Site-wide ceiling first: stops one source mass-hearting every bar.
    const rate = await env.DB.prepare(
      `INSERT INTO fav_rate (k, day, n) VALUES (?, ?, 1)
       ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n`).bind(srcKey, day).first();
    if ((rate?.n || 0) > FAV_DAILY_CAP) return new Response(null, { status: 204 });
    // One heart per source per bar per day. A repeat insert conflicts, and a
    // conflict means "already counted" — so the tally doesn't move.
    const claim = await env.DB.prepare(
      'INSERT OR IGNORE INTO fav_guard (k, day) VALUES (?, ?)').bind(barKey, day).run();
    if (!claim.meta?.changes) return new Response(null, { status: 204 });
    await env.DB.prepare(
      `INSERT INTO fav_counts (slug, n) VALUES (?, 1)
       ON CONFLICT(slug) DO UPDATE SET n = n + 1, updated = datetime('now')`).bind(slug).run();
  } else {
    // Only un-count a heart this source actually cast today; otherwise a loop
    // of on/off/off/off could drive a rival's tally to zero.
    const undo = await env.DB.prepare(
      'DELETE FROM fav_guard WHERE k = ?').bind(barKey).run();
    if (!undo.meta?.changes) return new Response(null, { status: 204 });
    await env.DB.prepare(
      `INSERT INTO fav_counts (slug, n) VALUES (?, 0)
       ON CONFLICT(slug) DO UPDATE SET n = MAX(n - 1, 0), updated = datetime('now')`).bind(slug).run();
  }

  // Keep the guard tables short-lived. Cheap, and only occasionally.
  if (Math.random() < 0.02) {
    const prune = env.DB.batch([
      env.DB.prepare("DELETE FROM fav_guard WHERE day < date('now', '-2 day')"),
      env.DB.prepare("DELETE FROM fav_rate WHERE day < date('now', '-2 day')"),
    ]).catch(() => {});
    if (ctx?.waitUntil) ctx.waitUntil(prune);
  }
  return new Response(null, { status: 204 });
}
