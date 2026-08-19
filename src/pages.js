// SSR pages: home, neighborhood, city, bar detail, submit, map, 404.
import { layout, barCard, esc, cityName, icon, trustChip, attrChips, favBtn, withUtm, priceMarks, barFlags, fmtDate } from './lib/html.js';
import { allBarsWithHH, barBySlug, hoodCounts, hoodName, CITIES, HOODS } from './lib/data.js';
import { nowInChicago, isActive, nextStart, fmtWindow, fmtDows, fmtTime, hasDow } from './lib/time.js';
import { barJsonLd, listJsonLd, breadcrumbJsonLd } from './lib/schema.js';
import { hoodIntro, statLine } from './lib/hoods.js';

const html = body => new Response(body, {
  headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=120' },
});

const hoodChips = hoods => `<div class="hoods">${hoods.map(h =>
  `<a class="hood" href="/${esc(h.slug)}">${esc(h.name)} <small>${h.count}</small></a>`).join('')}</div>`;

const clock = now => {
  const h = Math.floor(now.minutes / 60) % 12 || 12;
  const m = String(now.minutes % 60).padStart(2, '0');
  return `${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][now.dow]} ${h}:${m} ${now.minutes < 720 ? 'AM' : 'PM'}`;
};

// Status rail (single-select: when?) + HH-time picker + pill shelf (multi: what kind?)
const TIME_OPTS = [660, 720, 780, 840, 900, 960, 1020, 1080, 1140, 1200, 1260, 1320, 1380, 0]
  .map(m => {
    const h24 = Math.floor(m / 60) % 24, h = h24 % 12 || 12, ap = h24 < 12 ? 'AM' : 'PM';
    return `<option value="${m}"${m === 1020 ? ' selected' : ''}>${h}:00 ${ap}</option>`;
  }).join('');
const DAY_OPTS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  .map((d, i) => `<option value="${i}">${d}</option>`).join('');
const FILTERS = `<div class="status-rail" data-status-rail>
  <button aria-pressed="true" data-st="all">All hours</button>
  <button aria-pressed="false" data-st="open">Open now</button>
  <button aria-pressed="false" data-st="hh">HH now</button>
  <button aria-pressed="false" data-st="time" aria-expanded="false">HH time <span class="st-arrow">▾</span></button>
</div>
<div class="timerow" data-timerow hidden>
  <label for="hh-day">Day:</label><select id="hh-day" data-hh-day>${DAY_OPTS}</select>
  <label for="hh-time">Time:</label><select id="hh-time" data-hh-time>${TIME_OPTS}</select>
</div>
<button class="filters-btn" data-filters-toggle aria-expanded="false">Filters <span class="fb-arrow">▾</span></button>
<div class="filters" data-filters hidden>
  <span class="fgroup">
    <button aria-pressed="false" data-f="price" data-v="1">$</button>
    <button aria-pressed="false" data-f="price" data-v="2">$$</button>
    <button aria-pressed="false" data-f="price" data-v="3">$$$</button>
    <button aria-pressed="false" data-f="price" data-v="4">$$$$</button>
  </span>
  <span class="fgroup">
    <button aria-pressed="false" data-f="category" data-v="cocktail-bar">Cocktail</button>
    <button aria-pressed="false" data-f="category" data-v="bar-restaurant">Bar &amp; Rest.</button>
    <button aria-pressed="false" data-f="category" data-v="dive-bar">Dive</button>
    <button aria-pressed="false" data-f="category" data-v="lounge">Lounge</button>
  </span>
  <span class="fgroup">
    <button aria-pressed="false" data-f="patio">☀ Patio</button>
    <button aria-pressed="false" data-f="rooftop">Rooftop</button>
    <button aria-pressed="false" data-f="verified">◆ Verified</button>
    <button aria-pressed="false" data-f="saved">♥ Saved</button>
  </span>
</div>`;

