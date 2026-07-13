// SSR building blocks: escape, page layout, bar card.
import { isActive, minutesLeft, nextStart, fmtWindow, fmtDows } from './time.js';
import { hoodName, CITIES } from './data.js';

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
    <a href="/map">Map</a> · <a href="/submit">Add a bar</a>
  </nav>
  <form class="news" method="post" action="/api/subscribe">
    <label for="nl-email">New deals + new bars, occasionally:</label>
    <div class="news-row">
      <input id="nl-email" name="email" type="email" required placeholder="you@example.com" autocomplete="email">
      <input type="text" name="website2" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button type="submit">Sign up</button>
    </div>
  </form>
  <p class="fine">Free + independent. No ads, no sponsored bars. Deals change — tap
  “report” on a bar page when one's off. Your location never leaves your phone.</p>
</footer>
</div>
${includeAppJs ? '<script src="/app.js" defer></script>' : ''}
</body>
</html>`;
}

/** One enamel card. `now` from nowInChicago(). */
export function barCard(bar, now, { showHood = true, dist = true } = {}) {
  const active = bar.hh.find(h => isActive(h, now));
  const flags = [
    bar.patio ? '<span class="chip">☀ patio</span>' : '',
    bar.rooftop ? '<span class="chip">rooftop</span>' : '',
    bar.skyway ? '<span class="chip">❄ skyway</span>' : '',
  ].join('');
  const trust = bar.verified
    ? `<span class="chip verified">Verified ${esc(bar.last_verified || '')}</span>`
    : '<span class="chip">unverified</span>';
  let status = '';
  if (active) {
    const left = minutesLeft(active, now);
    status = `<span class="now" data-end>ends in ${left >= 60 ? `${Math.floor(left / 60)}h ${left % 60}m` : `${left}m`}</span>`;
  } else {
    const nxt = nextStart(bar.hh, now);
    if (nxt) {
      const m = nxt.inMinutes;
      status = `<span class="next">next: ${m < 1440 ? (m >= 60 ? `in ${Math.floor(m / 60)}h ${m % 60}m` : `in ${m}m`) : fmtDows(nxt.hh.dow_mask).split(',')[0].split('–')[0] + ' ' + fmtWindow(nxt.hh)}</span>`;
    }
  }
  const windows = bar.hh.map(h =>
    `<p class="deal">${esc(h.deals)} <span class="win">· ${fmtDows(h.dow_mask)} ${fmtWindow(h)}</span></p>`).join('');
  return `<article class="card${active ? ' active' : ''}" data-lat="${bar.lat}" data-lng="${bar.lng}" data-slug="${esc(bar.slug)}">
  <div class="top"><h3><a href="/bar/${esc(bar.slug)}">${esc(bar.name)}</a></h3>${dist ? '<span class="dist" data-dist hidden></span>' : ''}</div>
  ${windows}
  <div class="meta">${trust}${showHood ? `<span class="chip">${esc(hoodName(bar.neighborhood))}${bar.city === 'st-paul' ? ' · STP' : ''}</span>` : ''}${flags}${status}</div>
</article>`;
}

export const cityName = c => CITIES[c] || c;
