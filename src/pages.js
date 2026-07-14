// SSR pages: home, neighborhood, city, bar detail, submit, map, 404.
import { layout, barCard, esc, cityName, icon, trustChip, attrChips, favBtn, withUtm } from './lib/html.js';
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
  <span class="fgroup">
    <button aria-pressed="false" data-f="happyhournow">● Happy Hour Now</button>
    <button aria-pressed="false" data-f="opennow">Open Now</button>
  </span>
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
  const hoods = await hoodCounts(env.DB);

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
  <a class="btn primary" data-nearme-fallback href="#hoods">Browse neighborhoods</a>
</div>
<p class="hint">location stays on your phone — we never see it</p>
${FILTERS}
<div class="rail-label"><span class="live"></span><h2>Open right now</h2><small data-clock>${clock(now)}</small></div>
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
    wide: true,
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
    wide: true,
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
  const flags = [
    bar.patio ? '<span class="chip">☀ patio</span>' : '',
    bar.rooftop ? '<span class="chip">rooftop</span>' : '',
    bar.skyway ? '<span class="chip">❄ skyway</span>' : '',
  ].join('');

  // ── Happy Hr row: a green pill per window + the deal beneath it ──
  const infoBtn = bar.verified && bar.last_verified
    ? `<button class="info" data-info="Last verified ${esc(bar.last_verified)}" aria-label="Last verified ${esc(bar.last_verified)}" title="Last verified ${esc(bar.last_verified)}">${icon('info')}</button>`
    : '';
  const hhItems = bar.hh.length
    ? bar.hh.map(h =>
        `<div class="hh-item"><span class="hh-pill${isActive(h, now) ? ' on' : ''}">${fmtDows(h.dow_mask)}: ${fmtWindow(h)}</span>${h.deals ? `<p class="hh-deal">${esc(h.deals)}</p>` : ''}</div>`
      ).join('')
    : '<p class="hh-none">No happy hour on file yet — know one? Report it below.</p>';

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

  const hoursPanel = `<div class="hours-panel">
  <div class="hrow">
    <span class="hrow-k">Happy Hr</span>
    <div class="hrow-v">${hhItems}${infoBtn}</div>
  </div>${hoursSection}
</div>`;
  const about = [
    bar.food ? `<div><span>Food</span> ${esc(bar.food)}</div>` : '',
    bar.seating ? `<div><span>Seating</span> ${esc(bar.seating)}</div>` : '',
  ].join('');
  const w0 = bar.hh[0];
  const shareText = `Happy hour at ${bar.name}${w0 ? ` — ${fmtDows(w0.dow_mask)} ${fmtWindow(w0)}` : ''} · via 5PM MSP\nhttps://5pmmsp.com/bar/${bar.slug}`;
  const dirQ = encodeURIComponent(`${bar.name}, ${cityName(bar.city)} MN`);
  return html(layout({
    title: `${bar.name} happy hour — ${hoodName(bar.neighborhood)} — 5PM MSP`,
    desc: `${bar.name} happy hour times and deals in ${hoodName(bar.neighborhood)}, ${cityName(bar.city)}.`,
    path: `/bar/${bar.slug}`,
    body: `
<p class="crumb"><a href="/">home</a> / <a href="/${esc(bar.neighborhood)}">${esc(hoodName(bar.neighborhood))}</a></p>
<div class="bar-head"><h2>${esc(bar.name)}</h2><div class="bar-actions">${favBtn(bar)}<button type="button" class="act" data-open-share aria-label="Share">${icon('share')}</button></div></div>
<div class="meta bar-meta">${trustChip(bar)}${attrChips(bar)}<span class="chip">${esc(hoodName(bar.neighborhood))}${bar.city === 'st-paul' ? ' · STP' : ''}</span>${flags}</div>
${hoursPanel}
${about ? `<dl class="about">${about}</dl>` : ''}
<div class="bar-links">
  ${bar.website ? `<a href="${esc(withUtm(bar.website))}" target="_blank" rel="noopener noreferrer">${icon('globe')} Website</a>` : ''}
  <a class="dir" data-lat="${bar.lat}" data-lng="${bar.lng}" data-q="${dirQ}" href="https://www.google.com/maps/search/?api=1&query=${dirQ}" target="_blank" rel="noopener noreferrer">${icon('pin')} Directions</a>
  <button type="button" class="icon-only" data-open-report aria-label="Report a change" title="Report a change">${icon('flag')}</button>
</div>
${bar.notes ? `<p class="hint" style="text-align:left">${esc(bar.notes)}</p>` : ''}
${ok === 'report' ? '<div class="ok-note">Got it — thanks. We review every report before changing a listing.</div>' : ''}
<dialog id="share-dialog" class="modal">
  <div class="panel">
    <div class="modal-head"><h3>Share ${esc(bar.name)}</h3><button type="button" class="modal-x" data-close-share aria-label="Close">✕</button></div>
    <p class="modal-sub">Copy this into a text — friends get the deal and a link.</p>
    <textarea id="share-text" rows="3" readonly>${esc(shareText)}</textarea>
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