export async function home({ env, url }) {
  const subscribed = url.searchParams.get('subscribed');
  const now = nowInChicago();
  const bars = await allBarsWithHH(env.DB);

  // Show ALL bars — happy-hour-active first, then soonest upcoming, then the rest.
  const ranked = bars
    .map(b => ({ b, active: b.hh.some(h => isActive(h, now)), n: nextStart(b.hh, now) }))
    .sort((a, z) =>
      (Number(z.active) - Number(a.active)) ||
      ((a.n ? a.n.inMinutes : Infinity) - (z.n ? z.n.inMinutes : Infinity)) ||
      a.b.name.localeCompare(z.b.name));
  const rail = ranked.length
    ? ranked.map(x => barCard(x.b, now)).join('')
    : '<div class="empty">No bars on file yet.</div>';

  return html(layout({
    title: '5PM MSP — Twin Cities happy hour finder',
    desc: `Happy hours across Minneapolis + St Paul — ${bars.length} bars, filterable by neighborhood, time, and what's pouring right now.`,
    path: '/',
    wide: true,
    body: `
${subscribed ? '<div class="ok-note">You\'re on the list. New deals + new bars, occasionally — never spam.</div>' : ''}
<div class="actions">
  <button class="btn primary" data-nearme hidden>◉ Near me</button>
  <a class="btn primary" data-nearme-fallback href="/neighborhoods">Browse neighborhoods</a>
</div>
<p class="hint">location stays on your phone — we never see it</p>
<div class="countline"><b data-count>${bars.length} bars</b><i></i><span data-clock>${clock(now)}</span></div>
${FILTERS}
<div data-cards>${rail}</div>
<p class="hint" style="margin-top:20px"><a href="/neighborhoods" style="color:var(--filament)">Browse all neighborhoods →</a></p>
<button class="dice-fab" data-roulette aria-label="Bar roulette — jump to a random open bar" title="Bar roulette">🎲</button>`,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'WebSite', name: '5PM MSP',
      url: 'https://5pmmsp.com', description: 'Twin Cities happy hour finder',
    },
  }));
}

export async function hoodPage({ env, params }) {
  if (!HOODS[params.hood]) return null;
  const now = nowInChicago();
  const bars = (await allBarsWithHH(env.DB)).filter(b => b.neighborhood === params.hood);
  if (!bars.length) return null;
  const name = hoodName(params.hood);
  const city = cityName(bars[0].city);
  const intro = hoodIntro(params.hood, bars);
  return html(layout({
    title: `${name} happy hours — ${city} — 5PM MSP`,
    desc: `Every happy hour we track in ${name}, ${city} — ${bars.length} bars with times, deals, and what's running right now.`,
    path: `/${params.hood}`,
    ogImage: `/og/hood/${params.hood}.png`,
    wide: true,
    body: `
<p class="crumb"><a href="/">home</a> / ${CITIES[bars[0].city] ? `<a href="/${esc(bars[0].city)}">${esc(city)}</a>` : esc(city)}</p>
<div class="hoodline"><h2>${esc(name)}</h2><em data-count>${bars.length} bars</em><time data-clock>${clock(now)}</time></div>
${intro ? `<p class="intro">${esc(intro)}</p>` : ''}
${FILTERS}
<div data-cards>${bars.map(b => barCard(b, now, { showHood: false })).join('')}</div>
${dayLinks()}
<p class="hint">missing a bar? <a href="/submit" style="color:var(--filament)">add it</a></p>`,
    jsonld: [
      listJsonLd({
        name: `${name} happy hours`,
        description: intro,
        path: `/${params.hood}`,
        bars,
      }),
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        ...(CITIES[bars[0].city] ? [{ name: city, path: `/${bars[0].city}` }] : []),
        { name, path: `/${params.hood}` },
      ]),
    ],
  }));
}

