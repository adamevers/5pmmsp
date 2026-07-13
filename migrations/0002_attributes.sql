-- Listing attributes: cost, category, seating, food.
-- price: 1–4 (→ $, $$, $$$, $$$$).  category: slug (cocktail-bar | bar-restaurant
-- | dive-bar | lounge).  seating/food: comma-separated human labels.
ALTER TABLE bars ADD COLUMN price INTEGER;
ALTER TABLE bars ADD COLUMN category TEXT;
ALTER TABLE bars ADD COLUMN seating TEXT;
ALTER TABLE bars ADD COLUMN food TEXT;
