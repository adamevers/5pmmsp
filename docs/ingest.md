# Ingesting bars from listicle URLs

The repeatable process for adding venues to 5pmmsp from "best bars / happy hours"
listicles. This is the canonical prompt — paste the **Source URLs** block into a
worker and let it run the steps below. Keep it in sync with `seed/bars.json`'s
actual schema.

This is a **happy-hour-only** site: a venue earns a row only if it has a real
happy hour. No HH → it does not go in `bars.json`; it goes in `seed/skiplist.json`
so we never re-evaluate it.

## Source URLs

```
[one listicle URL per line]
```

## Step 1 — Extract venues from each URL

Fetch each page and pull every bar/restaurant named, plus any context given
(neighborhood, address, patio/rooftop flags).

**If a host blocks the fetch tools** (Thrillist blocks Anthropic's WebFetch *and*
WebSearch — "unable to fetch" / "domains not accessible to our user agent"):
curl it from the Pi with a browser User-Agent, then parse locally.

```
curl -sL -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
(KHTML, like Gecko) Chrome/126.0 Safari/537.36" "<url>" -o ~/cos/inbox/page.html
```

The Pi's own egress is fine (the guard will ask for approval on a new host — that's
expected; confirm and retry). Many modern listicles (Thrillist included) are
Next.js: the article body — including each venue's **official website URL** — is
JSON inside `<script id="__NEXT_DATA__" type="application/json">`. Extract that
blob and walk it rather than scraping rendered HTML; the embedded official URLs
save a search per venue in Step 3.

## Step 2 — Dedupe against BOTH bars.json and skiplist.json

Normalize each name (lowercase, drop a leading "the ", strip punctuation) and
check it against **both**:

- `seed/bars.json` → if present, log `already in dataset: [name]` and skip.
- `seed/skiplist.json` → if present, log `previously skipped: [name] ([reason])`
  and skip **without re-fetching its site**.

Only genuinely-new names proceed to Step 3. Exception: re-verify a skiplist entry
only if you have specific reason to think it changed (a `closed` venue reopened, a
`no-happy-hour` venue launched one) — the entry's `checked` date tells you how
stale it is.

## Step 3 — Verify each new venue on its OWN official website

1. Find the official site (the bar's own domain — never Yelp/Google/Untappd/a
   listicle). The `__NEXT_DATA__` blob from Step 1 often already has it.
2. Look for happy hour on Menu / Specials / Happy Hour / Events / Deals pages.
3. HH explicitly states days + times + deals on the official site → `verified: 1`,
   set `last_verified` to today, record everything.
4. HH found only on third-party sites (localfriend, thriftlist, totalhappyhour,
   visit-* guides) → `verified: 0`, note the source in `notes`.
5. **No happy hour anywhere** → do NOT add. Append to `skiplist.json` with
   `reason: "no-happy-hour"`.
6. **Permanently closed** → append to `skiplist.json` with `reason: "closed"`.
7. **Outside the covered cities** → append to `skiplist.json` with
   `reason: "out-of-scope"`.

## Step 4 — Build the bar object

Match `seed/bars.json` exactly. Current shape (see the `_readme` in that file for
field notes):

```json
{
  "slug": "unique-kebab-case",
  "name": "Full Bar Name",
  "city": "minneapolis",
  "neighborhood": "nordeast",
  "lat": 44.9845, "lng": -93.2712,
  "website": "https://official-site",
  "phone": "+16125551234",
  "instagram": "handle_no_at_sign",
  "patio": 0, "rooftop": 0, "skyway": 0,
  "price": 2,
  "category": "bar-restaurant",
  "seating": "Booths, Bar stools",
  "food": "Burgers, Wings",
  "verified": 1,
  "last_verified": "2026-07-14",
  "hours": [{ "dow_mask": 31, "start_min": 660, "end_min": 1440 }],
  "hh": [{ "dow_mask": 31, "start_min": 900, "end_min": 1080, "deals": "$5 taps, half-price apps" }],
  "notes": "One short sentence."
}
```

- `dow_mask` bit0=Mon … bit6=Sun. Mon–Fri=31, every day=127, Fri=16, Sat+Sun=96.
- Times = minutes since midnight (3 PM=900, 6 PM=1080). Cross-midnight → `end_min < start_min`.
- `category`: `cocktail-bar` | `bar-restaurant` | `dive-bar` | `lounge`. Breweries/taprooms → `bar-restaurant`.
- `hours` (regular open hours) is **optional** — a backfill pass fills it; omit it
  rather than guessing.
- `phone`: E.164 (`+1` + 10 digits). Same sourcing rule as the deal itself — take
  it off the bar's **own site only**, never a directory. Omit rather than guess.
  On a multi-location chain page, match the number to the street address; if you
  can't tell which is which, omit it. `scripts/phones.js` backfills in bulk:
  `list` prints what's missing, `merge` normalizes results in (rejecting anything
  that isn't a valid US number), `sql` emits phone/instagram-only UPDATEs.
