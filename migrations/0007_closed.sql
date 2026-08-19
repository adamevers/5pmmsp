-- Permanently-closed venues stay in the table rather than being deleted.
--
-- Deleting loses the record (so a future ingest happily re-adds the place)
-- and 404s a URL that may already be indexed and linked. Flagging instead
-- drops the bar from every listing, count and the sitemap, while its own
-- page keeps resolving with a closed notice and a noindex.
--
-- closed_note: one short human line, e.g. "Closed September 2025."
ALTER TABLE bars ADD COLUMN closed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bars ADD COLUMN closed_note TEXT;
