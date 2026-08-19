// Per-page OG share images → public/og/{bar,hood,city,day}/<slug>.png
//
// Build-time, not edge-time: the Worker is deliberately zero-npm-dep, and
// generating on request would mean Satori + resvg-wasm in the worker bundle.
// This reuses the same resvg-js pipeline as scripts/og.js.
//
//   node scripts/og-pages.js            → everything
//   node scripts/og-pages.js bars       → just bar cards
//
// Content is drawn from seed/bars.json, so RE-RUN THIS after a data session
// (see docs/ingest.md step 5) or a shared link will show a stale deal.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { decompress } from 'wawoff2';
import { CITIES, HOODS, hoodName, priceLabel } from '../src/lib/data.js';
import { fmtWindow, fmtDows } from '../src/lib/time.js';

const rel = p => fileURLToPath(new URL(p, import.meta.url));
const fontDir = rel('.fonts');
mkdirSync(fontDir, { recursive: true });

// ── fonts (same trick as og.js: resvg 2.6 loads by path, so woff2 → ttf) ──
function familyOf(ttf) {
  const num = ttf.readUInt16BE(4);
  let off = 12, nameOff = 0;
  for (let i = 0; i < num; i++) {
    if (ttf.toString('ascii', off, off + 4) === 'name') nameOff = ttf.readUInt32BE(off + 8);
    off += 16;
  }
  const count = ttf.readUInt16BE(nameOff + 2);
  const strOff = nameOff + ttf.readUInt16BE(nameOff + 4);
  const names = {};
  for (let i = 0; i < count; i++) {
    const rec = nameOff + 6 + i * 12;
    const id = ttf.readUInt16BE(rec + 6), len = ttf.readUInt16BE(rec + 8);
    const o = ttf.readUInt16BE(rec + 10), platform = ttf.readUInt16BE(rec);
    if (id === 1 || id === 16) {
      const raw = Buffer.from(ttf.slice(strOff + o, strOff + o + len));
      names[id] = platform === 3 ? raw.swap16().toString('utf16le') : raw.toString('latin1');
    }
  }
  return (names[1] || names[16] || '').replace(/\0/g, '');
}

async function loadFont(pkgPath, outName) {
  const ttf = Buffer.from(await decompress(readFileSync(rel(`../node_modules/${pkgPath}`))));
  const file = `${fontDir}/${outName}.ttf`;
  writeFileSync(file, ttf);
  return { file, family: familyOf(ttf) };
}

const display = await loadFont('@fontsource/big-shoulders-display/files/big-shoulders-display-latin-800-normal.woff2', 'display');
const body = await loadFont('@fontsource/archivo/files/archivo-latin-600-normal.woff2', 'body');
const mono = await loadFont('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2', 'mono');

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Rough advance-width ratios per family, enough to wrap and autosize without
// shaping the text for real. Big Shoulders is condensed, hence the low ratio.
const RATIO = { display: 0.40, body: 0.52, mono: 0.60 };

/** Greedy wrap to `maxWidth` px at `size`, capped at `maxLines` (last one ellipsized). */
function wrap(text, { font, size, maxWidth, maxLines = 2 }) {
  const per = size * RATIO[font];
  const max = Math.max(1, Math.floor(maxWidth / per));
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= max) { cur = next; continue; }
    if (cur) lines.push(cur);
    cur = w;
    if (lines.length === maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines) {
    const overflow = words.join(' ').length > lines.join(' ').length;
    if (overflow) lines[maxLines - 1] = lines[maxLines - 1].replace(/[.,;:]?$/, '') + '…';
  }
  return lines;
}

/** Shrink until the longest line fits on `maxLines`. */
function autosize(text, { font, maxWidth, maxLines, start, min }) {
  let size = start;
  while (size > min) {
    const lines = wrap(text, { font, size, maxWidth, maxLines });
    const longest = Math.max(...lines.map(l => l.length), 0);
    if (longest * size * RATIO[font] <= maxWidth && lines.length <= maxLines) break;
    size -= 4;
  }
  return { size, lines: wrap(text, { font, size, maxWidth, maxLines }) };
}

const tspans = (lines, { x, y, lh }) => lines
  .map((l, i) => `<tspan x="${x}" y="${y + i * lh}">${esc(l)}</tspan>`).join('');

// A full-bleed radial gradient triples the PNG weight (smooth ramps defeat
// PNG's row filters). Flat field + one small soft bloom keeps the look and
// takes ~200 KB down to ~50 KB per image across ~293 files.
const CHROME = `
  <defs>
    <radialGradient id="bloom" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#22375C" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#22375C" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow" x="-25%" y="-25%" width="150%" height="150%">
      <feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="#101B2D"/>
  <rect x="0" y="0" width="1200" height="150" fill="#16223A"/>
  <g transform="translate(96,84)">
    <circle r="34" fill="#C8322B"/><circle r="34" fill="none" stroke="#F4E9D8" stroke-width="4"/>
    <text y="7" font-family="${display.family}" font-size="20" fill="#F4E9D8" text-anchor="middle">5PM</text>
  </g>
  <text x="146" y="78" font-family="${display.family}" font-size="42" fill="#FFB84D" filter="url(#glow)">5PM MSP</text>
  <text x="146" y="104" font-family="${mono.family}" font-size="16" letter-spacing="3" fill="#8FA0BC">MINNEAPOLIS · ST PAUL</text>
  <line x1="0" y1="150" x2="1200" y2="150" stroke="#2E3F60" stroke-width="2"/>
  <text x="96" y="586" font-family="${display.family}" font-size="34" letter-spacing="2" fill="#F4E9D8">5pmmsp.com</text>`;

