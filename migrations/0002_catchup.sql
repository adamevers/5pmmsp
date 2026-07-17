-- Catch-up: columns added to prod ad-hoc between 0001 and 2026-07-16 (price,
-- category, seating, food, regular hours JSON, street address). ALREADY APPLIED
-- to the remote 5pmmsp D1 — do NOT run there (SQLite has no ADD COLUMN IF NOT
-- EXISTS; re-running errors with "duplicate column name"). Run only on fresh or
-- local DBs to bring them level with prod.
ALTER TABLE bars ADD COLUMN price INTEGER;          -- 1-4 => $..$$$$
ALTER TABLE bars ADD COLUMN category TEXT;          -- cocktail-bar|bar-restaurant|dive-bar|lounge
ALTER TABLE bars ADD COLUMN seating TEXT;           -- comma human labels
ALTER TABLE bars ADD COLUMN food TEXT;              -- comma human labels
ALTER TABLE bars ADD COLUMN hours TEXT;             -- JSON [{dow_mask,start_min,end_min}]
ALTER TABLE bars ADD COLUMN address TEXT;
ALTER TABLE bars ADD COLUMN state TEXT;
ALTER TABLE bars ADD COLUMN zip TEXT;
