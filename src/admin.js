// /admin — phone-first triage + live bar editing (docs/plans/2026-07-16-admin-ui-plan.md).
// Auth: ADMIN_TOKEN + signed cookie (src/lib/auth.js). Every response: no-store,
// noindex. Every mutation: admin_log before/after. D1 is the source of truth;
// scripts/export.js snapshots it back to seed/bars.json.
import { esc } from './lib/html.js';
import { CITIES, HOODS, CATEGORIES, hoodName, barBySlug } from './lib/data.js';
import { isAdmin, tokenOk, sessionCookie, clearCookie, sameOrigin } from './lib/auth.js';
import { DAYS, timeFromMinutes, parseWindows, barFromForm } from './lib/adminform.js';

const todayChicago = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());

// ---------- responses ----------

const CSS = `
:root{--night:#101B2D;--card:#182741;--line:#2a3a57;--fil:#FFB84D;--enamel:#F4E9D8;
--dim:#8fa0b8;--green:#2E6B4F;--red:#C8322B}
*{box-sizing:border-box}
body{margin:0;background:var(--night);color:var(--enamel);
font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:16px 14px 60px}
main{max-width:640px;margin:0 auto}
h1{font-size:22px;color:var(--fil);margin:0}
h1 a{color:var(--fil);text-decoration:none}
h2{font-size:17px;color:var(--fil);margin:26px 0 8px}
a{color:var(--fil)}
.top{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:18px}
.top form{margin:0}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}
.stat{background:var(--card);border-radius:10px;padding:10px 12px}
.stat b{display:block;font-size:22px;color:var(--fil)}
.stat span{font-size:12px;color:var(--dim)}
.card{background:var(--card);border-radius:10px;padding:12px 14px;margin:10px 0}
.card .meta{font-size:13px;color:var(--dim)}
.card p{margin:6px 0}
.btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
button,.btn{background:var(--fil);color:#1a1408;border:0;border-radius:8px;
padding:10px 16px;font-size:15px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}
button.ghost{background:transparent;color:var(--enamel);border:1px solid var(--line)}
button.danger{background:var(--red);color:#fff}
input,select,textarea{width:100%;background:#0b1424;color:var(--enamel);
border:1px solid var(--line);border-radius:8px;padding:10px;font-size:16px;margin:4px 0 12px}
input[type=checkbox]{width:auto;margin:0 6px 0 0;transform:scale(1.3)}
label{font-size:14px;color:var(--dim)}
label.inline{display:inline-flex;align-items:center;margin-right:14px;color:var(--enamel)}
.err{background:rgba(200,50,43,.15);border-left:4px solid var(--red);border-radius:8px;padding:10px 12px;margin:10px 0}
.ok{background:rgba(46,107,79,.2);border-left:4px solid var(--green);border-radius:8px;padding:10px 12px;margin:10px 0}
.win{border:1px solid var(--line);border-radius:10px;padding:10px;margin:8px 0}
.win .days{display:flex;flex-wrap:wrap;gap:4px 10px;margin-bottom:6px}
.win .days label{display:inline-flex;align-items:center;color:var(--enamel);font-size:14px}
.win .times{display:flex;align-items:center;gap:8px}
.win .times input{margin:0}
.win .deals{margin:8px 0 0}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}
.log{font-size:13px;color:var(--dim)}
.log li{margin:4px 0}
table{width:100%;border-collapse:collapse;font-size:14px}
td{padding:6px 4px;border-bottom:1px solid var(--line)}
`;

const page = (title, body, extraHeaders = {}) => new Response(
  `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)} · 5PM MSP admin</title>
<style>${CSS}</style></head><body><main>${body}</main></body></html>`,
  { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
    'x-robots-tag': 'noindex', ...extraHeaders } });

const redirect = (to, extraHeaders = {}) =>
  new Response(null, { status: 302, headers: { location: to, 'cache-control': 'no-store', ...extraHeaders } });

const topBar = (sub = '') => `<div class="top"><h1><a href="/admin">5PM MSP admin</a>${sub ? ` · ${esc(sub)}` : ''}</h1>
<form method="post" action="/admin/logout"><button class="ghost">Log out</button></form></div>`;

// ---------- auth plumbing ----------

