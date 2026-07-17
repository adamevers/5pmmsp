import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenOk, sessionCookie, isAdmin, sameOrigin } from '../src/lib/auth.js';
import { minutesFromTime, timeFromMinutes, parseWindows, barFromForm } from '../src/lib/adminform.js';

const env = { ADMIN_TOKEN: 'test-secret-token' };
const req = (cookie, url = 'https://5pmmsp.com/admin') =>
  new Request(url, { headers: cookie ? { cookie } : {} });

test('login token: match, mismatch, unconfigured', async () => {
  assert.equal(await tokenOk('test-secret-token', env), true);
  assert.equal(await tokenOk('wrong', env), false);
  assert.equal(await tokenOk('', env), false);
  assert.equal(await tokenOk('anything', { ADMIN_TOKEN: '' }), false);
});

test('session cookie round-trips', async () => {
  const setCookie = await sessionCookie(env);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  const value = setCookie.split(';')[0]; // adm=exp.sig
  assert.equal(await isAdmin(req(value), env), true);
});

test('expired and tampered sessions rejected', async () => {
  const value = (await sessionCookie(env)).split(';')[0];
  const farFuture = Date.now() + 31 * 86400 * 1000;
  assert.equal(await isAdmin(req(value), env, farFuture), false, 'expired');
  const [name, v] = value.split('=');
  const [exp, sig] = v.split('.');
  assert.equal(await isAdmin(req(`${name}=${exp}.${'0'.repeat(sig.length)}`), env), false, 'bad sig');
  assert.equal(await isAdmin(req(`${name}=${Number(exp) + 999}.${sig}`), env), false, 'edited expiry');
  assert.equal(await isAdmin(req(null), env), false, 'no cookie');
  assert.equal(await isAdmin(req(value), { ADMIN_TOKEN: '' }), false, 'no secret configured');
});

test('sameOrigin checks the Origin header when present', () => {
  const mk = origin => new Request('https://5pmmsp.com/admin/bar/x',
    { method: 'POST', headers: origin ? { origin } : {} });
  assert.equal(sameOrigin(mk('https://5pmmsp.com')), true);
  assert.equal(sameOrigin(mk('https://evil.example')), false);
  assert.equal(sameOrigin(mk(null)), true);
});

test('time helpers', () => {
  assert.equal(minutesFromTime('15:00'), 900);
  assert.equal(minutesFromTime('9:05'), 545);
  assert.equal(minutesFromTime(''), null);
  assert.equal(minutesFromTime('25:00'), null);
  assert.equal(timeFromMinutes(900), '15:00');
  assert.equal(timeFromMinutes(1440), '00:00');
});

test('parseWindows: rows, midnight end, skips incomplete', () => {
  const f = new URLSearchParams([
    // row 0: Mon-Fri 15:00-18:00 with deals
    ['hh0d0', 'on'], ['hh0d1', 'on'], ['hh0d2', 'on'], ['hh0d3', 'on'], ['hh0d4', 'on'],
    ['hh0s', '15:00'], ['hh0e', '18:00'], ['hh0deals', '$5 taps'],
    // row 1: Sat, ends midnight (00:00 -> 1440)
    ['hh1d5', 'on'], ['hh1s', '22:00'], ['hh1e', '00:00'], ['hh1deals', 'late night'],
    // row 2: days but no times — skipped
    ['hh2d0', 'on'], ['hh2deals', 'nope'],
    // row 3: times but no deals — skipped (deals required)
    ['hh3d0', 'on'], ['hh3s', '15:00'], ['hh3e', '18:00'],
  ]);
  assert.deepEqual(parseWindows(f, 'hh', { deals: true }), [
    { dow_mask: 31, start_min: 900, end_min: 1080, deals: '$5 taps' },
    { dow_mask: 32, start_min: 1320, end_min: 1440, deals: 'late night' },
  ]);
  // regular hours: same row shape, no deals requirement
  const h = new URLSearchParams([['ho0d0', 'on'], ['ho0s', '11:00'], ['ho0e', '23:00']]);
  assert.deepEqual(parseWindows(h, 'ho'), [{ dow_mask: 1, start_min: 660, end_min: 1380 }]);
});

test('barFromForm validates and normalizes', () => {
  const good = new URLSearchParams({
    name: 'Test Bar', city: 'minneapolis', neighborhood: 'nordeast',
    lat: '45.0', lng: '-93.2', website: 'https://x.example', price: '2',
    category: 'dive-bar', verified: 'on', last_verified: '2026-07-01',
  });
  const ok = barFromForm(good, 'test-bar');
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.bar.verified, 1);
  assert.equal(ok.bar.price, 2);

  const bad = barFromForm(new URLSearchParams({
    name: '', city: 'gotham', neighborhood: 'nowhere', lat: 'x', lng: '', price: '9',
  }), 'Bad Slug!');
  assert.ok(bad.errors.length >= 5);
  assert.ok(bad.errors.some(e => e.includes('gotham')));

  // unverified clears last_verified
  const un = barFromForm(new URLSearchParams({
    name: 'X', city: 'minneapolis', neighborhood: 'nordeast', lat: '45', lng: '-93',
    last_verified: '2026-01-01',
  }), 'x');
  assert.equal(un.bar.verified, 0);
  assert.equal(un.bar.last_verified, null);
});