/** Pill with auto width. Returns {svg, width}. */
function pill(label, x, y, { fill = '#FFB84D', text = '#101B2D', size = 22 } = {}) {
  const w = Math.ceil(label.length * size * RATIO.mono) + 34;
  return {
    width: w,
    svg: `<rect x="${x}" y="${y}" width="${w}" height="${size + 18}" rx="${(size + 18) / 2}" fill="${fill}"/>` +
      `<text x="${x + w / 2}" y="${y + size + 4}" font-family="${mono.family}" font-size="${size}" fill="${text}" text-anchor="middle">${esc(label)}</text>`,
  };
}

function render(svg, out) {
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    font: { fontFiles: [display.file, body.file, mono.file], loadSystemFonts: false, defaultFontFamily: display.family },
  }).render().asPng();
  writeFileSync(out, png);
  return png.length;
}

/** The ◆ verified mark — drawn, because IBM Plex Mono has no glyph for it. */
const diamond = (cx, cy, r, fill) =>
  `<path d="M${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}L${cx - r} ${cy}Z" fill="${fill}"/>`;

// ── bar card ───────────────────────────────────────────────────────────────
function barSvg(bar) {
  const name = autosize(bar.name, { font: 'display', maxWidth: 1008, maxLines: 2, start: 96, min: 48 });
  // In the suburbs the hood and the city are the same slug, so don't print
  // "ROSEMOUNT · ROSEMOUNT".
  const hood = hoodName(bar.neighborhood), city = CITIES[bar.city] || bar.city;
  const place = hood === city ? city : `${hood} · ${city}`;

  // Vertical rhythm as a cursor, so a two-line name pushes everything below it
  // down instead of overlapping the eyebrow or colliding with the footer.
  // Big Shoulders 800 has a tall ascender: the cap top sits ~0.75em above the
  // baseline, so the name needs a full 100px below the eyebrow to clear it.
  const lh = name.size * 0.90;
  const eyebrowY = 190;
  const nameY = eyebrowY + 100;
  const pillY = nameY + (name.lines.length - 1) * lh + 46;
  const dealY = pillY + 86;

  let x = 96;
  const pills = [];
  for (const w of (bar.hh || []).slice(0, 2)) {
    const p = pill(`${fmtDows(w.dow_mask)} ${fmtWindow(w)}`, x, pillY);
    if (x + p.width > 1104) break;
    pills.push(p.svg); x += p.width + 12;
  }
  if (bar.verified && x < 940) {
    const w = 150;
    pills.push(`<rect x="${x}" y="${pillY}" width="${w}" height="40" rx="20" fill="none" stroke="#3F8A64" stroke-width="2"/>` +
      diamond(x + 26, pillY + 20, 8, '#3F8A64') +
      `<text x="${x + 88}" y="${pillY + 27}" font-family="${mono.family}" font-size="19" fill="#3F8A64" text-anchor="middle">VERIFIED</text>`);
  }

  // A two-line name already ate the vertical budget; give the deal one line so
  // it can't run into the footer.
  const deal = (bar.hh || []).find(h => h.deals)?.deals;
  const dealLines = deal
    ? wrap(deal, { font: 'body', size: 34, maxWidth: 1008, maxLines: name.lines.length > 1 ? 1 : 2 })
    : [];
  const price = priceLabel(bar.price);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  ${CHROME}
  <text x="96" y="${eyebrowY}" font-family="${mono.family}" font-size="22" letter-spacing="2" fill="#8FA0BC">${esc(place.toUpperCase())}</text>
  <text font-family="${display.family}" font-size="${name.size}" fill="#F4E9D8">${tspans(name.lines, { x: 96, y: nameY, lh })}</text>
  ${pills.join('')}
  ${dealLines.length ? `<text font-family="${body.family}" font-size="34" fill="#FFB84D">${tspans(dealLines, { x: 96, y: dealY, lh: 44 })}</text>` : ''}
  ${bar.address && dealY + dealLines.length * 44 + 22 < 530
    ? `<text x="96" y="${dealY + dealLines.length * 44 + 22}" font-family="${mono.family}" font-size="21" fill="#8FA0BC">${esc(bar.address)}</text>`
    : ''}
  ${price ? `<text x="1104" y="586" font-family="${mono.family}" font-size="30" fill="#FFB84D" text-anchor="end">${esc(price)}<tspan fill="#3A4A66">${'$'.repeat(4 - price.length)}</tspan></text>` : ''}
</svg>`;
}

// ── list card (hood / city / day) ──────────────────────────────────────────
function listSvg({ eyebrow, title, count, names }) {
  const t = autosize(title, { font: 'display', maxWidth: 1008, maxLines: 2, start: 116, min: 56 });
  const eyebrowY = 190;
  const titleY = eyebrowY + 105;          // clears the display face's ascender
  const lh = t.size * 0.90;
  const listY = titleY + (t.lines.length - 1) * lh + 62;
  // A two-line title leaves room for one row of chips, not two.
  const lastRow = listY + (t.lines.length > 1 ? 0 : 52);
  let x = 96, y = listY;
  const chips = [];
  for (const n of names) {
    const label = n.length > 26 ? n.slice(0, 25) + '…' : n;
    const p = pill(label, x, y, { fill: 'none', text: '#F4E9D8', size: 21 });
    if (x + p.width > 1104) { x = 96; y += 52; }
    if (y > lastRow) break;
    chips.push(`<rect x="${x}" y="${y}" width="${p.width}" height="39" rx="19.5" fill="none" stroke="#2E3F60" stroke-width="2"/>` +
      `<text x="${x + p.width / 2}" y="${y + 27}" font-family="${mono.family}" font-size="21" fill="#F4E9D8" text-anchor="middle">${esc(label)}</text>`);
    x += p.width + 12;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  ${CHROME}
  <text x="96" y="${eyebrowY}" font-family="${mono.family}" font-size="22" letter-spacing="2" fill="#8FA0BC">${esc(eyebrow.toUpperCase())}</text>
  <text font-family="${display.family}" font-size="${t.size}" fill="#FFB84D" filter="url(#glow)">${tspans(t.lines, { x: 96, y: titleY, lh })}</text>
  ${chips.join('')}
  <text x="1104" y="586" font-family="${mono.family}" font-size="26" fill="#8FA0BC" text-anchor="end">${count} bars</text>
</svg>`;
}