const guard = h => async c => (await isAdmin(c.request, c.env)) ? h(c) : redirect('/admin/login');
const guardPost = h => async c => {
  if (!(await isAdmin(c.request, c.env))) return redirect('/admin/login');
  if (!sameOrigin(c.request)) return new Response('Bad origin.', { status: 403 });
  return h(c);
};

async function loginPage({ url }) {
  const failed = url.searchParams.get('failed');
  return page('Log in', `<h1>5PM MSP admin</h1>
${failed ? '<div class="err">That token didn’t match.</div>' : ''}
<form method="post" action="/admin/login">
<label>Admin token</label><input type="password" name="token" autofocus autocomplete="current-password">
<button>Log in</button></form>`);
}

async function doLogin({ request, env }) {
  if (!sameOrigin(request)) return new Response('Bad origin.', { status: 403 });
  const form = await request.formData();
  if (await tokenOk(form.get('token'), env))
    return redirect('/admin', { 'set-cookie': await sessionCookie(env) });
  await new Promise(r => setTimeout(r, 400));
  return redirect('/admin/login?failed=1');
}

const doLogout = () => redirect('/admin/login', { 'set-cookie': clearCookie() });

// ---------- audit ----------

const logAdmin = (db, action, subject, before, after) =>
  db.prepare('INSERT INTO admin_log (action, subject, before, after) VALUES (?, ?, ?, ?)')
    .bind(action, String(subject), before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null).run();

// ---------- dashboard ----------

const parsePayload = s => { try { return JSON.parse(s) || {}; } catch { return {}; } };

function submissionCard(s) {
  const p = parsePayload(s.payload);
  const body = s.kind === 'report'
    ? `<p><b>${s.bar_name ? `<a href="/admin/bar/${esc(s.bar_slug)}">${esc(s.bar_name)}</a>` : 'Unknown bar'}</b>
       ${s.bar_slug ? `· <a href="/bar/${esc(s.bar_slug)}">public page</a>` : ''}</p>
       <p>"${esc(p.detail || '')}"</p>`
    : `<p><b>New bar: ${esc(p.name || '?')}</b>${p.neighborhood ? ` · ${esc(p.neighborhood)}` : ''}</p>
       <p>"${esc(p.detail || '')}"</p>
       ${p.website ? `<p class="meta">${esc(p.website)}</p>` : ''}`;
  return `<div class="card"><div class="meta">#${s.id} · ${esc(s.kind)} · ${esc(s.created_at)} UTC</div>
${body}
<form method="post" action="/admin/submission/${s.id}">
<input name="note" placeholder="note (optional)">
<div class="btns">
<button name="do" value="accept">Accept${s.kind === 'report' ? ' → edit bar' : ' → add bar'}</button>
<button name="do" value="reject" class="danger">Reject</button>
</div></form></div>`;
}

async function dash({ env, url }) {
  const db = env.DB;
  const q = (url.searchParams.get('q') || '').trim();
  const [bars, verified, stale, subs, queued] = (await db.batch([
    db.prepare('SELECT COUNT(*) c FROM bars'),
    db.prepare('SELECT COUNT(*) c FROM bars WHERE verified = 1'),
    db.prepare("SELECT COUNT(*) c FROM bars WHERE verified = 1 AND last_verified < date('now', '-90 day')"),
    db.prepare('SELECT COUNT(*) c FROM subscribers'),
    db.prepare("SELECT COUNT(*) c FROM submissions WHERE verify_status = 'queued'"),
  ])).map(r => r.results[0].c);
  const pending = (await db.prepare(
    `SELECT s.*, b.name AS bar_name, b.slug AS bar_slug FROM submissions s
     LEFT JOIN bars b ON b.id = s.bar_id WHERE s.status = 'pending' ORDER BY s.id DESC`).all()).results;
  const recent = (await db.prepare(
    'SELECT ts, action, subject FROM admin_log ORDER BY id DESC LIMIT 6').all()).results;
  const found = q ? (await db.prepare(
    'SELECT slug, name, neighborhood FROM bars WHERE name LIKE ? ORDER BY name LIMIT 25')
    .bind(`%${q}%`).all()).results : [];

  return page('Dashboard', `${topBar()}
<div class="stats">
<div class="stat"><b>${bars}</b><span>bars</span></div>
<div class="stat"><b>${bars ? Math.round(verified / bars * 100) : 0}%</b><span>verified</span></div>
<div class="stat"><b>${pending.length}</b><span>pending</span></div>
<div class="stat"><b>${stale}</b><span>stale &gt;90d</span></div>
<div class="stat"><b>${queued}</b><span>re-verify queue</span></div>
<div class="stat"><b>${subs}</b><span><a href="/admin/subscribers">subscribers</a></span></div>
</div>

<h2>Pending submissions</h2>
${pending.length ? pending.map(submissionCard).join('') : '<p class="meta">Queue is clear 🍻</p>'}

<h2>Find a bar</h2>
<form method="get" action="/admin"><input name="q" value="${esc(q)}" placeholder="name…" autocomplete="off"></form>
${found.map(b => `<div class="card"><a href="/admin/bar/${esc(b.slug)}"><b>${esc(b.name)}</b></a>
 <span class="meta">· ${esc(hoodName(b.neighborhood))}</span></div>`).join('')}
${q && !found.length ? '<p class="meta">No matches.</p>' : ''}
<p><a class="btn" href="/admin/new">+ Add a bar</a></p>

<h2>Recent admin activity</h2>
<ul class="log">${recent.map(l => `<li>${esc(l.ts)} · ${esc(l.action)} · ${esc(l.subject)}</li>`).join('') || '<li>none yet</li>'}</ul>`);
}

