# 5PM MSP Admin UI Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement task-by-task. Checkboxes track progress.
> Open questions at the bottom need Adam's answers before Task 1.

**Goal:** A phone-first `/admin` on 5pmmsp.com so Adam can triage submissions, fix bar
data live, and watch site health, all without opening a laptop or waiting on a worker run.

**Decisions (Adam, 2026-07-16):** auth = built-in token + signed cookie (not CF Access);
Option B approved (D1 becomes source of truth); accepting a report ALSO queues that bar
for ingest-worker re-verification (v1, via `submissions.verify_status`, polled by the
CoS side — the Pi is tailnet-only so the CF worker can't push to it).

**Why now:** `POST /api/report` and `/api/submit` write to D1 `submissions` and *nothing
reads it*: user reports (the site's best data source) currently rot. There's already a
pending row (id 1, a test report against bar 129). Verified data also goes stale
(`last_verified` never re-checked), and subscribers accumulate invisibly.

## What exists (relevant facts)

- One CF Worker, zero npm deps, hand-rolled router (`src/lib/router.js`), SSR via
  `src/lib/html.js`. D1 binding `DB`. Assets via `ASSETS`.
- Tables: `bars`, `happy_hours`, `submissions(kind,bar_id,payload,status)`,
  `subscribers`. Prod `bars` has grown columns beyond `migrations/0001_init.sql`
  (`price,category,seating,food,hours,address,state,zip`: ALTERs were applied ad-hoc
  and never captured as a migration).
- **Data pipeline:** `seed/bars.json` (repo, canonical) → `scripts/seed.js` →
  `seed/seed.sql` → `wrangler d1 execute --remote`. The generated SQL does
  `DELETE FROM happy_hours; DELETE FROM bars;` and reinserts with `id = array index + 1`.

## The architectural decision (blocks everything else)

Today a direct D1 edit is erased by the next reseed, and bar ids are **positional**:
an insert mid-array shifts every id after it, silently re-pointing old
`submissions.bar_id` at the wrong bar. An admin UI that edits D1 is pointless until
this is fixed.

**Recommendation: flip source of truth to D1 (Option B).**

- `scripts/seed.js` emits **slug-keyed upserts** (`INSERT … ON CONFLICT(slug) DO
  UPDATE`), never `DELETE FROM bars`, never explicit ids. HH rows: delete+reinsert
  *per upserted bar* via `(SELECT id FROM bars WHERE slug=…)`. Ids become stable
  D1-assigned keys; `submissions.bar_id` stops drifting; admin edits survive ingest.
- New `scripts/export.js` regenerates `seed/bars.json` **from D1** (sorted by slug,
  stable field order) so the repo keeps a versioned, diffable snapshot and ingest
  workers keep deduping against it. Run after admin-edit sessions / before ingest merges.
- Ingest flow (`docs/ingest.md`) barely changes: workers still edit `bars.json` and run
  seed. Step 5 gains "run export first, commit the refreshed snapshot".

Fallback (Option A, if Adam says no): admin is triage-only, meaning status changes and
notes on submissions but no bar editing; data fixes stay with ingest workers. Cuts
Tasks 4–5 below.

## Auth

**Recommendation: Cloudflare Access** (Zero Trust, free tier) in front of `/admin*`:
Google SSO from the phone, revocable, no password to type, service tokens later for
automation. Worker verifies the `Cf-Access-Jwt-Assertion` JWT (WebCrypto RS256 against
the team's cached certs, ~50 lines, still zero deps). Vars: `ACCESS_TEAM_DOMAIN`,
`ACCESS_AUD`. Setup is dashboard clicks, unaffected by the API-token perms gap that
blocked the custom-domain route attach.

Fallback if no dashboard setup wanted: `ADMIN_TOKEN` secret + login form → HMAC-signed
HttpOnly cookie (`src/lib/auth.js`, also ~50 lines). Either way: `Disallow: /admin` in
robots.txt, `Cache-Control: no-store` on every admin response, Origin check + per-form
nonce on admin POSTs.

## v1 scope

### Task 1: Migration 0002 (catch-up + admin tables)
**Files:** `migrations/0002_admin.sql`
- [x] Capture the ad-hoc prod ALTERs (`price,category,seating,food,hours,address,state,zip`)
      as guarded ALTERs so local/dev D1 matches prod.
- [x] `ALTER TABLE submissions ADD resolved_at TEXT; ADD resolution TEXT;` +
      `CREATE INDEX idx_submissions_status ON submissions(status);`
- [x] `CREATE TABLE admin_log (id, ts, action, subject, before TEXT, after TEXT)`:
      every admin mutation appends (audit + the escape hatch if an edit goes wrong).

### Task 2: Seed pipeline → upserts (the Option B flip)
**Files:** `scripts/seed.js`, `scripts/export.js`, `docs/ingest.md`
- [x] seed.js: slug-keyed upsert SQL, no explicit ids, per-bar HH replace. Deleting a
      bar = explicit skiplist step, not implicit omission.
- [x] export.js: D1 → `seed/bars.json` (stable ordering; keeps `_readme`).
- [x] ingest.md step 5: export → merge → seed → commit both.
- [x] `node --test`: upsert SQL emit + export/import round-trip on a fixture.

### Task 3: Auth + admin shell
**Files:** `src/lib/auth.js`, `src/admin.js`, `src/worker.js`, `src/seo.js`, `wrangler.jsonc`
- [x] Access JWT verify (or cookie fallback per Adam's answer), applied to `/admin*`
      route group; 401 page with login pointer.
- [x] Admin layout: Bottle Cap tokens, utilitarian, thumb-sized tap targets.
- [x] robots Disallow + no-store headers.

### Task 4: Dashboard + submissions queue
**Files:** `src/admin.js`
- [x] `GET /admin`: stat row (bars, verified %, pending submissions, subscribers,
      stale-verified count >90d) + pending queue.
- [x] Queue cards render payload human-readably (report: bar name + "what changed";
      new: all fields), relative time, link to public bar page.
- [x] `POST /admin/submission/:id`: accept / reject / note. Accept on a `report` →
      opens that bar's editor prefilled; accept on a `new` → opens add-bar form
      prefilled from payload. Resolving stamps `resolved_at` + `resolution`.
- [x] Store `slug` in report payloads at submit time (one-line `forms.js` change) so
      old-id drift can never mislabel a queue card again.

### Task 5: Bar editor + add bar
**Files:** `src/admin.js`
- [x] `GET/POST /admin/bar/:slug`: edit name, city/hood (datalist from `CITIES`/`HOODS`),
      coords, website, flags, price, category, seating, food, notes, verified +
      `last_verified` (verify checkbox auto-stamps today).
- [x] HH windows editor: rows of [day checkboxes → dow_mask] + start/end selects +
      deals text; add/remove row. Same widget reused for regular `hours` (same shape).
- [x] `GET/POST /admin/new`: same form, empty; validates slug uniqueness.
- [x] Every save: `admin_log` before/after JSON; D1 write; changed pages reflect
      immediately (SSR reads live).

### Task 6: Subscribers + deploy
**Files:** `src/admin.js`
- [x] `GET /admin/subscribers`: count, list, copy-as-CSV.
- [x] Deploy via vault-remapped wrangler; smoke `/admin` auth-gated, queue renders,
      an edit round-trips, `admin_log` rows land; triage/delete the test report (id 1).

## v2 (explicitly later)
Verification work-queue (stalest `last_verified` first, one-tap "still right → bump");
accept-report auto-enqueues a CoS ingest-worker check of the bar's official site;
analytics-lite (Workers Analytics Engine); newsletter compose/send; D1 scheduled backup
(`wrangler d1 export` weekly).

## Open questions for Adam
1. **Auth:** Cloudflare Access (Google SSO, ~10 min one-time dashboard setup; recommended)
   or built-in token+cookie (zero dashboard)?
2. **Source of truth:** OK to flip bars/HH truth to D1 with `bars.json` as generated
   snapshot (Option B, recommended: it's what makes phone-fixes real)?
3. **Relay tie-in:** should accepting a report also ping the CoS worker to re-verify
   that bar's official site, or stay standalone in v1?

**Estimate:** one focused builder session for Tasks 1–6, plus Adam's 10 minutes in the
CF dashboard if Access. Option A instead of B cuts roughly a third.
