-- Full-address parts: address (street, 0004) + city (existing) + state + zip.
ALTER TABLE bars ADD COLUMN state TEXT DEFAULT 'MN';
ALTER TABLE bars ADD COLUMN zip TEXT;