// ---------- submissions ----------

async function resolveSubmission({ request, env, params }) {
  const db = env.DB;
  const sub = await db.prepare(
    `SELECT s.*, b.slug AS bar_slug FROM submissions s LEFT JOIN bars b ON b.id = s.bar_id
     WHERE s.id = ?`).bind(Number(params.id)).first();
  if (!sub || sub.status !== 'pending') return redirect('/admin');
  const form = await request.formData();
  const action = form.get('do') === 'accept' ? 'accepted' : 'rejected';
  const note = String(form.get('note') || '').trim() || null;
  // Accepted reports also join the ingest re-verify queue: the CoS worker polls
  // verify_status='queued' and re-checks the bar's official site.
  const verify = action === 'accepted' && sub.kind === 'report' ? 'queued' : null;
  await db.prepare(
    `UPDATE submissions SET status = ?, resolved_at = datetime('now'), resolution = ?,
     verify_status = ? WHERE id = ?`).bind(action, note, verify, sub.id).run();
  await logAdmin(db, `submission.${action}`, sub.id,
    { kind: sub.kind, bar_id: sub.bar_id, payload: parsePayload(sub.payload) }, { note });
  if (action === 'accepted' && sub.kind === 'report' && sub.bar_slug)
    return redirect(`/admin/bar/${sub.bar_slug}?sub=${sub.id}`);
  if (action === 'accepted' && sub.kind === 'new')
    return redirect(`/admin/new?sub=${sub.id}`);
  return redirect('/admin');
}

// ---------- bar editor ----------

const sel = (name, options, current, blankLabel) => `<select name="${name}">
${blankLabel !== undefined ? `<option value="">${esc(blankLabel)}</option>` : ''}
${Object.entries(options).map(([v, l]) =>
    `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(l)}</option>`).join('')}
</select>`;

function windowRows(prefix, windows, withDeals) {
  const rows = [...windows, null, null]; // existing + two blanks
  return rows.map((w, i) => `<fieldset class="win">
<div class="days">${DAYS.map((d, b) =>
    `<label><input type="checkbox" name="${prefix}${i}d${b}"${w && (w.dow_mask >> b) & 1 ? ' checked' : ''}>${d}</label>`).join('')}</div>
<div class="times"><input type="time" name="${prefix}${i}s" value="${w ? timeFromMinutes(w.start_min) : ''}">
<span>to</span><input type="time" name="${prefix}${i}e" value="${w ? timeFromMinutes(w.end_min) : ''}"></div>
${withDeals ? `<input class="deals" name="${prefix}${i}deals" placeholder="deals, e.g. $5 taps" value="${w ? esc(w.deals) : ''}">` : ''}
</fieldset>`).join('');
}

async function subContext(db, url) {
  const id = Number(url.searchParams.get('sub'));
  if (!id) return { html: '', payload: null };
  const s = await db.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first();
  if (!s) return { html: '', payload: null };
  const p = parsePayload(s.payload);
  return {
    payload: p,
    html: `<div class="ok"><b>From submission #${s.id}:</b> "${esc(p.detail || '')}"
${p.website ? `<br>${esc(p.website)}` : ''}</div>`,
  };
}

