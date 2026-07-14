// D1 queries + neighborhood/city display names.

export const CITIES = { minneapolis: 'Minneapolis', 'st-paul': 'St Paul' };

export const HOODS = {
  nordeast: 'Nordeast', 'north-loop': 'North Loop', downtown: 'Downtown',
  uptown: 'Uptown', 'eat-street': 'Eat Street', 'west-bank': 'West Bank',
  dinkytown: 'Dinkytown', 'cathedral-hill': 'Cathedral Hill',
  'grand-avenue': 'Grand Avenue', lowertown: 'Lowertown', 'west-7th': 'West 7th',
  'mac-groveland': 'Mac-Groveland', 'west-side': 'West Side', 'payne-phalen': 'Payne-Phalen',
  longfellow: 'Longfellow', como: 'Como',
};

export const hoodName = slug => HOODS[slug] || slug;

/** Regular-hours JSON column → array of {dow_mask, start_min, end_min}. */
const parseHours = s => { try { return s ? JSON.parse(s) : []; } catch { return []; } };

export const CATEGORIES = {
  'cocktail-bar': 'Cocktail Bar', 'bar-restaurant': 'Bar & Restaurant',
  'dive-bar': 'Dive Bar', lounge: 'Lounge',
};
export const categoryName = slug => CATEGORIES[slug] || '';
export const priceLabel = n => (n >= 1 && n <= 4 ? '$'.repeat(n) : '');

/** All bars with their HH windows attached. One query each, joined in JS. */
export async function allBarsWithHH(db) {
  const [bars, hhs] = await Promise.all([
    db.prepare('SELECT * FROM bars ORDER BY name').all(),
    db.prepare('SELECT * FROM happy_hours').all(),
  ]);
  const byBar = new Map();
  for (const hh of hhs.results) {
    if (!byBar.has(hh.bar_id)) byBar.set(hh.bar_id, []);
    byBar.get(hh.bar_id).push(hh);
  }
  return bars.results.map(b => ({ ...b, hh: byBar.get(b.id) || [], hours: parseHours(b.hours) }));
}

export async function barBySlug(db, slug) {
  const bar = await db.prepare('SELECT * FROM bars WHERE slug = ?').bind(slug).first();
  if (!bar) return null;
  const hh = await db.prepare('SELECT * FROM happy_hours WHERE bar_id = ? ORDER BY start_min')
    .bind(bar.id).all();
  return { ...bar, hh: hh.results, hours: parseHours(bar.hours) };
}

/** [{slug, name, city, count}] for hoods that actually have bars. */
export async function hoodCounts(db) {
  const rows = await db.prepare(
    'SELECT neighborhood, city, COUNT(*) AS count FROM bars GROUP BY neighborhood ORDER BY count DESC'
  ).all();
  return rows.results.map(r => ({
    slug: r.neighborhood, name: hoodName(r.neighborhood), city: r.city, count: r.count,
  }));
}
