-- 016: Add discount fields to quotes and quote items
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(5,2) DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS global_discount_pct NUMERIC(5,2) DEFAULT 0;
