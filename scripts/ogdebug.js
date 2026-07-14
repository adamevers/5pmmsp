import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { decompress } from 'wawoff2';

async function famName(path) {
  const woff2 = readFileSync(new URL(`../node_modules/${path}`, import.meta.url));
  const ttf = Buffer.from(await decompress(woff2));
  // find 'name' table
  const num = ttf.readUInt16BE(4);
  let off = 12, nameOff = 0;
  for (let i = 0; i < num; i++) {
    const tag = ttf.toString('ascii', off, off + 4);
    if (tag === 'name') nameOff = ttf.readUInt32BE(off + 8);
    off += 16;
  }
  const count = ttf.readUInt16BE(nameOff + 2);
  const strOff = nameOff + ttf.readUInt16BE(nameOff + 4);
  const names = {};
  for (let i = 0; i < count; i++) {
    const rec = nameOff + 6 + i * 12;
    const nameID = ttf.readUInt16BE(rec + 6);
    const len = ttf.readUInt16BE(rec + 8);
    const o = ttf.readUInt16BE(rec + 10);
    const platform = ttf.readUInt16BE(rec);
    if (nameID === 1 || nameID === 16) {
      const raw = Buffer.from(ttf.slice(strOff + o, strOff + o + len));
      names[nameID] = platform === 3 ? raw.swap16().toString('utf16le') : raw.toString('latin1');
    }
  }
  return { ttf, family: (names[16] || names[1] || '').replace(/\0/g, '') };
}

const paths = [
  '@fontsource/big-shoulders-display/files/big-shoulders-display-latin-800-normal.woff2',
  '@fontsource/archivo/files/archivo-latin-600-normal.woff2',
  '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2',
];
const fonts = [];
for (const p of paths) { const f = await famName(p); fonts.push(f); console.log(p.split('/')[1], '→ family:', JSON.stringify(f.family)); }

const fam = fonts[0].family;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="140"><rect width="500" height="140" fill="#101B2D"/><text x="20" y="90" font-family="${fam}" font-weight="800" font-size="64" fill="#FFB84D">HELLO 5PM</text></svg>`;
const png = new Resvg(svg, { font: { fontBuffers: fonts.map(f => f.ttf), loadSystemFonts: false, defaultFontFamily: fam } }).render().asPng();
writeFileSync(new URL('../scripts/_dbg.png', import.meta.url), png);
console.log('render bytes:', png.length);
