# 5PM MSP

Twin Cities happy hour finder — [5pmmsp.com](https://5pmmsp.com).
Free, no ads, location-aware, built for Minneapolis–St Paul.

- **Stack:** Cloudflare Worker (plain JS, zero npm deps) + D1 + static assets.
  Leaflet (CDN) on the map page only.
- **Design:** "Bottle Cap" — incandescent sign-craft after the Grain Belt sign.
  Tokens + rationale in `docs/plans/2026-07-13-build.md`.
- **Privacy:** geolocation and distance math are 100% client-side; location is
  never sent to the server.

## Develop

```
npm test           # unit tests (node:test)
npm run dev        # wrangler dev (local D1)
npm run seed:sql   # regenerate seed/seed.sql from seed/bars.json
```

Local DB: `wrangler d1 migrations apply 5pmmsp --local` then
`wrangler d1 execute 5pmmsp --local --file seed/seed.sql`.

## Deploy

`wrangler deploy` (needs CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID).
Remote DB: same two d1 commands with `--remote`.

## Data

`seed/bars.json` is the reviewable source of truth for the launch dataset.
`verified: 1` only when the deal is confirmed on the bar's own website
(`last_verified` date required). Everything else renders as unverified.
