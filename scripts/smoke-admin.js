// End-to-end smoke of /admin against a running `wrangler dev` (local D1).
//   npx wrangler dev --port 8787 --var ADMIN_TOKEN:smoke-test-token &
//   node scripts/smoke-admin.js
// Env: SMOKE_BASE (default http://127.0.0.1:8787), SMOKE_TOKEN (default smoke-test-token).
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:8787';
const TOKEN = process.env.SMOKE_TOKEN || 'smoke-test-token';

let failures = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'ok' : 'FAIL'} - ${name}${cond ? '' : ` ${extra}`}`);
  if (!cond) failures++;
};
const form = o => new URLSearchParams(o).toString();
const post = (path, body, cookie = '') => fetch(BASE + path, {
  method: 'POST', redirect: 'manual',
  headers: { 'content-type': 'application/x-www-form-urlencoded',
    origin: BASE, ...(cookie ? { cookie } : {}) },
  body,
});
const get = (path, cookie = '') => fetch(BASE + path,
  { redirect: 'manual', headers: cookie ? { cookie } : {} });

// --- auth gate ---
let r = await get('/admin');
ok('GET /admin unauthenticated -> login redirect', r.status === 302 &&
  r.headers.get('location') === '/admin/login', `got ${r.status} ${r.headers.get('location')}`);

r = await get('/admin/login');
ok('login page renders', r.status === 200 && (await r.text()).includes('Admin token'));

r = await post('/admin/login', form({ token: 'wrong' }));
ok('wrong token bounced', r.status === 302 && r.headers.get('location').includes('failed=1'));

r = await post('/admin/login', form({ token: TOKEN }));
const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
ok('right token sets session', r.status === 302 && cookie.startsWith('adm='), r.headers.get('set-cookie') || 'no cookie');

// --- dashboard ---
r = await get('/admin', cookie);
let html = await r.text();
ok('dashboard renders with stats + queue', r.status === 200 &&
  html.includes('Pending submissions') && html.includes('re-verify queue'));
ok('dashboard is no-store + noindex', r.headers.get('cache-control') === 'no-store' &&
  (r.headers.get('x-robots-tag') || '').includes('noindex'));

const subMatch = html.match(/\/admin\/submission\/(\d+)/);
ok('seeded pending submission visible', !!subMatch, 'seed a pending report first');

// --- bar search + editor ---
r = await get('/admin?q=tony', cookie);
html = await r.text();
const slugMatch = html.match(/\/admin\/bar\/([a-z0-9-]+)/);
ok('bar search finds a bar', !!slugMatch);
const slug = slugMatch ? slugMatch[1] : 'tony-jaros-river-garden';

r = await get(`/admin/bar/${slug}`, cookie);
html = await r.text();
ok('editor renders with windows', r.status === 200 && html.includes('Happy hour windows')
  && html.includes('name="hh0deals"'));

// pull current field values out of the form to build a valid save
const val = n => (html.match(new RegExp(`name="${n}"[^>]*? value="([^"]*)"`)) || [])[1] || '';
const selVal = n => (html.match(new RegExp(`name="${n}">[^]*?<option value="([^"]*)" selected`)) || [])[1] || '';
const body = form({
  name: val('name') + '', city: selVal('city'), neighborhood: selVal('neighborhood'),
  lat: val('lat'), lng: val('lng'), website: val('website'), address: val('address'),
  state: val('state'), zip: val('zip'), seating: val('seating'), food: val('food'),
  notes: 'Smoke-test note.', verified: 'on', last_verified: '',
  hh0d0: 'on', hh0d1: 'on', hh0d2: 'on', hh0d3: 'on', hh0d4: 'on',
  hh0s: '15:00', hh0e: '18:00', hh0deals: '$5 smoke-test taps',
});
r = await post(`/admin/bar/${slug}`, body, cookie);
ok('bar save round-trips', r.status === 302 && r.headers.get('location').includes('saved=1'),
  `got ${r.status} ${r.headers.get('location')}`);

r = await get(`/bar/${slug}`);
html = await r.text();
ok('edit is live on the public page', html.includes('$5 smoke-test taps'));

// verified with blank date should have stamped today (editor shows it)
r = await get(`/admin/bar/${slug}`, cookie);
html = await r.text();
ok('verified auto-stamped last_verified', /name="last_verified" value="\d{4}-\d{2}-\d{2}"/.test(html));

// invalid save re-renders with errors, does not 302
r = await post(`/admin/bar/${slug}`, form({ name: '', city: 'gotham', neighborhood: 'x', lat: 'x', lng: '' }), cookie);
ok('invalid save shows errors', r.status === 200 && (await r.text()).includes('required'));

// --- submission triage ---
if (subMatch) {
  const id = subMatch[1];
  r = await post(`/admin/submission/${id}`, form({ do: 'accept', note: 'smoke' }), cookie);
  ok('accept report -> bar editor', r.status === 302 &&
    r.headers.get('location').includes('/admin/bar/'), r.headers.get('location'));
  r = await get('/admin', cookie);
  html = await r.text();
  ok('accepted report joins re-verify queue', /<b>1<\/b><span>re-verify queue/.test(html));
  ok('queue cleared', !html.includes(`/admin/submission/${id}`));
}

// --- subscribers + public unaffected ---
r = await get('/admin/subscribers', cookie);
ok('subscribers page renders', r.status === 200 && (await r.text()).includes('Copy as CSV'));

r = await get('/robots.txt');
ok('robots disallows /admin', (await r.text()).includes('Disallow: /admin'));

r = await get('/');
ok('public home still 200', r.status === 200);

// POST guards: no cookie and bad origin
r = await post(`/admin/bar/${slug}`, body);
ok('POST without session bounced', r.status === 302);
r = await fetch(BASE + `/admin/bar/${slug}`, { method: 'POST', redirect: 'manual',
  headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example', cookie }, body });
ok('POST from foreign origin 403', r.status === 403, `got ${r.status}`);

console.log(failures ? `\n${failures} FAILURES` : '\nall smoke checks passed');
process.exit(failures ? 1 : 0);
