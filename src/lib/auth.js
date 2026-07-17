// Admin auth: ADMIN_TOKEN secret + HMAC-signed session cookie. Zero deps —
// WebCrypto only (same API in Workers and node:test). CF Access can replace
// this later without touching the handlers (swap isAdmin's implementation).

const COOKIE = 'adm';
const SESSION_DAYS = 30;
const enc = new TextEncoder();

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time equality via double-HMAC (avoids char-by-char comparison leaks). */
export async function safeEqual(a, b, secret) {
  const [ha, hb] = await Promise.all([hmacHex(secret, `.${a}`), hmacHex(secret, `.${b}`)]);
  return ha === hb;
}

/** Does the submitted login token match env.ADMIN_TOKEN? */
export async function tokenOk(submitted, env) {
  if (!env.ADMIN_TOKEN || !submitted) return false;
  return safeEqual(String(submitted), env.ADMIN_TOKEN, env.ADMIN_TOKEN);
}

/** Set-Cookie value for a fresh admin session. */
export async function sessionCookie(env, now = Date.now()) {
  const exp = Math.floor(now / 1000) + SESSION_DAYS * 86400;
  const sig = await hmacHex(env.ADMIN_TOKEN, `session.${exp}`);
  return `${COOKIE}=${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

export const clearCookie = () =>
  `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/** Is this request an authenticated admin session? */
export async function isAdmin(request, env, now = Date.now()) {
  if (!env.ADMIN_TOKEN) return false;
  const cookies = request.headers.get('cookie') || '';
  const m = cookies.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [expStr, sig] = m[1].split('.');
  const exp = Number(expStr);
  if (!exp || !sig || exp * 1000 < now) return false;
  const expect = await hmacHex(env.ADMIN_TOKEN, `session.${exp}`);
  return safeEqual(sig, expect, env.ADMIN_TOKEN);
}

/** Admin POSTs must come from our own origin (belt over SameSite=Lax braces). */
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // same-origin form posts may omit it; cookie already gates
  return new URL(origin).host === new URL(request.url).host;
}
