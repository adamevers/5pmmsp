import test from 'node:test';
import assert from 'node:assert/strict';
import { maskDays, hhmm, openingHours, barJsonLd, listJsonLd, breadcrumbJsonLd } from '../src/lib/schema.js';
import { statLine, hoodIntro, HOOD_BLURBS } from '../src/lib/hoods.js';
import { normalizePhone, fmtPhone, normalizeInstagram, barFromForm } from '../src/lib/adminform.js';

test('maskDays maps bit0=Mon in week order', () => {
  assert.deepEqual(maskDays(0b0000001), ['Monday']);
  assert.deepEqual(maskDays(0b1000000), ['Sunday']);
  assert.deepEqual(maskDays(31), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  assert.equal(maskDays(127).length, 7);
  assert.deepEqual(maskDays(0), []);
});

test('hhmm formats minutes, clamping end-of-day to 23:59', () => {
  assert.equal(hhmm(0), '00:00');
  assert.equal(hhmm(540), '09:00');
  assert.equal(hhmm(1020), '17:00');
  assert.equal(hhmm(1290), '21:30');
  // Our data uses 1440 for "closes at midnight"; schema.org has no 24:00.
  assert.equal(hhmm(1440), '23:59');
});

test('openingHours emits one spec per window and drops empty masks', () => {
  const out = openingHours([
    { dow_mask: 31, start_min: 660, end_min: 1440 },
    { dow_mask: 0, start_min: 0, end_min: 60 },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0]['@type'], 'OpeningHoursSpecification');
  assert.equal(out[0].opens, '11:00');
  assert.equal(out[0].closes, '23:59');
  assert.equal(out[0].dayOfWeek.length, 5);
});

test('openingHours keeps closes < opens for windows past midnight', () => {
  const [spec] = openingHours([{ dow_mask: 64, start_min: 1320, end_min: 30 }]);
  assert.equal(spec.opens, '22:00');
  assert.equal(spec.closes, '00:30'); // schema.org reads this as next-day
});

const BAR = {
  slug: 'test-bar', name: 'Test Bar', city: 'st-paul', neighborhood: 'lowertown',
  lat: 44.95, lng: -93.08, address: '214 4th St E', state: 'MN', zip: '55101',
  price: 2, category: 'bar-restaurant', food: 'American, Burgers',
  website: 'https://example.com', instagram: 'testbar',
  patio: 1, rooftop: 0, skyway: 0,
  hours: [{ dow_mask: 31, start_min: 660, end_min: 1440 }],
  hh: [{ dow_mask: 31, start_min: 900, end_min: 1080, deals: '$2 off taps' }],
};

test('barJsonLd carries the full address, not just the locality', () => {
  const j = barJsonLd(BAR);
  assert.equal(j.address.streetAddress, '214 4th St E');
  assert.equal(j.address.postalCode, '55101');
  assert.equal(j.address.addressLocality, 'St Paul');
  assert.equal(j.address.addressRegion, 'MN');
  assert.equal(j.address.addressCountry, 'US');
});

test('barJsonLd includes price, hours, cuisine, amenities and both profiles', () => {
  const j = barJsonLd(BAR);
  assert.equal(j['@type'], 'BarOrPub');
  assert.equal(j.priceRange, '$$');
  assert.equal(j.openingHoursSpecification.length, 1);
  assert.deepEqual(j.servesCuisine, ['American', 'Burgers']);
  assert.equal(j.amenityFeature.length, 1);
  assert.equal(j.amenityFeature[0].name, 'Outdoor patio');
  assert.deepEqual(j.sameAs, ['https://example.com', 'https://www.instagram.com/testbar']);
  assert.match(j.hasMap, /^https:\/\/www\.google\.com\/maps/);
});

test('barJsonLd omits optional keys rather than emitting empty ones', () => {
  const bare = { slug: 'x', name: 'X', city: 'minneapolis', lat: 1, lng: 2, price: 0, hours: [], hh: [] };
  const j = barJsonLd(bare);
  assert.ok(!('priceRange' in j));
  assert.ok(!('openingHoursSpecification' in j));
  assert.ok(!('servesCuisine' in j));
  assert.ok(!('amenityFeature' in j));
  assert.ok(!('sameAs' in j));
  assert.ok(!('streetAddress' in j.address));
});

test('listJsonLd numbers items from 1 in render order', () => {
  const j = listJsonLd({
    name: 'Lowertown happy hours', description: 'd', path: '/lowertown',
    bars: [{ slug: 'a', name: 'A' }, { slug: 'b', name: 'B' }],
  });
  assert.equal(j.mainEntity.numberOfItems, 2);
  assert.equal(j.mainEntity.itemListElement[0].position, 1);
  assert.equal(j.mainEntity.itemListElement[1].url, 'https://5pmmsp.com/bar/b');
});

test('breadcrumbJsonLd builds absolute trail items', () => {
  const j = breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Lowertown', path: '/lowertown' }]);
  assert.equal(j.itemListElement[1].position, 2);
  assert.equal(j.itemListElement[1].item, 'https://5pmmsp.com/lowertown');
});

test('barJsonLd emits telephone when a number is on file', () => {
  assert.equal(barJsonLd({ ...BAR, phone: '+16125551234' }).telephone, '+16125551234');
  assert.ok(!('telephone' in barJsonLd(BAR)));
});

// ── phone + instagram normalization ────────────────────────────────────────

test('normalizePhone accepts every spelling a human or scraper produces', () => {
  for (const raw of ['6125551234', '612-555-1234', '(612) 555-1234', '612.555.1234',
    '+1 612 555 1234', '1-612-555-1234', ' 612 555 1234 ']) {
    assert.equal(normalizePhone(raw), '+16125551234', `failed on ${raw}`);
  }
});

test('normalizePhone rejects anything that is not a US number', () => {
  for (const raw of ['', null, undefined, '555-1234', '12345', 'call us',
    '+44 20 7946 0958', '61255512345']) {
    assert.equal(normalizePhone(raw), null, `should reject ${raw}`);
  }
});

test('fmtPhone round-trips E.164 back to a readable number', () => {
  assert.equal(fmtPhone('+16125551234'), '(612) 555-1234');
  assert.equal(normalizePhone(fmtPhone('+16125551234')), '+16125551234');
  assert.equal(fmtPhone(''), '');
});

test('normalizeInstagram strips @, URLs and trailing slashes', () => {
  assert.equal(normalizeInstagram('@brits_pub'), 'brits_pub');
  assert.equal(normalizeInstagram('brits_pub'), 'brits_pub');
  assert.equal(normalizeInstagram('https://www.instagram.com/brits_pub/'), 'brits_pub');
  assert.equal(normalizeInstagram('instagram.com/brits.pub'), 'brits.pub');
  assert.equal(normalizeInstagram(''), null);
  assert.equal(normalizeInstagram('has spaces'), null);
});

test('barFromForm normalizes both fields and reports bad input', () => {
  const mk = extra => new URLSearchParams({
    name: 'X', city: 'minneapolis', neighborhood: 'nordeast',
    lat: '45', lng: '-93', ...extra,
  });
  const ok = barFromForm(mk({ phone: '(612) 555-1234', instagram: '@x_bar' }), 'x-bar');
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.bar.phone, '+16125551234');
  assert.equal(ok.bar.instagram, 'x_bar');

  const bad = barFromForm(mk({ phone: '555' }), 'x-bar');
  assert.match(bad.errors.join(' '), /10-digit US number/);

  // Blank stays null and raises nothing.
  const blank = barFromForm(mk({ phone: '', instagram: '' }), 'x-bar');
  assert.deepEqual(blank.errors, []);
  assert.equal(blank.bar.phone, null);
  assert.equal(blank.bar.instagram, null);
});

