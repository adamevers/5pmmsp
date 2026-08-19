-- Heart counts, as a tally only.
--
-- The heart list itself stays in the visitor's own localStorage — that promise
-- on /privacy doesn't change. What lands here is a single integer per bar:
-- "hearts: 34". No device id, no session, no row per person, so there is
-- nothing to join back to anyone. Unhearting decrements, floored at zero.
CREATE TABLE IF NOT EXISTS fav_counts (
  slug    TEXT PRIMARY KEY,
  n       INTEGER NOT NULL DEFAULT 0,
  updated TEXT NOT NULL DEFAULT (datetime('now'))
);
