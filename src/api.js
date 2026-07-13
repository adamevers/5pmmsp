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
