-- 5pmmsp initial schema. dow_mask bit 0=Mon … 6=Sun; times are minutes
-- since midnight America/Chicago; end_min <= start_min crosses midnight.
CREATE TABLE bars (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  city TEXT NOT NULL,               -- 'minneapolis' | 'st-paul'
  neighborhood TEXT NOT NULL,       -- slug, e.g. 'nordeast'
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  website TEXT,
  patio INTEGER NOT NULL DEFAULT 0,
  rooftop INTEGER NOT NULL DEFAULT 0,
  skyway INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  last_verified TEXT,               -- ISO date, required when verified=1
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_bars_neighborhood ON bars(neighborhood);
CREATE INDEX idx_bars_city ON bars(city);

CREATE TABLE happy_hours (
  id INTEGER PRIMARY KEY,
  bar_id INTEGER NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  dow_mask INTEGER NOT NULL,
  start_min INTEGER NOT NULL,
  end_min INTEGER NOT NULL,
  deals TEXT NOT NULL
);
CREATE INDEX idx_hh_bar ON happy_hours(bar_id);

CREATE TABLE submissions (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('new','report')),
  bar_id INTEGER REFERENCES bars(id),
  payload TEXT NOT NULL,            -- JSON
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE subscribers (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  confirmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
