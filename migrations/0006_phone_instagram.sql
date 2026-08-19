-- phone: E.164 (+16125551234). Google's local results lean on telephone, and
-- it is the last field missing from the BarOrPub node.
--
-- instagram: handle only, no @ and no URL. The column should have existed at
-- 0001 — seed/bars.json has carried a handle per bar since launch, but it was
-- never in BAR_COLS, so it never reached D1 and scripts/export.js would have
-- dropped it from the JSON on the next snapshot.
ALTER TABLE bars ADD COLUMN phone TEXT;
ALTER TABLE bars ADD COLUMN instagram TEXT;
