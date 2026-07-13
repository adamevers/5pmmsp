// Minimal router: exact segments + ':param' captures. First match wins.
export function createRouter() {
  const routes = [];
  const add = (method, pattern, handler) =>
    routes.push({ method, parts: pattern.split('/').filter(Boolean), handler });
  return {
    get: (p, h) => add('GET', p, h),
    post: (p, h) => add('POST', p, h),
    async handle(request, env, ctx) {
      const url = new URL(request.url);
      const segs = url.pathname.split('/').filter(Boolean);
      for (const r of routes) {
        if (r.method !== request.method) continue;
        if (r.parts.length !== segs.length) continue;
        const params = {};
        let ok = true;
        for (let i = 0; i < r.parts.length; i++) {
          if (r.parts[i].startsWith(':')) params[r.parts[i].slice(1)] = decodeURIComponent(segs[i]);
          else if (r.parts[i] !== segs[i]) { ok = false; break; }
        }
        if (ok) {
          // A handler may return null ("not mine") — keep trying later routes,
          // e.g. /:city falls through to /:hood for the same one-segment path.
          const out = await r.handler({ request, env, ctx, url, params });
          if (out) return out;
        }
      }
      return null; // caller falls through (assets, then 404)
    },
  };
}
