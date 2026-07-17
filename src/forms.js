// POST handlers: submit (new bar), report (change), subscribe (newsletter).
// All Turnstile-verified server-side + honeypot ('website2' must be empty).

async function turnstileOk(request, form, env) {
  const token = form.get('cf-turnstile-response');
  // Newsletter form (in the footer of every page) skips the widget; honeypot +
  // rate-limited endpoint carry it. Widget forms must present a token.
  if (token == null) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET || '1x0000000000000000000000000000000AA', // test secret: always passes
      response: token,
      remoteip: request.headers.get('cf-connecting-ip') || '',
    }),
  });
  const data = await res.json();
  return !!data.success;
}

const back = (path, params = '') =>
  new Response(null, { status: 302, headers: { location: `${path}${params}` } });

const bad = msg => new Response(msg, { status: 400 });

export async function submitBar({ request, env }) {
  const form = await request.formData();
  if (form.get('website2')) return back('/submit', '?ok=1'); // honeypot: pretend success
  if (!await turnstileOk(request, form, env)) return bad('Verification failed — go back and retry.');
  const payload = {
    name: form.get('name'), neighborhood: form.get('neighborhood'),
    detail: form.get('detail'), website: form.get('website') || '',
  };
  if (!payload.name || !payload.detail) return bad('Name and happy hour details are required.');
  await env.DB.prepare("INSERT INTO submissions (kind, payload) VALUES ('new', ?)")
    .bind(JSON.stringify(payload)).run();
  return back('/submit', '?ok=1');
}

export async function reportBar({ request, env }) {
  const form = await request.formData();
  const barId = Number(form.get('bar_id'));
  const bar = barId
    ? await env.DB.prepare('SELECT slug FROM bars WHERE id = ?').bind(barId).first()
    : null;
  if (!bar) return bad('Unknown bar.');
  if (form.get('website2')) return back(`/bar/${bar.slug}`, '?ok=report');
  if (!await turnstileOk(request, form, env)) return bad('Verification failed — go back and retry.');
  const detail = form.get('detail');
  if (!detail) return bad('Tell us what changed.');
  await env.DB.prepare("INSERT INTO submissions (kind, bar_id, payload) VALUES ('report', ?, ?)")
    .bind(barId, JSON.stringify({ detail, slug: bar.slug })).run();
  return back(`/bar/${bar.slug}`, '?ok=report');
}

export async function subscribe({ request, env }) {
  const form = await request.formData();
  if (form.get('website2')) return back('/', '?subscribed=1');
  const email = String(form.get('email') || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad('That email doesn\'t look right — go back and retry.');
  try {
    await env.DB.prepare('INSERT INTO subscribers (email) VALUES (?)').bind(email).run();
  } catch (e) {
    if (!/UNIQUE/.test(String(e))) throw e; // already subscribed = fine
  }
  return back('/', '?subscribed=1');
}