// ── drive ──────────────────────────────────────────────────────────────────
const { bars } = JSON.parse(readFileSync(rel('../seed/bars.json'), 'utf8'));
const only = process.argv[2];
const want = kind => !only || only === kind;
let n = 0, bytes = 0;

const dir = p => { mkdirSync(rel(`../public/og/${p}`), { recursive: true }); };

if (want('bars')) {
  dir('bar');
  for (const b of bars) { bytes += render(barSvg(b), rel(`../public/og/bar/${b.slug}.png`)); n++; }
  console.log(`bars: ${bars.length}`);
}

if (want('hoods')) {
  dir('hood');
  const byHood = new Map();
  for (const b of bars) {
    if (!byHood.has(b.neighborhood)) byHood.set(b.neighborhood, []);
    byHood.get(b.neighborhood).push(b);
  }
  for (const [slug, list] of byHood) {
    if (!HOODS[slug]) continue;
    bytes += render(listSvg({
      eyebrow: CITIES[list[0].city] || list[0].city,
      title: `${hoodName(slug)} happy hours`,
      count: list.length,
      names: list.map(b => b.name),
    }), rel(`../public/og/hood/${slug}.png`));
    n++;
  }
  console.log(`hoods: ${byHood.size}`);
}

if (want('cities')) {
  dir('city');
  const byCity = new Map();
  for (const b of bars) {
    if (!byCity.has(b.city)) byCity.set(b.city, []);
    byCity.get(b.city).push(b);
  }
  for (const [slug, list] of byCity) {
    if (!CITIES[slug]) continue;
    bytes += render(listSvg({
      eyebrow: 'Twin Cities',
      title: `${CITIES[slug]} happy hours`,
      count: list.length,
      names: list.map(b => b.name),
    }), rel(`../public/og/city/${slug}.png`));
    n++;
  }
  console.log(`cities: ${byCity.size}`);
}

if (want('days')) {
  dir('day');
  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  DAYS.forEach((slug, dow) => {
    const list = bars.filter(b => (b.hh || []).some(h => (h.dow_mask & (1 << dow)) !== 0));
    if (!list.length) return;
    bytes += render(listSvg({
      eyebrow: 'Minneapolis · St Paul',
      title: `${slug[0].toUpperCase()}${slug.slice(1)} happy hours`,
      count: list.length,
      names: list.map(b => b.name),
    }), rel(`../public/og/day/${slug}.png`));
    n++;
  });
  const late = bars.filter(b => (b.hh || []).some(h => h.start_min >= 1260 || h.end_min <= h.start_min));
  if (late.length) {
    bytes += render(listSvg({
      eyebrow: 'Minneapolis · St Paul',
      title: 'Late night happy hours',
      count: late.length,
      names: late.map(b => b.name),
    }), rel('../public/og/day/late-night.png'));
    n++;
  }
  console.log('days: 8');
}

console.log(`wrote ${n} images — ${(bytes / 1e6).toFixed(1)} MB total, ${Math.round(bytes / n / 1024)} KB avg`);