export async function cityPage({ env, params }) {
  const city = params.city;
  if (!CITIES[city]) return null;
  const now = nowInChicago();
  const bars = (await allBarsWithHH(env.DB)).filter(b => b.city === city);
  const hoods = (await hoodCounts(env.DB)).filter(h => h.city === city);
  if (!bars.length) return null;
  const label = cityName(city);
  const intro = [
    `Happy hours across ${label}, spread over ${hoods.length} neighborhood${hoods.length === 1 ? '' : 's'}.`,
    statLine(bars),
  ].filter(Boolean).join(' ');
  return html(layout({
    title: `${label} happy hours — 5PM MSP`,
    desc: `Happy hours across ${label} — ${bars.length} bars by neighborhood, time, and deal, with live status on every listing.`,
    path: `/${city}`,
    ogImage: `/og/city/${city}.png`,
    wide: true,
    body: `
<p class="crumb"><a href="/">home</a></p>
<div class="hoodline"><h2>${esc(label)}</h2><em data-count>${bars.length} bars</em><time data-clock>${clock(now)}</time></div>
<p class="intro">${esc(intro)}</p>
${hoodChips(hoods)}
${FILTERS}
<div data-cards>${bars.map(b => barCard(b, now)).join('')}</div>
${dayLinks()}`,
    jsonld: [
      listJsonLd({ name: `${label} happy hours`, description: intro, path: `/${city}`, bars }),
      breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: label, path: `/${city}` }]),
    ],
  }));
}

// ── Day + late-night landing pages ─────────────────────────────────────────
// "friday happy hour minneapolis" is a real, high-intent query. A site with
// no page for it cannot rank for it, however good the meta tags are.
const DAYS = [
  { slug: 'monday', name: 'Monday', dow: 0 },
  { slug: 'tuesday', name: 'Tuesday', dow: 1 },
  { slug: 'wednesday', name: 'Wednesday', dow: 2 },
  { slug: 'thursday', name: 'Thursday', dow: 3 },
  { slug: 'friday', name: 'Friday', dow: 4 },
  { slug: 'saturday', name: 'Saturday', dow: 5 },
  { slug: 'sunday', name: 'Sunday', dow: 6 },
];
export const DAY_SLUGS = [...DAYS.map(d => d.slug), 'late-night'];

/** Internal link row. Crawlable path into every day page from every list page. */
const dayLinks = () => `<nav class="daylinks" aria-label="Happy hours by day">
<span class="dl-k">By day</span>${DAYS.map(d =>
  `<a href="/${d.slug}">${d.name}</a>`).join('')}<a href="/late-night">Late night</a>
</nav>`;

/** Shared renderer for the day + late-night pages. */
function listingPage({ title, desc, path, heading, intro, bars, now }) {
  return html(layout({
    title, desc, path, ogImage: `/og/day${path}.png`, wide: true,
    body: `
<p class="crumb"><a href="/">home</a></p>
<div class="hoodline"><h2>${esc(heading)}</h2><em data-count>${bars.length} bars</em><time data-clock>${clock(now)}</time></div>
<p class="intro">${esc(intro)}</p>
${FILTERS}
<div data-cards>${bars.map(b => barCard(b, now)).join('')}</div>
${dayLinks()}
<p class="hint">missing a bar? <a href="/submit" style="color:var(--filament)">add it</a></p>`,
    jsonld: [
      listJsonLd({ name: heading, description: intro, path, bars }),
      breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: heading, path }]),
    ],
  }));
}

export async function dayPage({ env, params }) {
  const day = DAYS.find(d => d.slug === params.day);
  if (!day) return null;
  const now = nowInChicago();
  // A window belongs to the day it STARTS on, which is what "Friday happy
  // hour" means to a person even when the window runs past midnight.
  const matched = (await allBarsWithHH(env.DB))
    .map(b => ({ b, ws: (b.hh || []).filter(h => hasDow(h.dow_mask, day.dow)) }))
    .filter(x => x.ws.length)
    .sort((a, z) =>
      Math.min(...a.ws.map(w => w.start_min)) - Math.min(...z.ws.map(w => w.start_min)) ||
      a.b.name.localeCompare(z.b.name));
  if (!matched.length) return null;

  const bars = matched.map(x => x.b);
  const earliest = Math.min(...matched.flatMap(x => x.ws.map(w => w.start_min)));
  const verified = bars.filter(b => b.verified).length;
  const heading = `${day.name} happy hours`;
  return listingPage({
    title: `${day.name} happy hours in Minneapolis and St Paul — 5PM MSP`,
    desc: `${bars.length} Twin Cities bars with a ${day.name} happy hour, earliest first. Real windows, real deals, ${verified} verified.`,
    path: `/${day.slug}`,
    heading,
    intro: `${bars.length} bars across Minneapolis and St Paul run a happy hour on ${day.name}, listed earliest first. The first one starts at ${fmtTime(earliest)}, and ${verified} of these listings are verified against the bar's own site.`,
    bars,
    now,
  });
}

