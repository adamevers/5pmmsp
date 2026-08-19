-- Anti-stuffing for heart tallies, without keeping anything identifying.
--
-- The problem: /api/fav is a public endpoint, so a loop could mint thousands
-- of hearts for one bar. The usual fix is "one vote per person", which means
-- knowing who people are — exactly what /privacy promises we don't do.
--
-- The compromise: we never store an IP. We store an HMAC of
-- (rotating daily salt + IP + slug). That key answers ONE question — "has this
-- key already been counted today?" — and nothing else:
--   * it can't be reversed (HMAC over a server-side secret),
--   * it can't be linked to yesterday or tomorrow (the salt includes the date),
--   * it can't be looked up by IP by anyone without the secret.
-- Rows are pruned after two days, so the window of even that is short.
CREATE TABLE IF NOT EXISTS fav_guard (
  k   TEXT PRIMARY KEY,
  day TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fav_guard_day ON fav_guard (day);

-- Same trick, keyed on the sender alone: a per-day ceiling on how many hearts
-- one source may cast across the whole site, so mass-hearting every bar is
-- capped even though each individual bar looks legitimate.
CREATE TABLE IF NOT EXISTS fav_rate (
  k   TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  n   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_fav_rate_day ON fav_rate (day);
