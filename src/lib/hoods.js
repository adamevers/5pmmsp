// Neighborhood intro copy.
//
// Two sources, in order:
//   1. HOOD_BLURBS — hand-written context for the neighborhoods we actually
//      know. One or two sentences, no hype, no invented local color.
//   2. statLine() — a sentence derived from that hood's own rows, so every
//      page (including the suburbs we can't write about honestly) still has
//      copy nobody else's page has.
//
// The point is that no two hood pages read the same. Forty identical
// template pages is what search engines discount.

import { CATEGORIES } from './data.js';
import { fmtTime } from './time.js';

export const HOOD_BLURBS = {
  // ── Minneapolis ──
  nordeast: 'Northeast Minneapolis wears its old Polish and Eastern European roots on the signage and packs in more breweries, taprooms and unreconstructed dive bars per block than anywhere else in the city.',
  'north-loop': 'The old warehouse district, now lofts and brick-and-timber storefronts. Happy hour here skews later and pricier than the rest of Minneapolis, with a heavy cocktail-bar tilt.',
  downtown: 'Office towers, the theater district and both stadiums. Downtown happy hours run early and end early, built around the after-work crowd and the pre-game rush.',
  uptown: 'The Hennepin and Lake corner and the blocks around it, close enough to the chain of lakes to walk. A dense mix of patios, late nights and long-running neighborhood bars.',
  'eat-street': 'The stretch of Nicollet Avenue known for its run of Vietnamese, Mexican, Greek and Ethiopian kitchens. Deals here tend to come with real food, not just bar snacks.',
  'west-bank': 'Cedar-Riverside, wedged between the university and the river. Cheap, loud, music-forward, and home to some of the least pretentious happy hours in the city.',
  dinkytown: 'The commercial strip on the University of Minnesota\'s east edge. Student prices, generous pours, and specials that lean hard into the school calendar.',
  'marcy-holmes': 'One of the oldest neighborhoods in Minneapolis, between the university and the river. A quieter, more mixed crowd than neighboring Dinkytown.',
  'loring-park': 'The park, the Walker, and the blocks connecting downtown to Uptown. A short walk from the theaters, which shapes when the deals run.',
  'linden-hills': 'A small, walkable commercial node near Lake Harriet, in southwest Minneapolis. Neighborhood-scale places rather than destination bars.',
  longfellow: 'South Minneapolis along Minnehaha Avenue, running down toward the falls. Patios, taprooms and a strong bike-commuter after-work crowd.',
  seward: 'A tight, co-op-anchored pocket of south Minneapolis near the river. Small rooms, regulars, and prices that have not caught up with the rest of the city.',
  kingfield: 'South Minneapolis around Nicollet and 38th. Mostly residential, with a run of small restaurants and bars that fill up right after work.',
  tangletown: 'The curving streets south of Minnehaha Creek in south Minneapolis. A handful of neighborhood spots rather than a bar district.',
  standish: 'A residential stretch of south Minneapolis east of Cedar. Few places, but the ones that are here are genuinely neighborhood bars.',

  // ── St Paul ──
  'cathedral-hill': 'The Victorian blocks below the Cathedral, centered on Selby Avenue. St Paul\'s most concentrated run of cocktail bars and older, wood-and-brass rooms.',
  'grand-avenue': 'The long commercial corridor through the middle of St Paul, near Macalester. Shopping-street pacing, which means happy hours that start early in the afternoon.',
  lowertown: 'St Paul\'s converted warehouse and arts district, next to CHS Field and the farmers market. Deals here move with the ballpark schedule.',
  'west-7th': 'The old working-class corridor running southwest from downtown St Paul, past the Xcel Energy Center. Game nights change everything about the timing here.',
  'mac-groveland': 'The St Paul neighborhood built around Macalester and St Thomas. College-adjacent pricing in an otherwise residential stretch.',
  'highland-park': 'Southwest St Paul, around the Ford Parkway commercial node. Suburban in feel, with a compact set of reliable after-work rooms.',
  'downtown-st-paul': 'Government offices, the Ordway and Landmark Center. A weekday happy hour district that empties out early compared to Minneapolis.',
  'west-side': 'Across the river from downtown St Paul, including District del Sol. The strongest concentration of Latino-owned bars and kitchens in the metro.',
  'payne-phalen': 'St Paul\'s East Side, centered on Payne Avenue. Old corner bars alongside a newer run of taprooms and kitchens.',
  frogtown: 'The dense, diverse blocks along University Avenue between the two downtowns. Unflashy prices and a lot of neighborhood loyalty.',
  'hamline-midway': 'The midpoint of University Avenue, near Hamline and Allianz Field. Match days fill every patio on the strip.',
};

/** "3 of them verified" style clause, or '' when nothing is verified. */
function verifiedClause(bars) {
  const n = bars.filter(b => b.verified).length;
  if (!n) return '';
  if (n === bars.length) return bars.length === 1 ? ', verified against the bar\'s own listing' : ', every one verified against the bar\'s own listing';
  return `, ${n} of them verified against the bar's own listing`;
}

/** The most common category in a set, as a human label, or ''. */
function dominantCategory(bars) {
  const counts = {};
  for (const b of bars) if (b.category) counts[b.category] = (counts[b.category] || 0) + 1;
  const top = Object.entries(counts).sort((a, z) => z[1] - a[1])[0];
  if (!top || top[1] < 2 || top[1] / bars.length < 0.4) return '';
  return (CATEGORIES[top[0]] || '').toLowerCase();
}

/**
 * A factual sentence or two built from this hood's rows. Everything asserted
 * here is read straight off the data, so it can't drift from the listings.
 */
export function statLine(bars) {
  if (!bars.length) return '';
  const n = bars.length;
  const parts = [];

  parts.push(`We track ${n} happy hour${n === 1 ? '' : 's'} here${verifiedClause(bars)}.`);

  const cat = dominantCategory(bars);
  if (cat) parts.push(`Most are ${cat}s.`);

  const patios = bars.filter(b => b.patio).length;
  const rooftops = bars.filter(b => b.rooftop).length;
  if (rooftops) parts.push(`${rooftops} ${rooftops === 1 ? 'has a rooftop' : 'have rooftops'}.`);
  else if (patios) parts.push(`${patios} ${patios === 1 ? 'has a patio' : 'have patios'}.`);

  // Earliest window start across the hood — the "how early can I go" answer.
  const windows = bars.flatMap(b => b.hh || []);
  if (windows.length) {
    const earliest = windows.reduce((a, w) => (w.start_min < a.start_min ? w : a));
    parts.push(`The earliest deal starts at ${fmtTime(earliest.start_min)}.`);
  }

  return parts.join(' ');
}

/** Full intro paragraph for a hood page: blurb (if we have one) + stats. */
export function hoodIntro(slug, bars) {
  return [HOOD_BLURBS[slug], statLine(bars)].filter(Boolean).join(' ');
}
