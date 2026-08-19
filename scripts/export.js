// Regenerate seed/bars.json FROM D1 — the source of truth (admin edits land in
// D1 first; this snapshots them back into the repo for git history and ingest
// dedupe). Run it BEFORE an ingest merge and after admin-edit sessions.
//
//   remote (prod):  ~/cos/scripts/vault run /cos -- sh -c 'export CLOUDFLARE_API_TOKEN=$COS_CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=$COS_CLOUDFLARE_ACCOUNT_ID; cd ~/5pmmsp && node scripts/export.js'
//   local dev DB:   node scripts/export.js --local
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** D1 rows -> bars.json `bars` array (stable field order, omit empty optionals). */
export function barsFromRows(barRows, hhRows) {
  const hhByBar = new Map();
  for (const h of hhRows) {
    if (!hhByBar.has(h.bar_id)) hhByBar.set(h.bar_id, []);
    hhByBar.get(h.bar_id).push({
      dow_mask: h.dow_mask, start_min: h.start_min, end_min: h.end_min, deals: h.deals,
    });
  }
  const parseHours = s => { try { return s ? JSON.parse(s) : []; } catch { return []; } };
  return [...barRows]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map(r => {
      const bar = {
        slug: r.slug, name: r.name, city: r.city, neighborhood: r.neighborhood,
        lat: r.lat, lng: r.lng, website: r.website || '',
      };
      if (r.closed) { bar.closed = 1; if (r.closed_note) bar.closed_note = r.closed_note; }
      if (r.phone) bar.phone = r.phone;
      if (r.instagram) bar.instagram = r.instagram;
      if (r.address) bar.address = r.address;
      if (r.state) bar.state = r.state;
      if (r.zip) bar.zip = r.zip;
      if (r.patio) bar.patio = 1;
      if (r.rooftop) bar.rooftop = 1;
      if (r.skyway) bar.skyway = 1;
      if (r.price) bar.price = r.price;
      if (r.category) bar.category = r.category;
      if (r.seating) bar.seating = r.seating;
      if (r.food) bar.food = r.food;
      bar.verified = r.verified ? 1 : 0;
      if (r.verified && r.last_verified) bar.last_verified = r.last_verified;
      const hours = parseHours(r.hours);
      if (hours.length) bar.hours = hours;
      bar.hh = (hhByBar.get(r.id) || [])
        .sort((a, b) => a.dow_mask - b.dow_mask || a.start_min - b.start_min);
      if (r.notes) bar.notes = r.notes;
      return bar;
    });
}

function d1(sql, { local }) {
  const args = ['wrangler', 'd1', 'execute', '5pmmsp', local ? '--local' : '--remote',
    '--json', '--command', sql];
  const out = execFileSync('npx', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const parsed = JSON.parse(out);
  return parsed[0].results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const local = process.argv.includes('--local');
  const barRows = d1('SELECT * FROM bars', { local });
  const hhRows = d1('SELECT * FROM happy_hours ORDER BY bar_id', { local });
  const path = new URL('../seed/bars.json', import.meta.url);
  const { _readme } = JSON.parse(readFileSync(path));
  const bars = barsFromRows(barRows, hhRows);
  writeFileSync(path, JSON.stringify({ _readme, bars }, null, 2) + '\n');
  console.log(`wrote seed/bars.json from ${local ? 'local' : 'remote'} D1 — ${bars.length} bars, ${hhRows.length} windows`);
}
