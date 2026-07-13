// Build public/og.png (1200×630 social share image) from the Bottle Cap design.
// Dev-only: decompress brand woff2 → ttf (resvg-js 2.6 loads fonts by PATH),
// then rasterize an SVG. The Worker never imports this; run `node scripts/og.js`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { decompress } from 'wawoff2';

const rel = p => fileURLToPath(new URL(p, import.meta.url));
const fontDir = rel('.fonts');
mkdirSync(fontDir, { recursive: true });

// Read the font's internal family name from its `name` table (UTF-16BE for
// platform 3), so the SVG font-family matches exactly.
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
  const woff2 = readFileSync(rel(`../node_modules/${pkgPath}`));
  const ttf = Buffer.from(await decompress(woff2));
  const file = `${fontDir}/${outName}.ttf`;
  writeFileSync(file, ttf);
  return { file, family: familyOf(ttf) };
}

const display = await loadFont('@fontsource/big-shoulders-display/files/big-shoulders-display-latin-800-normal.woff2', 'display');
const body = await loadFont('@fontsource/archivo/files/archivo-latin-600-normal.woff2', 'body');
const mono = await loadFont('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2', 'mono');
console.log('families:', display.family, '/', body.family, '/', mono.family);

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const chips = ['Northeast', 'North Loop', 'Uptown', 'Grand Ave'];
let cx = 72;
const chipSvg = chips.map(label => {
  const w = label.length * 12 + 40;
  const rect = `<rect x="${cx}" y="486" width="${w}" height="46" rx="23" fill="#F4E9D8"/>` +
    `<text x="${cx + w / 2}" y="516" font-family="${mono.family}" font-size="21" fill="#26221C" text-anchor="middle">${esc(label)}</text>`;
  cx += w + 14;
  return rect;
}).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="bg" cx="26%" cy="18%" r="90%">
      <stop offset="0%" stop-color="#22375C"/><stop offset="52%" stop-color="#101B2D"/><stop offset="100%" stop-color="#0A1220"/>
    </radialGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="12" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>

  <g transform="translate(128,120)">
    <circle r="52" fill="#C8322B"/>
    <circle r="52" fill="none" stroke="#F4E9D8" stroke-width="6"/>
    <g transform="rotate(-45)">
      <rect x="-26" y="-22" width="52" height="44" fill="none" stroke="#F4E9D8" stroke-width="3"/>
      <text transform="rotate(45)" y="8" font-family="${display.family}" font-size="24" fill="#F4E9D8" text-anchor="middle">5PM</text>
    </g>
  </g>
  <text x="200" y="128" font-family="${mono.family}" font-size="21" letter-spacing="4" fill="#8FA0BC">MINNEAPOLIS · ST PAUL</text>

  <text x="70" y="360" font-family="${display.family}" font-size="150" fill="#FFB84D" filter="url(#glow)">5PM MSP</text>

  <text x="72" y="430" font-family="${body.family}" font-size="34" fill="#F4E9D8">Twin Cities happy hours, <tspan fill="#FFB84D">lit up nightly.</tspan></text>

  ${chipSvg}

  <text x="72" y="590" font-family="${display.family}" font-size="40" letter-spacing="2" fill="#F4E9D8">5pmmsp.com</text>
  <text x="1128" y="588" font-family="${mono.family}" font-size="18" fill="#8FA0BC" text-anchor="end">free · no ads · location-aware</text>
</svg>`;

const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  font: { fontFiles: [display.file, body.file, mono.file], loadSystemFonts: false, defaultFontFamily: display.family },
}).render().asPng();
writeFileSync(rel('../public/og.png'), png);
console.log(`wrote public/og.png — ${png.length} bytes`);
