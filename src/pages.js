// SSR pages: home, neighborhood, city, bar detail, submit, map, 404.
import { layout, barCard, esc, cityName, icon } from './lib/html.js';
import { allBarsWithHH, barBySlug, hoodCounts, hoodName, CITIES, HOODS } from './lib/data.js';
import { nowInChicago, isActive, nextStart, fmtWindow, fmtDows } from './lib/time.js';

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

const FILTERS = `<div class="filters" data-filters hidden>
  <button aria-pressed="false" data-f="patio">☀ patio</button>
  <button aria-pressed="false" data-f="rooftop">rooftop</button>
  <button aria-pressed="false" data-f="verified">◆ verified</button>
</div>`;

export async function home({ env, url }) {
  const subscribed = url.searchParams.get('subscribed');
  const now = nowInChicago();
  const bars = await allBarsWithHH(env.DB);
  const activeBars = bars.filter(b => b.hh.some(h => isActive(h, now)));
  const hoods = await hoodCounts(env.DB);

  let rail;
  if (activeBars.length) {
    rail = activeBars.map(b => barCard(b, now)).join('');
  } else {
    const upcoming = bars
      .map(b => ({ b, n: nextStart(b.hh, now) })).filter(x => x.n)
      .sort((a, z) => a.n.inMinutes - z.n.inMinutes).slice(0, 6);
    const soonest = upcoming[0];
    rail = `<div class="empty">Nothing's pouring right this minute. <b>Next up${
      soonest && soonest.n.inMinutes < 1440 ? ` at ${fmtWindow(soonest.n.hh).split('–')[0]}` : ''
    }:</b></div>` + upcoming.map(x => barCard(x.b, now)).join('');
  }

  return html(layout({
    title: '5PM MSP — Twin Cities happy hour finder',
    desc: `Happy hours across Minneapolis + St Paul — ${bars.length} bars, filterable by neighborhood, time, and what's pouring right now.`,
    path: '/',
    body: `
${subscribed ? '<div class="ok-note">You\'re on the list. New deals + new bars, occasionally — never spam.</div>' : ''}
<div class="actions">
  <button class="btn primary" data-nearme hidden>◉ Near me</button>
  <a class="btn primary" data-nearme-fallback href="#hoods">Browse hoods</a>
  <a class="btn ghost" href="/map">Map</a>
</div>
<p class="hint">location stays on your phone — we never see it</p>
${FILTERS}
<div class="rail-label"><span class="live"></span><h2>Lit right now</h2><small data-clock>${clock(now)}</small></div>
<div data-cards>${rail}</div>
<div class="rail-label" id="hoods"><h2>By neighborhood</h2></div>
${hoodChips(hoods)}
<div class="rail-label"><h2>By city</h2></div>
<div class="hoods">
  <a class="hood" href="/minneapolis">Minneapolis</a>
  <a class="hood" href="/st-paul">St Paul</a>
</div>`,
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
  return html(layout({
    title: `${name} happy hours — 5PM MSP`,
    desc: `Every happy hour we track in ${name}, ${city} — ${bars.length} bars with times and deals.`,
    path: `/${params.hood}`,
    body: `
<p class="crumb"><a href="/">home</a> / ${esc(city)}</p>
<div class="rail-label"><h2>${esc(name)}</h2><small data-clock>${clock(now)}</small></div>
${FILTERS}
<div data-cards>${bars.map(b => barCard(b, now, { showHood: false })).join('')}</div>
<p class="hint">missing a bar? <a href="/submit" style="color:var(--filament)">add it</a></p>`,
  }));
}

export async function cityPage({ env, params }) {
  const city = params.city;
  if (!CITIES[city]) return null;
  const now = nowInChicago();
  const bars = (await allBarsWithHH(env.DB)).filter(b => b.city === city);
  const hoods = (await hoodCounts(env.DB)).filter(h => h.city === city);
  return html(layout({
    title: `${cityName(city)} happy hours — 5PM MSP`,
    desc: `Happy hours across ${cityName(city)} — ${bars.length} bars by neighborhood, time, and deal.`,
    path: `/${city}`,
    body: `
<p class="crumb"><a href="/">home</a></p>
<div class="rail-label"><h2>${esc(cityName(city))}</h2><small data-clock>${clock(now)}</small></div>
${hoodChips(hoods)}
${FILTERS}
<div data-cards>${bars.map(b => barCard(b, now)).join('')}</div>`,
  }));
}

export async function barPage({ env, params, url }) {
  const bar = await barBySlug(env.DB, params.slug);
  if (!bar) return null;
  const now = nowInChicago();
  const ok = url.searchParams.get('ok');
  const schedule = bar.hh.map(h =>
    `<p class="deal">${esc(h.deals)} <span class="win">· ${fmtDows(h.dow_mask)} ${fmtWindow(h)}</span></p>`).join('');
  return html(layout({
    title: `${bar.name} happy hour — ${hoodName(bar.neighborhood)} — 5PM MSP`,
    desc: `${bar.name} happy hour times and deals in ${hoodName(bar.neighborhood)}, ${cityName(bar.city)}.`,
    path: `/bar/${bar.slug}`,
    body: `
<p class="crumb"><a href="/">home</a> / <a href="/${esc(bar.neighborhood)}">${esc(hoodName(bar.neighborhood))}</a></p>
<div class="bar-head"><h2>${esc(bar.name)}</h2></div>
${barCard(bar, now, { showHood: true, dist: false, link: false }).replace(/<h3>.*?<\/h3>/, '')}
<div class="rail-label"><h2>The schedule</h2></div>
${schedule || '<div class="empty">No happy hour windows on file yet — know one? Report it below.</div>'}
<div class="bar-links">
  ${bar.website ? `<a href="${esc(bar.website)}" target="_blank" rel="noopener noreferrer">${icon('globe')} Website</a>` : ''}
  <a href="https://www.openstreetmap.org/?mlat=${bar.lat}&mlon=${bar.lng}#map=18/${bar.lat}/${bar.lng}" target="_blank" rel="noopener noreferrer">${icon('pin')} Map &amp; directions</a>
</div>
${bar.notes ? `<p class="hint" style="text-align:left">${esc(bar.notes)}</p>` : ''}
${ok === 'report' ? '<div class="ok-note">Got it — thanks. We review every report before changing a listing.</div>' : ''}
<div class="report-cta">
  <button type="button" class="btn ghost" data-open-report>${icon('flag')} Something wrong?</button>
</div>
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
    jsonld: {
      '@context': 'https://schema.org', '@type': 'BarOrPub', name: bar.name,
      url: `https://5pmmsp.com/bar/${bar.slug}`,
      geo: { '@type': 'GeoCoordinates', latitude: bar.lat, longitude: bar.lng },
      address: { '@type': 'PostalAddress', addressLocality: cityName(bar.city), addressRegion: 'MN' },
      ...(bar.website ? { sameAs: bar.website } : {}),
    },
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

export async function mapPage({ env }) {
  return html(layout({
    title: 'Map — 5PM MSP',
    desc: 'Every Twin Cities happy hour we track, on one map.',
    path: '/map',
    includeAppJs: false,
    body: `
<p class="crumb"><a href="/">home</a></p>
<div class="rail-label"><h2>The map</h2></div>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="anonymous">
<div id="map"></div>
<p class="hint">tap a pin for tonight's window</p>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous"></script>
<script src="/map.js" defer></script>`,
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