function editorForm(bar, { isNew = false, errors = [], saved = false, subHtml = '' } = {}) {
  const hh = bar.hh || [], hours = bar.hours || [];
  return `${topBar(isNew ? 'new bar' : bar.slug)}
${errors.length ? `<div class="err">${errors.map(esc).join('<br>')}</div>` : ''}
${saved ? '<div class="ok">Saved. Live on the site now.</div>' : ''}
${subHtml}
${!isNew ? `<p class="meta"><a href="/bar/${esc(bar.slug)}">View public page</a></p>` : ''}
<form method="post" action="${isNew ? '/admin/new' : `/admin/bar/${esc(bar.slug)}`}">
${isNew ? '<label>Slug (kebab-case, permanent)</label><input name="slug" value="' + esc(bar.slug || '') + '">' : ''}
<label>Name</label><input name="name" value="${esc(bar.name || '')}">
<div class="grid2">
<div><label>City</label>${sel('city', CITIES, bar.city)}</div>
<div><label>Neighborhood</label>${sel('neighborhood', HOODS, bar.neighborhood)}</div>
<div><label>Lat</label><input name="lat" inputmode="decimal" value="${bar.lat ?? ''}"></div>
<div><label>Lng</label><input name="lng" inputmode="decimal" value="${bar.lng ?? ''}"></div>
</div>
<label>Website</label><input name="website" value="${esc(bar.website || '')}">
<label>Address</label><input name="address" value="${esc(bar.address || '')}">
<div class="grid2">
<div><label>State</label><input name="state" value="${esc(bar.state || 'MN')}"></div>
<div><label>Zip</label><input name="zip" value="${esc(bar.zip || '')}"></div>
<div><label>Price</label>${sel('price', { 1: '$', 2: '$$', 3: '$$$', 4: '$$$$' }, String(bar.price || ''), '—')}</div>
<div><label>Category</label>${sel('category', CATEGORIES, bar.category, '—')}</div>
</div>
<label>Seating (comma labels)</label><input name="seating" value="${esc(bar.seating || '')}">
<label>Food (comma labels)</label><input name="food" value="${esc(bar.food || '')}">
<label>Notes (one short sentence)</label><textarea name="notes" rows="2">${esc(bar.notes || '')}</textarea>
<p>
<label class="inline"><input type="checkbox" name="patio"${bar.patio ? ' checked' : ''}>Patio</label>
<label class="inline"><input type="checkbox" name="rooftop"${bar.rooftop ? ' checked' : ''}>Rooftop</label>
<label class="inline"><input type="checkbox" name="skyway"${bar.skyway ? ' checked' : ''}>Skyway</label>
</p>
<p><label class="inline"><input type="checkbox" name="verified"${bar.verified ? ' checked' : ''}>Verified on the bar's own site</label></p>
<label>Verified date (blank = stamp today)</label><input type="date" name="last_verified" value="${esc(bar.last_verified || '')}">
<h2>Happy hour windows</h2>
${windowRows('hh', hh, true)}
<h2>Regular hours (optional)</h2>
${windowRows('ho', hours, false)}
<button>${isNew ? 'Create bar' : 'Save changes'}</button>
</form>`;
}

const BAR_UPDATE_COLS = ['name', 'city', 'neighborhood', 'lat', 'lng', 'website', 'patio',
  'rooftop', 'skyway', 'verified', 'last_verified', 'notes', 'price', 'category',
  'seating', 'food', 'hours', 'address', 'state', 'zip'];

function barBinds(bar, hoursArr) {
  const vals = { ...bar, hours: hoursArr.length ? JSON.stringify(hoursArr) : null };
  return BAR_UPDATE_COLS.map(c => vals[c] ?? null);
}

async function replaceHH(db, barId, windows) {
  await db.prepare('DELETE FROM happy_hours WHERE bar_id = ?').bind(barId).run();
  for (const w of windows)
    await db.prepare('INSERT INTO happy_hours (bar_id, dow_mask, start_min, end_min, deals) VALUES (?, ?, ?, ?, ?)')
      .bind(barId, w.dow_mask, w.start_min, w.end_min, w.deals).run();
}

