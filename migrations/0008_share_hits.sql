-- Share-link attribution.
--
-- Every render of a bar page mints a short `s=` token that rides along in the
-- copyable share text. When someone follows a shared link we record one row
-- here, so "which bars actually get passed around" is answerable — and, per
-- token, how many people opened one particular share.
--
-- Deliberately thin: no IP, no user agent, no cookie. A token plus a slug plus
-- a timestamp is enough to count, and nothing here identifies a person (the
-- privacy page promises exactly that).
CREATE TABLE IF NOT EXISTS share_hits (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  share_id TEXT NOT NULL,
  slug     TEXT NOT NULL,
  ts       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_share_hits_slug ON share_hits (slug);
CREATE INDEX IF NOT EXISTS idx_share_hits_share ON share_hits (share_id);
