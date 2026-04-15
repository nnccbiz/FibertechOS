-- Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT,
  currency TEXT DEFAULT 'USD',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO suppliers (name, contact_name, currency) VALUES
  ('Amiblu', 'מוחמד', 'USD')
ON CONFLICT DO NOTHING;

-- Supplier quotes (קוטציות מספקים)
CREATE TABLE IF NOT EXISTS supplier_quotes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID REFERENCES suppliers(id),
  quote_ref TEXT,
  quote_date DATE,
  project_name TEXT,
  currency TEXT DEFAULT 'USD',
  raw_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Supplier quote line items
CREATE TABLE IF NOT EXISTS supplier_quote_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID REFERENCES supplier_quotes(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  -- סוגים: pipe_with_coupling / pipe_bare / coupling /
  --        elbow / flange / reducer / other
  dn INTEGER,
  sn INTEGER,
  pn INTEGER,
  length_m NUMERIC,
  unit_price NUMERIC NOT NULL,
  price_per TEXT DEFAULT 'meter',
  -- meter / unit
  currency TEXT DEFAULT 'USD',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_suppliers" ON suppliers FOR SELECT USING (true);
CREATE POLICY "anon_write_suppliers" ON suppliers FOR ALL USING (true);

ALTER TABLE supplier_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_supplier_quotes" ON supplier_quotes FOR SELECT USING (true);
CREATE POLICY "anon_write_supplier_quotes" ON supplier_quotes FOR ALL USING (true);

ALTER TABLE supplier_quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_supplier_quote_items" ON supplier_quote_items FOR SELECT USING (true);
CREATE POLICY "anon_write_supplier_quote_items" ON supplier_quote_items FOR ALL USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_supplier_quotes_supplier ON supplier_quotes(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_quote_items_quote ON supplier_quote_items(quote_id);
