// End-to-end render tests through the real router, against a fake D1.
// These exist mainly to pin route ORDER: /:day, /:city and /:hood are all
// one-segment patterns that resolve by falling through on a null return.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { layout } from '../src/lib/html.js';

const BARS = [
  {
    id: 1, slug: 'grain-belt-tap', name: 'Grain Belt Tap', city: 'minneapolis',
    neighborhood: 'nordeast', lat: 45.0, lng: -93.26, address: '77 13th Ave NE',
    state: 'MN', zip: '55413', price: 2, category: 'dive-bar', food: 'Burgers',
    website: 'https://example.com', instagram: 'grainbelttap',
    patio: 1, rooftop: 0, skyway: 0, verified: 1, last_verified: '2026-07-25',
    notes: null, seating: 'Bar stools',
    hours: JSON.stringify([{ dow_mask: 127, start_min: 660, end_min: 1440 }]),
  },
  {
    id: 2, slug: 'lowertown-late', name: 'Lowertown Late', city: 'st-paul',
    neighborhood: 'lowertown', lat: 44.95, lng: -93.08, address: '214 4th St E',
    state: 'MN', zip: '55101', price: 3, category: 'cocktail-bar', food: null,
    website: null, instagram: null,
    patio: 0, rooftop: 1, skyway: 0, verified: 0, last_verified: null,
    notes: null, seating: null,
    hours: JSON.stringify([{ dow_mask: 127, start_min: 960, end_min: 120 }]),
  },
  {
    // Suburb: the same slug is both a city and a neighborhood, which is what
    // duplicated entries in the real sitemap. No happy hour on file.
    id: 3, slug: 'waconia-supper', name: 'Waconia Supper', city: 'waconia',
    neighborhood: 'waconia', lat: 44.85, lng: -93.79, address: '1 Main St',
    state: 'MN', zip: '55387', price: 2, category: null, food: null,
    website: null, instagram: null,
    patio: 0, rooftop: 0, skyway: 0, verified: 0, last_verified: null,
    notes: null, seating: null, hours: null,
  },
];

const HHS = [
  // Mon–Fri 3–6 PM
  { id: 1, bar_id: 1, dow_mask: 31, start_min: 900, end_min: 1080, deals: '$2 off taps' },
  // Fri–Sat 10 PM–1 AM (late night, crosses midnight)
  { id: 2, bar_id: 2, dow_mask: 0b0110000, start_min: 1320, end_min: 60, deals: 'half-price wine' },
];

function fakeDB() {
  const run = (sql, args) => {
    if (sql.includes('COUNT(*)')) {
      const seen = new Map();
      for (const b of BARS) {
        const k = `${b.neighborhood}|${b.city}`;
        seen.set(k, (seen.get(k) || 0) + 1);
      }
      return {
        results: [...seen].map(([k, count]) => {
          const [neighborhood, city] = k.split('|');
          return { neighborhood, city, count };
        }),
      };
    }
    if (sql.includes('FROM happy_hours')) {
      const rows = args ? HHS.filter(h => h.bar_id === args[0]) : HHS;
      return { results: rows };
    }
    if (sql.includes('FROM bars')) {
      const rows = args ? BARS.filter(b => b.slug === args[0]) : BARS;
      return { results: rows };
    }
    return { results: [] };
  };
  return {
    prepare(sql) {
      const mk = args => ({
        bind: (...a) => mk(a),
        all: async () => run(sql, args),
        first: async () => run(sql, args).results[0] || null,
      });
      return mk(null);
    },
  };
}

const env = {
  DB: fakeDB(),
  TURNSTILE_SITEKEY: '1x00000000000000000000AA',
  ADMIN_TOKEN: '',
  ASSETS: { fetch: async () => new Response('nope', { status: 404 }) },
};

const get = path => worker.fetch(new Request(`https://5pmmsp.com${path}`), env, {});
const body = async path => {
  const res = await get(path);
  return { status: res.status, html: await res.text() };
};

test('home renders with both bars', async () => {
  const { status, html } = await body('/');
  assert.equal(status, 200);
  assert.match(html, /Grain Belt Tap/);
  assert.match(html, /Lowertown Late/);
});

test('day page resolves ahead of the city and hood catch-alls', async () => {
  const { status, html } = await body('/friday');
  assert.equal(status, 200);
  assert.match(html, /Friday happy hours/);
  assert.match(html, /<title>Friday happy hours in Minneapolis and St Paul/);
  // Both bars run something on Friday (bit 4 set in 31 and in 0b0110000).
  assert.match(html, /Grain Belt Tap/);
  assert.match(html, /Lowertown Late/);
});

test('day page excludes bars with no window that day', async () => {
  const { status, html } = await body('/monday');
  assert.equal(status, 200);
  // Mon–Fri window qualifies; the Fri–Sat one does not.
  assert.match(html, /Grain Belt Tap/);
  assert.ok(!html.includes('Lowertown Late'), 'Fri–Sat bar leaked onto Monday');
});

test('a day nobody serves 404s rather than rendering an empty page', async () => {
  const res = await get('/sunday');
  assert.equal(res.status, 404);
});

test('late-night page lists only late or past-midnight windows', async () => {
  const { status, html } = await body('/late-night');
  assert.equal(status, 200);
  assert.match(html, /Late night happy hours/);
  assert.match(html, /Lowertown Late/);
  assert.ok(!html.includes('Grain Belt Tap'), '3-6 PM window is not late night');
});