const LATE_START = 1260; // 9 PM

export async function lateNightPage({ env }) {
  const now = nowInChicago();
  const matched = (await allBarsWithHH(env.DB))
    .map(b => ({
      b,
      // Starts at 9 PM or later, or runs past midnight (end <= start).
      ws: (b.hh || []).filter(h => h.start_min >= LATE_START || h.end_min <= h.start_min),
    }))
    .filter(x => x.ws.length)
    .sort((a, z) =>
      Math.max(...z.ws.map(w => w.start_min)) - Math.max(...a.ws.map(w => w.start_min)) ||
      a.b.name.localeCompare(z.b.name));
  if (!matched.length) return null;

  const bars = matched.map(x => x.b);
  const latest = Math.max(...matched.flatMap(x => x.ws.map(w => w.start_min)));
  return listingPage({
    title: 'Late night happy hours in Minneapolis and St Paul — 5PM MSP',
    desc: `${bars.length} Twin Cities bars with a late happy hour, latest first. Deals that start at 9 PM or later, or run past midnight.`,
    path: '/late-night',
    heading: 'Late night happy hours',
    intro: `${bars.length} bars in Minneapolis and St Paul run a happy hour that starts at 9 PM or later, or keeps going past midnight. Listed latest first, so the top of this page is the last call worth crossing town for. The latest one starts at ${fmtTime(latest)}.`,
    bars,
    now,
  });
}

export async function neighborhoodsPage({ env }) {
  const hoods = await hoodCounts(env.DB);
  const groups = [
    { name: 'Minneapolis', hoods: [], link: '/minneapolis' },
    { name: 'St Paul', hoods: [], link: '/st-paul' },
    { name: 'Around the metro', hoods: [] },
  ];
  for (const h of hoods) {
    if (h.city === 'minneapolis') groups[0].hoods.push(h);
    else if (h.city === 'st-paul') groups[1].hoods.push(h);
    else groups[2].hoods.push(h);
  }
  const total = hoods.reduce((n, h) => n + h.count, 0);
  return html(layout({
    title: 'Browse neighborhoods — 5PM MSP',
    desc: `Every neighborhood we track across the Twin Cities — ${total} bars with happy hours.`,
    path: '/neighborhoods',
    body: `
<p class="crumb"><a href="/">home</a></p>
<div class="rail-label"><h2>Browse neighborhoods</h2><small>${total} bars</small></div>
${groups.filter(g => g.hoods.length).map(g => `
<div class="rail-label"><h2 style="font-size:19px">${g.link ? `<a href="${g.link}" style="text-decoration:none">${esc(g.name)}</a>` : esc(g.name)}</h2>
<small>${g.hoods.reduce((n, h) => n + h.count, 0)} bars</small></div>
${hoodChips(g.hoods)}`).join('')}`,
  }));
}

export function privacyPage() {
  return html(layout({
    title: 'Privacy — 5PM MSP',
    desc: 'What we know about you (almost nothing) and why.',
    path: '/privacy',
    includeAppJs: false,
    body: `
<p class="crumb"><a href="/">home</a></p>
<div class="rail-label"><h2>Privacy</h2></div>
<div class="prose">
<p>The short version: <b>we don't want your data.</b> This site helps you find a
happy hour, then gets out of the way.</p>

<h3>Your location never leaves your phone</h3>
<p>When you tap "Near me," your browser asks you for permission and does the
distance math <i>on your device</i>. Your location is never sent to us, stored,
or shared. We literally cannot see it. If that ever changed, this page would
say so in big letters.</p>

<h3>No accounts, no cookies that track you</h3>
<p>There's nothing to sign up for. Your saved bars (the hearts) live in your
browser's own storage, on your device, where we can't read them. Close the tab
and they're still yours; clear your browser data and they're gone.</p>

<h3>Analytics without surveillance</h3>
<p>We use <a href="https://www.simpleanalytics.com" rel="noopener">Simple
Analytics</a>, which counts visits without cookies, fingerprinting, or personal
data. We can see "some people looked at Nordeast bars on a Tuesday," never
"this specific person did."</p>

<h3>What we do keep</h3>
<p>If you submit a bar, report a wrong deal, or join the newsletter, we keep
what you typed (and your email, for the newsletter; unsubscribing is one
click). Forms are protected by Cloudflare Turnstile, which checks you're
human. That's the whole list.</p>

<h3>Who we'd share data with</h3>
<p>Nobody. There are no ads, no sponsors, no data sales. The site runs on
Cloudflare, so requests pass through their infrastructure like any website.</p>

<h3>Questions?</h3>
<p>Spot something that doesn't match what's written here? <a href="/submit">Tell
us</a>. We'd genuinely want to know.</p>
</div>`,
  }));
}

