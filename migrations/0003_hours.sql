-- Regular business hours (open/close), stored as JSON on the bar row.
-- Shape: [{ "dow_mask": 15, "start_min": 990, "end_min": 1320 }, ...]
-- start_min/end_min = minutes since midnight (America/Chicago);
-- end_min <= start_min means the venue is open past midnight.
ALTER TABLE bars ADD COLUMN hours TEXT;
