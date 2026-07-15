import { createRouter } from './lib/router.js';
import { home, hoodPage, cityPage, barPage, submitPage, neighborhoodsPage, privacyPage, notFound } from './pages.js';
import { barsJson } from './api.js';
import { submitBar, reportBar, subscribe } from './forms.js';
import { sitemap, robots } from './seo.js';
import { hoodCounts } from './lib/data.js';

const router = createRouter();
router.get('/', home);
router.get('/submit', submitPage);
router.get('/neighborhoods', neighborhoodsPage);
router.get('/privacy', privacyPage);
router.get('/sitemap.xml', sitemap);
router.get('/robots.txt', robots);
router.get('/api/bars.json', barsJson);
router.post('/api/submit', submitBar);
router.post('/api/report', reportBar);
router.post('/api/subscribe', subscribe);
router.get('/bar/:slug', barPage);
router.get('/:city', cityPage);   // /minneapolis, /st-paul (returns null otherwise)
router.get('/:hood', hoodPage);   // /nordeast, /lowertown, …

export default {
  async fetch(request, env, ctx) {
    try {
      const res = await router.handle(request, env, ctx);
      if (res) return res;
      // Static assets (style.css, app.js, icons, manifest, sw.js)
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
      return notFound(await hoodCounts(env.DB));
    } catch (err) {
      console.error(err);
      return new Response(
        'Something broke on our end. Try again in a minute — the sign flickers sometimes.',
        { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } },
      );
    }
  },
};