export async function barPage({ env, params, url, ctx }) {
  const bar = await barBySlug(env.DB, params.slug);
  if (!bar) return null;
  const now = nowInChicago();
  const ok = url.searchParams.get('ok');

  // Arrived from a shared link? Count it, off the response path. Bad/oversized
  // tokens are ignored rather than stored — this is untrusted query input.
  const inbound = (url.searchParams.get('s') || '').slice(0, 12);
  if (/^[a-z0-9]{4,12}$/.test(inbound)) {
    const log = env.DB.prepare('INSERT INTO share_hits (share_id, slug) VALUES (?, ?)')
      .bind(inbound, bar.slug).run().catch(() => {});
    if (ctx?.waitUntil) ctx.waitUntil(log);
  }

  // ── Happy Hr row: a pill per window (+ ⓘ last-verified), deals shown below ──
  const lv = esc(fmtDate(bar.last_verified));
  const infoBtn = bar.verified && bar.last_verified
    ? `<button class="info" data-info="Last verified ${lv}" aria-label="Last verified ${lv}" title="Last verified ${lv}">${icon('info')}</button>`
    : '';
  const hhItems = bar.hh.length
    ? bar.hh.map(h => `<span class="hh-pill${isActive(h, now) ? ' on' : ''}">${fmtDows(h.dow_mask)}: ${fmtWindow(h)}</span>`).join('')
    : '<span class="hh-none">Not on file yet — report it below.</span>';

  // ── Hours row (venue open/closed): only when regular hours are on file ──
  const hasHours = bar.hours && bar.hours.length;
  const openNow = hasHours && bar.hours.some(h => isActive(h, now));
  const hoursSection = hasHours ? `
  <div class="hrow hrow--div">
    <span class="hrow-k">Hours</span>
    <button class="hrow-toggle" data-hh-toggle aria-expanded="false" aria-controls="reg-hours">
      <span class="${openNow ? 'is-open' : 'is-closed'}">${openNow ? 'Open' : 'Closed'}</span>
      <span class="hh-arrow" aria-hidden="true">▲</span>
    </button>
  </div>
  <div class="reg-hours" id="reg-hours" hidden>${bar.hours.map(h =>
    `<div class="hh-srow"><span class="hh-days">${fmtDows(h.dow_mask)}</span><span class="hh-time">${fmtWindow(h)}</span></div>`).join('')}</div>` : '';

  const foodRow = bar.food ? `<div class="hrow hrow--div"><span class="hrow-k">Food</span><div class="hrow-v hrow-plain">${esc(bar.food)}</div></div>` : '';
  const seatingRow = bar.seating ? `<div class="hrow hrow--div"><span class="hrow-k">Seating</span><div class="hrow-v hrow-plain">${esc(bar.seating)}</div></div>` : '';

  const hoursPanel = `<div class="hours-panel">
  <div class="hrow">
    <span class="hrow-k">Happy Hr</span>
    <div class="hrow-v">${hhItems}${infoBtn}</div>
  </div>${hoursSection}${foodRow}${seatingRow}
</div>`;

  // The actual deals as quote lines under the panel.
  const dealQuotes = bar.hh.filter(h => h.deals)
    .map(h => `<p class="deal-quote">“${esc(h.deals)}”</p>`).join('');
  const dealLine = (bar.hh.find(h => h.deals) || {}).deals;
  // Share text only: swap unambiguous food/drink words for emojis — texts read
  // tighter and iMessage previews cut off later. The page keeps the real words.
  const EMOJIFY = [
    [/\bbeers?\b/gi, '🍺'], [/\bwines?\b/gi, '🍷'], [/\bcocktails?\b/gi, '🍸'],
    [/\bmargaritas?\b/gi, '🍹'], [/\bsliders?\b/gi, '🍔'], [/\bburgers?\b/gi, '🍔'],
    [/\bpizzas?\b/gi, '🍕'], [/\bwings\b/gi, '🍗'], [/\btacos?\b/gi, '🌮'],
    [/\bfries\b/gi, '🍟'], [/\boysters?\b/gi, '🦪'], [/\bchampagne\b/gi, '🍾'],
    [/\bsushi\b/gi, '🍣'],
  ];
  const emojify = s => EMOJIFY.reduce((t, [re, em]) => t.replace(re, em), s);
  const fullAddr = bar.address
    ? `${bar.address}, ${cityName(bar.city)}, ${bar.state || 'MN'}${bar.zip ? ' ' + bar.zip : ''}`
    : '';
  // A fresh token per render, so one copied link ≈ one share to count opens on.
  // Math.random is fine here: this is an analytics tag, not a secret.
  const shareId = Math.random().toString(36).slice(2, 8);
  const shareUrl = `https://5pmmsp.com/bar/${bar.slug}`
    + `?utm_source=share&utm_medium=text&utm_campaign=bar_share&s=${shareId}`;
  const shareText = [
    `Happy hour at ${bar.name} (${hoodName(bar.neighborhood)})`,
    ...bar.hh.map(h => `${fmtDows(h.dow_mask)}: ${fmtWindow(h)}`),
    dealLine && `“${emojify(dealLine)}”`,
    fullAddr,
  ].filter(Boolean).join('\n') + `\n\n${shareUrl}`;
  const dirQ = encodeURIComponent(fullAddr
    ? `${bar.name}, ${fullAddr}`
    : `${bar.name}, ${cityName(bar.city)} ${bar.state || 'MN'}`);
  // Meta description: lead with the actual window + deal, which is what the
  // search result is being clicked for. Trimmed to a sane SERP length.
  const windowSummary = bar.hh.length
    ? `${fmtDows(bar.hh[0].dow_mask)} ${fmtWindow(bar.hh[0])}`
    : '';
  const metaDesc = [
    `${bar.name} happy hour in ${hoodName(bar.neighborhood)}, ${cityName(bar.city)}.`,
    windowSummary && `${windowSummary}.`,
    dealLine,
  ].filter(Boolean).join(' ').slice(0, 200);

  return html(layout({
    title: `${bar.name} happy hour — ${hoodName(bar.neighborhood)}, ${cityName(bar.city)} — 5PM MSP`,
    desc: metaDesc,
    path: `/bar/${bar.slug}`,
    ogImage: `/og/bar/${bar.slug}.png`,
    // Closed venues keep a resolving page so existing links don't 404, but
    // they're dropped from every listing and told not to stay in the index.
    noindex: !!bar.closed,
    body: `
<p class="crumb"><a href="/">home</a> / <a href="/${esc(bar.neighborhood)}">${esc(hoodName(bar.neighborhood))}</a></p>
<div class="bar-head"><h2>${esc(bar.name)}</h2><div class="bar-actions">${favBtn(bar)}</div></div>
${bar.closed ? `<div class="closed-note"><b>Permanently closed.</b> ${esc(bar.closed_note || '')} This page stays up so old links still work, but the bar is off our lists.</div>` : ''}
<div class="pills">${trustChip(bar)}${attrChips(bar)}${barFlags(bar)}</div>
${priceMarks(bar.price)}
<p class="loc">${esc(hoodName(bar.neighborhood))} · ${esc(cityName(bar.city))}</p>
${hoursPanel}
${dealQuotes}
<div class="bar-links">
  ${bar.website ? `<a href="${esc(withUtm(bar.website))}" target="_blank" rel="noopener noreferrer" aria-label="Website">${icon('globe')}<span class="blbl">Website</span></a>` : ''}
  ${bar.phone ? `<a href="tel:${esc(bar.phone)}" aria-label="Call ${esc(bar.name)}">${icon('phone')}<span class="blbl">Call</span></a>` : ''}
  <a class="dir" data-lat="${bar.lat}" data-lng="${bar.lng}" data-q="${dirQ}" href="https://www.google.com/maps/search/?api=1&query=${dirQ}" target="_blank" rel="noopener noreferrer" aria-label="Directions">${icon('pin')}<span class="blbl">Directions</span></a>
  <button type="button" data-open-share aria-label="Share">${icon('share')}<span class="blbl">Share</span></button>
  <button type="button" class="icon-only" data-open-report aria-label="Report a change" title="Report a change">${icon('flag')}</button>
</div>
${bar.notes ? `<p class="hint" style="text-align:left">${esc(bar.notes)}</p>` : ''}
${ok === 'report' ? '<div class="ok-note">Got it — thanks. We review every report before changing a listing.</div>' : ''}
<dialog id="share-dialog" class="modal">
  <div class="panel">
    <div class="modal-head"><h3>Share this bar</h3><button type="button" class="modal-x" data-close-share aria-label="Close">✕</button></div>
    <p class="modal-sub">Copy and paste it into iMessage, WhatsApp, or anywhere.</p>
    <textarea id="share-text" rows="6" readonly>${esc(shareText)}</textarea>
    <button type="button" data-copy-share data-native>Copy</button>
  </div>
</dialog>
<dialog id="report-dialog" class="modal">
  <form class="panel" method="post" action="/api/report">
    <div class="modal-head"><h3>Report a change</h3><button type="button" class="modal-x" data-close-report aria-label="Close">✕</button></div>
    <p class="modal-sub">Times off? Deal changed? Place closed? Tell us — every report gets reviewed before we touch a listing.</p>
    <input type="hidden" name="bar_id" value="${bar.id}">
    <input type="text" name="website2" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
    <label for="rep">What changed?</label>
    <textarea id="rep" name="detail" rows="3" required placeholder="e.g. happy hour is now 4–6, not 3–6"></textarea>
    <div class="cf-turnstile" data-sitekey="${esc(env.TURNSTILE_SITEKEY)}"></div>
    <button type="submit">Send report</button>
  </form>
</dialog>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`,
    jsonld: [
      barJsonLd(bar, { description: metaDesc }),
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        ...(CITIES[bar.city] ? [{ name: cityName(bar.city), path: `/${bar.city}` }] : []),
        { name: hoodName(bar.neighborhood), path: `/${bar.neighborhood}` },
        { name: bar.name, path: `/bar/${bar.slug}` },
      ]),
    ],
  }));
}

