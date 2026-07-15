// SSR pages: home, neighborhood, city, bar detail, submit, map, 404.
import { layout, barCard, esc, cityName, icon, trustChip, attrChips, favBtn, withUtm, priceMarks, barFlags, fmtDate } from './lib/html.js';
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

const FILTERS = `<div class="filter-wrap">
<button class="filters-btn" data-filters-toggle aria-expanded="false" hidden>Filters <span class="fb-arrow">▾</span></button>
<div class="filters" data-filters hidden>
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
</div>
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
<button class="btn roulette" data-roulette aria-label="Bar roulette — spin for a random open bar"><span class="dice">🎲</span><span class="rlbl"> Bar roulette <small>· spin for a random open bar</small></span></button>
<p class="hint">location stays on your phone — we never see it</p>
${FILTERS}
<div class="rail-label"><span class="live"></span><h2>Open right now</h2><small data-clock>${clock(now)}</small></div>
<div data-cards>${rail}</div>
<p class="hint" style="margin-top:20px"><a href="/neighborhoods" style="color:var(--filament)">Browse all neighborhoods →</a></p>`,
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

export async function barPage({ env, params, url }) {
  const bar = await barBySlug(env.DB, params.slug);
  if (!bar) return null;
  const now = nowInChicago();
  const ok = url.searchParams.get('ok');

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
  const fullAddr = bar.address
    ? `${bar.address}, ${cityName(bar.city)}, ${bar.state || 'MN'}${bar.zip ? ' ' + bar.zip : ''}`
    : '';
  const shareText = [
    `Happy hour at ${bar.name} (${hoodName(bar.neighborhood)})`,
    ...bar.hh.map(h => `${fmtDows(h.dow_mask)}: ${fmtWindow(h)}`),
    dealLine && `“${dealLine}”`,
    fullAddr,
  ].filter(Boolean).join('\n') + '\n\nFind more happy hours at 5pmmsp.com';
  const dirQ = encodeURIComponent(fullAddr
    ? `${bar.name}, ${fullAddr}`
    : `${bar.name}, ${cityName(bar.city)} ${bar.state || 'MN'}`);
  return html(layout({
    title: `${bar.name} happy hour — ${hoodName(bar.neighborhood)} — 5PM MSP`,
    desc: `${bar.name} happy hour times and deals in ${hoodName(bar.neighborhood)}, ${cityName(bar.city)}.`,
    path: `/bar/${bar.slug}`,
    body: `
<p class="crumb"><a href="/">home</a> / <a href="/${esc(bar.neighborhood)}">${esc(hoodName(bar.neighborhood))}</a></p>
<div class="bar-head"><h2>${esc(bar.name)}</h2><div class="bar-actions">${favBtn(bar)}</div></div>
<div class="pills">${trustChip(bar)}${attrChips(bar)}${barFlags(bar)}</div>
${priceMarks(bar.price)}
<p class="loc">${esc(hoodName(bar.neighborhood))} · ${esc(cityName(bar.city))}</p>
${hoursPanel}
${dealQuotes}
<div class="bar-links">
  ${bar.website ? `<a href="${esc(withUtm(bar.website))}" target="_blank" rel="noopener noreferrer" aria-label="Website">${icon('globe')}<span class="blbl">Website</span></a>` : ''}
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