// ── hood copy ──────────────────────────────────────────────────────────────

test('statLine reports counts, verification and the earliest start', () => {
  const s = statLine([
    { verified: 1, category: 'dive-bar', patio: 1, hh: [{ start_min: 900 }] },
    { verified: 0, category: 'dive-bar', patio: 0, hh: [{ start_min: 780 }] },
  ]);
  assert.match(s, /We track 2 happy hours here/);
  assert.match(s, /1 of them verified/);
  assert.match(s, /Most are dive bars\./);
  assert.match(s, /earliest deal starts at 1 PM\./); // 780 min, with meridiem
});

test('statLine handles a single fully-verified bar without plural glitches', () => {
  const s = statLine([{ verified: 1, patio: 0, hh: [{ start_min: 1020 }] }]);
  assert.match(s, /We track 1 happy hour here/);
  assert.ok(!s.includes('happy hours here'));
  assert.match(s, /5 PM/);
});

test('statLine is empty for an empty hood', () => {
  assert.equal(statLine([]), '');
});

test('hoodIntro prefixes the hand-written blurb when we have one', () => {
  const bars = [{ verified: 1, patio: 0, hh: [{ start_min: 900 }] }];
  const withBlurb = hoodIntro('nordeast', bars);
  assert.ok(withBlurb.startsWith(HOOD_BLURBS.nordeast));
  assert.match(withBlurb, /We track 1 happy hour here/);
  // A suburb with no blurb still gets unique, data-derived copy.
  const noBlurb = hoodIntro('waconia', bars);
  assert.match(noBlurb, /^We track 1 happy hour here/);
});

test('seed and export agree on the bar columns — the bug that lost instagram', async () => {
  const { emitSql } = await import('../scripts/seed.js');
  const { barsFromRows } = await import('../scripts/export.js');
  const bar = {
    slug: 's', name: 'S', city: 'minneapolis', neighborhood: 'nordeast',
    lat: 45, lng: -93, website: '', phone: '+16125551234', instagram: 'shandle',
    verified: 0, hh: [],
  };
  // Written to SQL…
  const sql = emitSql([bar]);
  assert.match(sql, /phone/);
  assert.match(sql, /'\+16125551234'/);
  assert.match(sql, /'shandle'/);
  // …and read back out of D1 into bars.json without dropping either field.
  const [out] = barsFromRows([{ id: 1, ...bar, hours: null }], []);
  assert.equal(out.phone, '+16125551234');
  assert.equal(out.instagram, 'shandle');
});

test('every hand-written blurb is real prose, not a stub', () => {
  for (const [slug, text] of Object.entries(HOOD_BLURBS)) {
    assert.ok(text.length > 60, `${slug} blurb is too short`);
    assert.ok(!text.includes('—'), `${slug} blurb uses an em dash`);
  }
});