async function editBarPage({ env, params, url }) {
  const bar = await barBySlug(env.DB, params.slug);
  if (!bar) return redirect('/admin');
  const { html: subHtml } = await subContext(env.DB, url);
  return page(bar.name, editorForm(bar, { saved: url.searchParams.has('saved'), subHtml }));
}

async function saveBar({ request, env, params }) {
  const db = env.DB;
  const before = await barBySlug(db, params.slug);
  if (!before) return redirect('/admin');
  const form = await request.formData();
  const { bar, errors } = barFromForm(form, params.slug);
  const hh = parseWindows(form, 'hh', { deals: true });
  const hoursArr = parseWindows(form, 'ho');
  if (!hh.length) errors.push('At least one happy hour window is required (it’s a happy hour site).');
  if (errors.length)
    return page(bar.name || params.slug, editorForm({ ...bar, hh, hours: hoursArr }, { errors }));
  if (bar.verified && !bar.last_verified) bar.last_verified = todayChicago();
  await db.prepare(`UPDATE bars SET ${BAR_UPDATE_COLS.map(c => `${c} = ?`).join(', ')} WHERE id = ?`)
    .bind(...barBinds(bar, hoursArr), before.id).run();
  await replaceHH(db, before.id, hh);
  await logAdmin(db, 'bar.update', params.slug,
    { ...before, hh: before.hh }, { ...bar, hours: hoursArr, hh });
  return redirect(`/admin/bar/${params.slug}?saved=1`);
}

async function newBarPage({ env, url }) {
  const { html: subHtml, payload } = await subContext(env.DB, url);
  const bar = payload ? { name: payload.name || '', website: payload.website || '' } : {};
  return page('New bar', editorForm(bar, { isNew: true, subHtml }));
}

async function createBar({ request, env }) {
  const db = env.DB;
  const form = await request.formData();
  const slug = String(form.get('slug') || '').trim();
  const { bar, errors } = barFromForm(form, slug);
  const hh = parseWindows(form, 'hh', { deals: true });
  const hoursArr = parseWindows(form, 'ho');
  if (!hh.length) errors.push('At least one happy hour window is required.');
  if (!errors.length && await db.prepare('SELECT 1 FROM bars WHERE slug = ?').bind(slug).first())
    errors.push(`Slug "${slug}" already exists.`);
  if (errors.length)
    return page('New bar', editorForm({ ...bar, slug, hh, hours: hoursArr }, { isNew: true, errors }));
  if (bar.verified && !bar.last_verified) bar.last_verified = todayChicago();
  await db.prepare(`INSERT INTO bars (slug, ${BAR_UPDATE_COLS.join(', ')})
    VALUES (?${', ?'.repeat(BAR_UPDATE_COLS.length)})`)
    .bind(slug, ...barBinds(bar, hoursArr)).run();
  const row = await db.prepare('SELECT id FROM bars WHERE slug = ?').bind(slug).first();
  await replaceHH(db, row.id, hh);
  await logAdmin(db, 'bar.create', slug, null, { ...bar, hours: hoursArr, hh });
  return redirect(`/admin/bar/${slug}?saved=1`);
}

// ---------- subscribers ----------

async function subscribersPage({ env }) {
  const rows = (await env.DB.prepare(
    'SELECT email, created_at FROM subscribers ORDER BY id DESC').all()).results;
  return page('Subscribers', `${topBar('subscribers')}
<p class="meta">${rows.length} total</p>
<table>${rows.map(r => `<tr><td>${esc(r.email)}</td><td class="meta">${esc(r.created_at)}</td></tr>`).join('')}</table>
<h2>Copy as CSV</h2>
<textarea rows="6" readonly>email,created_at\n${rows.map(r => `${r.email},${r.created_at}`).join('\n')}</textarea>`);
}

// ---------- wiring ----------

export function registerAdmin(router) {
  router.get('/admin', guard(dash));
  router.get('/admin/login', loginPage);
  router.post('/admin/login', doLogin);
  router.post('/admin/logout', guardPost(doLogout));
  router.get('/admin/new', guard(newBarPage));
  router.post('/admin/new', guardPost(createBar));
  router.get('/admin/subscribers', guard(subscribersPage));
  router.get('/admin/bar/:slug', guard(editBarPage));
  router.post('/admin/bar/:slug', guardPost(saveBar));
  router.post('/admin/submission/:id', guardPost(resolveSubmission));
}