test('hood page renders the hand-written blurb and list schema', async () => {
  const { status, html } = await body('/nordeast');
  assert.equal(status, 200);
  assert.match(html, /Northeast Minneapolis wears its old Polish/);
  assert.match(html, /We track 1 happy hour here/);
  assert.match(html, /"@type":"CollectionPage"/);
  assert.match(html, /"@type":"BreadcrumbList"/);
});

test('city page still resolves and carries intro copy', async () => {
  const { status, html } = await body('/minneapolis');
  assert.equal(status, 200);
  assert.match(html, /Happy hours across Minneapolis/);
  assert.match(html, /Grain Belt Tap/);
});

test('bar page emits the enriched BarOrPub node', async () => {
  const { status, html } = await body('/bar/grain-belt-tap');
  assert.equal(status, 200);
  assert.match(html, /"streetAddress":"77 13th Ave NE"/);
  assert.match(html, /"postalCode":"55413"/);
  assert.match(html, /"priceRange":"\$\$"/);
  assert.match(html, /"openingHoursSpecification"/);
  assert.match(html, /instagram\.com\/grainbelttap/);
  assert.match(html, /"@type":"BreadcrumbList"/);
});

test('sitemap includes the day pages and skips empty cities', async () => {
  const res = await get('/sitemap.xml');
  const xml = await res.text();
  assert.equal(res.status, 200);
  assert.match(xml, /5pmmsp\.com\/friday/);
  assert.match(xml, /5pmmsp\.com\/late-night/);
  assert.match(xml, /5pmmsp\.com\/minneapolis/);
  assert.match(xml, /5pmmsp\.com\/bar\/grain-belt-tap/);
  // Edina is in CITIES but has no bars — it must not be advertised.
  assert.ok(!xml.includes('5pmmsp.com/edina'), 'empty city leaked into sitemap');
});

test('sitemap never lists the same URL twice', async () => {
  const xml = await (await get('/sitemap.xml')).text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const dupes = locs.filter((u, i) => locs.indexOf(u) !== i);
  assert.deepEqual(dupes, [], `duplicate sitemap entries: ${[...new Set(dupes)].join(', ')}`);
  // Suburbs collide across CITIES and HOODS under one slug — the case that
  // actually shipped broken. 'waconia' is both in the real dataset.
  assert.equal(locs.filter(u => u.endsWith('/waconia')).length <= 1, true);
});

test('every JSON-LD block on every page type is parseable', async () => {
  const paths = ['/', '/friday', '/late-night', '/nordeast', '/minneapolis', '/bar/grain-belt-tap'];
  for (const p of paths) {
    const { html } = await body(p);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.ok(blocks.length, `${p} has no JSON-LD`);
    for (const [, raw] of blocks) {
      const node = JSON.parse(raw.replaceAll('<\\/', '</')); // undo the tag-safety escape
      assert.equal(node['@context'], 'https://schema.org', `${p} block missing @context`);
      assert.ok(node['@type'], `${p} block missing @type`);
    }
  }
});

test('each page type points at its own OG image, not the shared default', async () => {
  const cases = [
    ['/bar/grain-belt-tap', '/og/bar/grain-belt-tap.png'],
    ['/nordeast', '/og/hood/nordeast.png'],
    ['/minneapolis', '/og/city/minneapolis.png'],
    ['/friday', '/og/day/friday.png'],
    ['/late-night', '/og/day/late-night.png'],
  ];
  for (const [path, img] of cases) {
    const { html } = await body(path);
    assert.match(html, new RegExp(`og:image" content="https://5pmmsp\\.com${img.replace(/[/.]/g, '\\$&')}"`), path);
    assert.match(html, new RegExp(`twitter:image" content="https://5pmmsp\\.com${img.replace(/[/.]/g, '\\$&')}"`), path);
  }
});

test('every OG image a real page references exists on disk', async () => {
  const { existsSync } = await import('node:fs');
  const { bars } = JSON.parse(
    (await import('node:fs')).readFileSync(new URL('../seed/bars.json', import.meta.url), 'utf8'));
  const pub = p => new URL(`../public${p}`, import.meta.url);
  const missing = [];
  for (const b of bars) {
    if (!existsSync(pub(`/og/bar/${b.slug}.png`))) missing.push(b.slug);
  }
  for (const d of ['monday', 'friday', 'sunday', 'late-night']) {
    if (!existsSync(pub(`/og/day/${d}.png`))) missing.push(`day/${d}`);
  }
  assert.deepEqual(missing, [], `missing OG images — re-run node scripts/og-pages.js`);
});

test('unknown one-segment path still 404s', async () => {
  const res = await get('/not-a-real-place');
  assert.equal(res.status, 404);
});

test('JSON-LD is escaped so a name cannot break out of the script tag', () => {
  const out = layout({
    title: 't', desc: 'd', body: '',
    jsonld: { '@type': 'BarOrPub', name: 'Evil </script><script>alert(1)</script>' },
  });
  assert.ok(!out.includes('</script><script>alert(1)'), 'broke out of the ld+json block');
  assert.match(out, /<\\\/script>/); // the escaped form is what landed
});

test('layout accepts an array of JSON-LD nodes', () => {
  const out = layout({
    title: 't', desc: 'd', body: '',
    jsonld: [{ '@type': 'A' }, null, { '@type': 'B' }],
  });
  assert.equal(out.match(/application\/ld\+json/g).length, 2, 'nulls should be dropped');
});
