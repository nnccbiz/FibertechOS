-- Drop old tables if they exist (clean rebuild)
DROP TABLE IF EXISTS quote_items CASCADE;
DROP TABLE IF EXISTS quotes CASCADE;

-- Cost inputs (תמחור מספק / פנימי)
CREATE TABLE IF NOT EXISTS cost_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL DEFAULT 'supplier',  -- 'supplier' | 'internal'
  source_name TEXT NOT NULL DEFAULT '',           -- מוחמד / הלל / אחר
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cost input line items
CREATE TABLE IF NOT EXISTS cost_input_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_input_id UUID NOT NULL REFERENCES cost_inputs(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL DEFAULT '',
  dn_size TEXT,
  quantity NUMERIC(10,2) DEFAULT 0,
  unit TEXT DEFAULT 'מטר',
  cost_price NUMERIC(12,2) DEFAULT 0,
  total_cost NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  sort_order INTEGER DEFAULT 0
);

-- Quotes (הצעות מחיר ללקוח)
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cost_input_id UUID REFERENCES cost_inputs(id),  -- linked cost input
  quote_number TEXT,
  client_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',  -- draft / sent / signed / rejected
  cost_source TEXT DEFAULT 'supplier',   -- supplier / internal
  supplier_name TEXT DEFAULT '',
  default_overheads_pct NUMERIC(5,2) DEFAULT 23,
  default_profit_pct NUMERIC(5,2) DEFAULT 25,
  payment_terms TEXT DEFAULT '40% מקדמה, יתרה שוטף +30',
  disclaimer_type TEXT DEFAULT 'grp_pipe', -- grp_pipe / grp_push / grp_sleeve / accessories / lubricants
  disclaimer_text TEXT,
  technical_notes TEXT,
  total_cost NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'ILS',
  valid_until DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Quote line items (פריטים בהצעת מחיר)
CREATE TABLE IF NOT EXISTS quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL DEFAULT '',
  dn_size TEXT,
  quantity NUMERIC(10,2) DEFAULT 0,
  unit TEXT DEFAULT 'מטר',
  cost_price NUMERIC(12,2) DEFAULT 0,
  overheads_pct NUMERIC(5,2) DEFAULT 23,
  profit_pct NUMERIC(5,2) DEFAULT 25,
  unit_price NUMERIC(12,2) DEFAULT 0,   -- selling price per unit
  total_price NUMERIC(12,2) DEFAULT 0,  -- quantity * unit_price
  notes TEXT,
  sort_order INTEGER DEFAULT 0
);

-- Orders (הזמנות - אחרי שהצעה נחתמת)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES quotes(id),
  order_number TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending / confirmed / in_production / delivered / completed
  advance_percent NUMERIC(5,2) DEFAULT 40,
  advance_paid BOOLEAN DEFAULT false,
  balance_paid BOOLEAN DEFAULT false,
  total_amount NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_inputs_project ON cost_inputs(project_id);
CREATE INDEX IF NOT EXISTS idx_cost_input_items_input ON cost_input_items(cost_input_id);
CREATE INDEX IF NOT EXISTS idx_quotes_project ON quotes(project_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_orders_project ON orders(project_id);
CREATE INDEX IF NOT EXISTS idx_orders_quote ON orders(quote_id);
