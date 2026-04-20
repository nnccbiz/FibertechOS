-- 009: Pricing Calculator — multi-currency support, exchange rates, enhanced item tracking

-- === cost_inputs: add currency and exchange rate ===
ALTER TABLE cost_inputs ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'ILS';
ALTER TABLE cost_inputs ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(8,4);
ALTER TABLE cost_inputs ADD COLUMN IF NOT EXISTS exchange_rate_date DATE;

-- === cost_input_items: add original price, currency, item metadata ===
ALTER TABLE cost_input_items ADD COLUMN IF NOT EXISTS original_price NUMERIC(12,2);
ALTER TABLE cost_input_items ADD COLUMN IF NOT EXISTS original_currency TEXT DEFAULT 'USD';
ALTER TABLE cost_input_items ADD COLUMN IF NOT EXISTS item_type TEXT;
ALTER TABLE cost_input_items ADD COLUMN IF NOT EXISTS sn INTEGER;
ALTER TABLE cost_input_items ADD COLUMN IF NOT EXISTS pn INTEGER;
ALTER TABLE cost_input_items ADD COLUMN IF NOT EXISTS length_m NUMERIC(6,2);

-- === quotes: add exchange rate snapshot ===
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(8,4);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS exchange_rate_date DATE;

-- === exchange_rate_log: rate history for audit ===
CREATE TABLE IF NOT EXISTS exchange_rate_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  currency_pair TEXT NOT NULL,
  rate NUMERIC(8,4) NOT NULL,
  source TEXT DEFAULT 'boi',
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE exchange_rate_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_exchange_rate_log" ON exchange_rate_log FOR SELECT USING (true);
CREATE POLICY "anon_write_exchange_rate_log" ON exchange_rate_log FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS idx_exchange_rate_log_pair ON exchange_rate_log(currency_pair, fetched_at DESC);