- `instagram`: handle only, no `@`, no URL. Feeds `sameAs` in the bar's JSON-LD
  and the tagging list for social posts.
- `last_verified` required when `verified: 1`, omit when `0`.
- New `city` or `neighborhood`? Register the slug in `src/lib/data.js` (`CITIES` /
  `HOODS`) or the page 404s, and redeploy the worker.

## Step 5 — Load, test, ship

**D1 is the source of truth** (admin edits at /admin land there first). ALWAYS
refresh `bars.json` from D1 before merging your edits, or a stale file will
overwrite them. The seed SQL is slug-keyed upserts — bar ids are stable, and
running it never deletes bars (removals are an explicit skiplist + manual
DELETE step).

```
# 0) refresh bars.json from prod D1 FIRST, then re-apply your edits on top:
~/cos/scripts/vault run /cos -- sh -c 'export CLOUDFLARE_API_TOKEN=$COS_CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=$COS_CLOUDFLARE_ACCOUNT_ID; cd ~/5pmmsp && node scripts/export.js'
node scripts/seed.js                       # regenerate seed/seed.sql (prints bar/window counts)
node scripts/og-pages.js                   # per-page share images (name/deal/window are baked in)
npm test                                   # must stay green
# apply to prod D1 (token remap via vault):
~/cos/scripts/vault run /cos -- sh -c 'export CLOUDFLARE_API_TOKEN=$COS_CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=$COS_CLOUDFLARE_ACCOUNT_ID; cd ~/5pmmsp && npx wrangler d1 execute 5pmmsp --remote --file ~/5pmmsp/seed/seed.sql'
# only if you added a city/neighborhood slug, redeploy:
~/cos/scripts/vault run /cos -- sh -c 'export CLOUDFLARE_API_TOKEN=$COS_CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=$COS_CLOUDFLARE_ACCOUNT_ID; cd ~/5pmmsp && npx wrangler deploy'
```

**OG images bake in the data.** Each bar's share card carries its name, window
and deal, so a changed deal means a stale preview until `scripts/og-pages.js`
re-runs. Rendering is deterministic, so unchanged bars come out byte-identical
and git only stores what actually moved. `npm test` fails if a bar has no image.

### Adding a COLUMN: do not use the migrations runner on prod

`wrangler d1 migrations apply 5pmmsp --remote` **fails** against prod. The
remote DB was never registered with the runner, so it tries to replay every
migration from `0001` and dies on `duplicate column name: price` (which is also
why `0002_catchup.sql` says not to run it there). It fails before applying
anything, so it is safe but useless.

Add the column with a direct statement instead, then commit a migration file so
a fresh local DB still builds:

```
~/cos/scripts/vault run /cos -- sh -c 'export CLOUDFLARE_API_TOKEN=$COS_CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=$COS_CLOUDFLARE_ACCOUNT_ID; cd ~/5pmmsp && npx wrangler d1 execute 5pmmsp --remote --command "ALTER TABLE bars ADD COLUMN foo TEXT;"'
```

To backfill one column across many bars, emit **targeted UPDATEs** rather than
running the full seed (which upserts every column and would overwrite admin
edits made since the last export). `scripts/phones.js sql` is the worked
example.

Commit `seed/bars.json`, `seed/skiplist.json`, and `src/lib/data.js` together
(never commit `seed/seed.sql` — it's gitignored/generated). Push via the
`COS_GH_TOKEN` remote. `bars.json` is edited by multiple sessions — expect a
fast-forward, not a conflict, but pull if the push rejects.

## Report

Venues extracted · already in dataset · previously skipped · added+verified ·
added unverified · newly skipped (with reason) · new cities/neighborhoods.

## Re-verify queue (check this EVERY ingest/data session)

When Adam accepts a user report in /admin, the bar joins the re-verify queue.
Pull it, re-check each bar's happy hour on its OWN official site (Step 3 rules),
fix the data (via /admin editor or bars.json+seed), then mark the row done:

```
# list queued re-verifications:
~/cos/scripts/vault run /cos -- sh -c 'export CLOUDFLARE_API_TOKEN=$COS_CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=$COS_CLOUDFLARE_ACCOUNT_ID; cd ~/5pmmsp && npx wrangler d1 execute 5pmmsp --remote --json --command "SELECT s.id, b.slug, b.website, s.payload FROM submissions s JOIN bars b ON b.id = s.bar_id WHERE s.verify_status = ''queued''"'
# after fixing a bar, mark its row done:
#   UPDATE submissions SET verify_status = 'done' WHERE id = <id>;
```

## skiplist.json reasons

`closed` · `no-happy-hour` · `out-of-scope` · `duplicate`. Each entry:
`{ name, reason, checked, note?, source? }`.
