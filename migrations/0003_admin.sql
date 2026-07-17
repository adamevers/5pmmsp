-- Admin UI (docs/plans/2026-07-16-admin-ui-plan.md). Safe to apply to prod.
-- Submission resolution: resolved_at/resolution stamped when Adam accepts or
-- rejects in /admin. verify_status: set to 'queued' when an accepted report
-- should be re-verified by the ingest worker against the bar's official site
-- (the CoS side polls for queued rows and sets 'done' when checked).
ALTER TABLE submissions ADD COLUMN resolved_at TEXT;
ALTER TABLE submissions ADD COLUMN resolution TEXT;
ALTER TABLE submissions ADD COLUMN verify_status TEXT;
CREATE INDEX idx_submissions_status ON submissions(status);

-- Every admin mutation appends before/after JSON — audit trail and the escape
-- hatch when an edit goes wrong.
CREATE TABLE admin_log (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  action TEXT NOT NULL,             -- e.g. bar.update, bar.create, submission.accept
  subject TEXT NOT NULL,            -- bar slug or submission id
  before TEXT,                      -- JSON snapshot (NULL for creates)
  after TEXT                        -- JSON snapshot (NULL for pure status flips)
);
