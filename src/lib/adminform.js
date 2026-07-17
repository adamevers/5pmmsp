// Pure helpers for the /admin forms — parsing window-editor rows and bar
// fields out of a FormData/URLSearchParams. No Workers APIs so node:test can
// exercise them directly.
import { CITIES, HOODS, CATEGORIES } from './data.js';

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // bit 0=Mon

export function minutesFromTime(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export const timeFromMinutes = m =>
  `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * Parse editor rows named `${prefix}${i}d${bit}` (day checkboxes),
 * `${prefix}${i}s` / `${prefix}${i}e` (time inputs) and optionally
 * `${prefix}${i}deals`. Rows missing days, times (or deals when required)
 * are skipped. An end of 00:00 means "closes at midnight" → 1440, matching
 * the dataset convention (end_min < start_min = crosses midnight).
 */
export function parseWindows(form, prefix, { deals = false } = {}) {
  const out = [];
  for (let i = 0; i < 12; i++) {
    let mask = 0;
    for (let b = 0; b < 7; b++) if (form.get(`${prefix}${i}d${b}`)) mask |= 1 << b;
    const s = minutesFromTime(form.get(`${prefix}${i}s`));
    const rawE = minutesFromTime(form.get(`${prefix}${i}e`));
    const dl = deals ? String(form.get(`${prefix}${i}deals`) || '').trim() : null;
    if (!mask || s == null || rawE == null) continue;
    if (deals && !dl) continue;
    const w = { dow_mask: mask, start_min: s, end_min: rawE === 0 ? 1440 : rawE };
    if (deals) w.deals = dl;
    out.push(w);
  }
  return out;
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Bar fields + validation from an editor form. Slug passed separately
 * (immutable on edit, form-supplied on create). */
export function barFromForm(form, slug) {
  const g = n => String(form.get(n) || '').trim();
  const errors = [];
  const bar = {
    slug, name: g('name'), city: g('city'), neighborhood: g('neighborhood'),
    lat: Number(g('lat')), lng: Number(g('lng')), website: g('website'),
    address: g('address') || null, state: g('state') || 'MN', zip: g('zip') || null,
    patio: form.get('patio') ? 1 : 0, rooftop: form.get('rooftop') ? 1 : 0,
    skyway: form.get('skyway') ? 1 : 0,
    price: g('price') ? Number(g('price')) : null,
    category: g('category'), seating: g('seating'), food: g('food'),
    notes: g('notes'), verified: form.get('verified') ? 1 : 0,
    last_verified: g('last_verified') || null,
  };
  if (!SLUG_RE.test(slug || '')) errors.push('Slug must be kebab-case (a-z, 0-9, dashes).');
  if (!bar.name) errors.push('Name is required.');
  if (!CITIES[bar.city]) errors.push(`Unknown city slug "${bar.city}" — register it in src/lib/data.js first.`);
  if (!HOODS[bar.neighborhood]) errors.push(`Unknown neighborhood slug "${bar.neighborhood}" — register it in src/lib/data.js first.`);
  if (!Number.isFinite(bar.lat) || !Number.isFinite(bar.lng) || !bar.lat || !bar.lng)
    errors.push('lat/lng are required numbers.');
  if (bar.price != null && !(bar.price >= 1 && bar.price <= 4)) errors.push('Price is 1-4.');
  if (bar.category && !CATEGORIES[bar.category]) errors.push(`Unknown category "${bar.category}".`);
  if (bar.verified && bar.last_verified && !/^\d{4}-\d{2}-\d{2}$/.test(bar.last_verified))
    errors.push('last_verified must be YYYY-MM-DD.');
  if (!bar.verified) bar.last_verified = null;
  return { bar, errors };
}
