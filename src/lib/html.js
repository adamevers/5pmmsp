// SSR building blocks: escape, page layout, bar card.
import { isActive, minutesLeft, nextStart, fmtWindow, fmtDows } from './time.js';
import { hoodName, CITIES, categoryName, priceLabel } from './data.js';

export const esc = s => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const WORDMARK = '5PM MSP'.split('').map(c =>
  `<span class="l">${c === ' ' ? '&nbsp;' : c}</span>`).join('');

export function layout({ title, desc, path = '/', body, jsonld = null, includeAppJs = true }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="https://5pmmsp.com${esc(path)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="https://5pmmsp.com${esc(path)}">
<meta property="og:type" content="website">
<meta property="og:image" content="https://5pmmsp.com/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://5pmmsp.com/og.png">
<meta name="theme-color" content="#101B2D">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;800&family=Archivo:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
</head>
<body>
<div class="wrap">
<header>
  <a class="home" href="/" aria-label="5PM MSP home">
    <div class="cap"><span><i>5PM</i></span></div>
    <h1 class="wordmark">${WORDMARK}</h1>
  </a>
  <p class="tag">Happy hours, lit up nightly · <b>Mpls + St Paul</b></p>
</header>
<main>
${body}
</main>
<footer>
  <nav class="foot-nav">
    <a href="/minneapolis">Minneapolis</a> · <a href="/st-paul">St Paul</a> ·
    <a href="/submit">Add a bar</a>
  </nav>
  <form class="news" method="post" action="/api/subscribe">
    <label for="nl-email">New deals + new bars, occasionally:</label>
    <div class="news-row">
      <input id="nl-email" name="email" type="email" required placeholder="you@example.com" autocomplete="email">
      <input type="text" name="website2" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button type="submit">Sign up</button>
    </div>
  </form>
  <p class="fine">Free + independent. Deals change — tap “report” on a bar page
  when one's off. Your location never leaves your phone.</p>
</footer>
</div>
${includeAppJs ? '<script src="/app.js" defer></script>' : ''}
</body>
</html>`;
}

/** Human "ends in 1h 18m" / "in 40m" from a minute count. */
export function fmtLeft(m) {
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/** Server-rendered status text for a card (client re-derives it live). */
export function statusText(bar, now) {
  const active = bar.hh.find(h => isActive(h, now));
  if (active) return { cls: 'now', text: `ends in ${fmtLeft(minutesLeft(active, now))}` };
  const nxt = nextStart(bar.hh, now);
  if (!nxt) return { cls: 'next', text: '' };
  const m = nxt.inMinutes;
  const text = m < 1440
    ? `next: in ${fmtLeft(m)}`
    : `next: ${fmtDows(nxt.hh.dow_mask).split(',')[0].split('–')[0]} ${fmtWindow(nxt.hh)}`;
  return { cls: 'next', text };
}

/**
 * One enamel card. `now` from nowInChicago().
 * `link`  → whole card navigates to the bar page (stretched-link).
 * `dist`  → reserve a distance slot for near-me.
 */
/** ◆ Verified chip + a little ⓘ that reveals the last-verified date, or "unverified". */
export function trustChip(bar) {
  if (!bar.verified) return '<span class="chip">unverified</span>';
  const d = esc(bar.last_verified || '');
  return `<span class="chip verified">Verified</span>` +
    `<button class="info" data-info="Last verified ${d}" aria-label="Last verified ${d}" title="Last verified ${d}">${icon('info')}</button>`;
}

/** Heart/favorite toggle (client-persisted). */
export const favBtn = bar =>
  `<button class="fav" data-fav="${esc(bar.slug)}" aria-label="Save ${esc(bar.name)}" aria-pressed="false">${icon('heart')}</button>`;

/** Category · price attribute chips. */
export function attrChips(bar) {
  const cat = categoryName(bar.category);
  const price = priceLabel(bar.price);
  return (cat ? `<span class="chip cat">${esc(cat)}</span>` : '') +
    (price ? `<span class="chip price">${price}</span>` : '');
}

export function barCard(bar, now, { showHood = true, dist = true, link = true } = {}) {
  const active = bar.hh.some(h => isActive(h, now));
  const flags = [
    bar.patio ? '<span class="chip">☀ patio</span>' : '',
    bar.rooftop ? '<span class="chip">rooftop</span>' : '',
    bar.skyway ? '<span class="chip">❄ skyway</span>' : '',
  ].join('');
  const st = statusText(bar, now);
  const title = link
    ? `<a class="card-link" href="/bar/${esc(bar.slug)}">${esc(bar.name)}</a>`
    : esc(bar.name);
  // Compact window data so the client can re-derive active/next + countdown live.
  const hhData = esc(JSON.stringify(bar.hh.map(h => ({ d: h.dow_mask, s: h.start_min, e: h.end_min }))));
  const windows = bar.hh.map(h =>
    `<p class="deal">${esc(h.deals)} <span class="win">· ${fmtDows(h.dow_mask)} ${fmtWindow(h)}</span></p>`).join('');
  return `<article class="card${active ? ' active' : ''}${link ? ' card--link' : ''}" data-lat="${bar.lat}" data-lng="${bar.lng}" data-slug="${esc(bar.slug)}" data-hh="${hhData}">
  <div class="top"><h3>${title}</h3><div class="top-right">${dist ? '<span class="dist" data-dist hidden></span>' : ''}${favBtn(bar)}</div></div>
  ${windows}
  <div class="meta">${trustChip(bar)}${attrChips(bar)}${showHood ? `<span class="chip">${esc(hoodName(bar.neighborhood))}${bar.city === 'st-paul' ? ' · STP' : ''}</span>` : ''}${flags}<span class="${st.cls}" data-status>${st.text}</span></div>
</article>`;
}

export const cityName = c => CITIES[c] || c;

// Inline line-icons (stroke = currentColor). Default set — alternates live in
// docs/brand.md; swap the path here to change the whole site.
const ICONS = {
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/>',
  pin: '<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  heart: '<path d="M12 20s-7-4.5-9.5-9A5 5 0 0 1 12 6a5 5 0 0 1 9.5 5c-2.5 4.5-9.5 9-9.5 9z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8 15.8 6.4M8.2 13.2l7.6 4.4"/>',
};
export const icon = name =>
  `<svg class="ico" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