export async function submitPage({ env, url }) {
  const ok = url.searchParams.get('ok');
  return html(layout({
    title: 'Add a bar — 5PM MSP',
    desc: 'Know a Twin Cities happy hour we\'re missing? Add it.',
    path: '/submit',
    body: `
<p class="crumb"><a href="/">home</a></p>
<div class="rail-label"><h2>Add a bar</h2></div>
${ok ? '<div class="ok-note">Thanks — it\'s in the review queue. Verified listings only go live after we confirm the deal.</div>' : ''}
<form class="panel" method="post" action="/api/submit">
  <input type="text" name="website2" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
  <label for="s-name">Bar name</label>
  <input id="s-name" name="name" required>
  <label for="s-hood">Neighborhood</label>
  <input id="s-hood" name="neighborhood" required placeholder="e.g. Nordeast">
  <label for="s-deal">Happy hour (days, times, deals)</label>
  <textarea id="s-deal" name="detail" rows="3" required placeholder="Mon–Fri 3–6, $2 off taps, half-price wings"></textarea>
  <label for="s-web">Bar website (helps us verify)</label>
  <input id="s-web" name="website" type="url" placeholder="https://…">
  <div class="cf-turnstile" data-sitekey="${esc(env.TURNSTILE_SITEKEY)}"></div>
  <button type="submit">Submit</button>
</form>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`,
  }));
}

export function notFound(hoods) {
  return new Response(layout({
    title: 'Not found — 5PM MSP',
    desc: 'That page isn\'t on the sign.',
    path: '/404',
    body: `
<div class="rail-label"><h2>Nothing lit here</h2></div>
<div class="empty">That page doesn't exist (or the bar's gone dark). Try a neighborhood:</div>
${hoodChips(hoods)}`,
  }), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
