import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emitSql } from '../scripts/seed.js';
import { barsFromRows } from '../scripts/export.js';

const bar = {
  slug: 'the-spot', name: "The Spot's Bar", city: 'minneapolis', neighborhood: 'nordeast',
  lat: 45.0, lng: -93.27, website: 'https://spot.example', address: '1 Main St NE',
  state: 'MN', zip: '55418', patio: 1, price: 2, category: 'dive-bar',
  seating: 'Booths', food: 'Burgers', verified: 1, last_verified: '2026-07-14',
  hours: [{ dow_mask: 31, start_min: 660, end_min: 1440 }],
  hh: [{ dow_mask: 31, start_min: 900, end_min: 1080, deals: "$5 taps, ''quoted''" }],
  notes: 'A note.',
};

test('emitSql upserts by slug — no wipes, no explicit ids', () => {
  const sql = emitSql([bar]);
  assert.match(sql, /ON CONFLICT\(slug\) DO UPDATE SET name=excluded\.name/);
  assert.doesNotMatch(sql, /DELETE FROM bars/);
  assert.doesNotMatch(sql, /INSERT INTO bars \(id/);
  // hh replaced per bar, keyed through the bar's current id
  assert.match(sql, /DELETE FROM happy_hours WHERE bar_id = \(SELECT id FROM bars WHERE slug = 'the-spot'\)/);
  assert.match(sql, /INSERT INTO happy_hours .* SELECT id, 31, 900, 1080, .* FROM bars WHERE slug = 'the-spot'/);
  // quotes escaped SQL-style
  assert.match(sql, /The Spot''s Bar/);
});

test('emitSql handles optional fields as NULL', () => {
  const sql = emitSql([{ ...bar, address: undefined, zip: undefined, price: undefined,
    last_verified: undefined, verified: 0, hours: undefined }]);
  assert.match(sql, /NULL/);
  assert.doesNotMatch(sql, /'undefined'/);
});

test('barsFromRows round-trips a D1 row back to bars.json shape', () => {
  const barRow = {
    id: 42, slug: 'the-spot', name: "The Spot's Bar", city: 'minneapolis',
    neighborhood: 'nordeast', lat: 45.0, lng: -93.27, website: 'https://spot.example',
    patio: 1, rooftop: 0, skyway: 0, verified: 1, last_verified: '2026-07-14',
    notes: 'A note.', price: 2, category: 'dive-bar', seating: 'Booths', food: 'Burgers',
    hours: '[{"dow_mask":31,"start_min":660,"end_min":1440}]',
    address: '1 Main St NE', state: 'MN', zip: '55418', created_at: 'x',
  };
  const hhRow = { id: 7, bar_id: 42, dow_mask: 31, start_min: 900, end_min: 1080, deals: '$5 taps' };
  const [out] = barsFromRows([barRow], [hhRow]);
  assert.equal(out.slug, 'the-spot');
  assert.equal(out.patio, 1);
  assert.equal('rooftop' in out, false, 'zero flags omitted');
  assert.deepEqual(out.hours, [{ dow_mask: 31, start_min: 660, end_min: 1440 }]);
  assert.deepEqual(out.hh, [{ dow_mask: 31, start_min: 900, end_min: 1080, deals: '$5 taps' }]);
  assert.equal('id' in out, false, 'db id never leaks into bars.json');
  assert.equal('created_at' in out, false);
});

test('barsFromRows sorts by slug and drops empty optionals', () => {
  const rows = [
    { id: 2, slug: 'b-bar', name: 'B', city: 'st-paul', neighborhood: 'como', lat: 1, lng: 2,
      website: null, patio: 0, rooftop: 0, skyway: 0, verified: 0, last_verified: null,
      notes: '', price: null, category: '', seating: '', food: '', hours: null,
      address: null, state: 'MN', zip: null },
    { id: 1, slug: 'a-bar', name: 'A', city: 'st-paul', neighborhood: 'como', lat: 1, lng: 2,
      website: '', patio: 0, rooftop: 0, skyway: 0, verified: 0, last_verified: null,
      notes: '', price: null, category: '', seating: '', food: '', hours: null,
      address: null, state: 'MN', zip: null },
  ];
  const out = barsFromRows(rows, []);
  assert.deepEqual(out.map(b => b.slug), ['a-bar', 'b-bar']);
  assert.equal('price' in out[0], false);
  assert.equal('notes' in out[0], false);
  assert.deepEqual(out[0].hh, []);
});
