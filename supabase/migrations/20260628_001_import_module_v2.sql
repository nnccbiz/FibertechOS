-- 20260628_001_import_module_v2.sql
-- Restructure the import module to a SHIPMENT / CONTAINER-centric model.
-- A single container can carry deliveries for multiple projects/orders, so
-- shipments and containers are first-class and bridged to orders via packing
-- lines (the supplier delivery-note lines).
--
-- Safe to drop v1 tables (created in 20260622_001) — no production data yet.
-- RLS is gated by module 'import' (select=view, insert/update=edit, delete=full).

-- ============================================================
-- Drop v1 (order matters for FKs)
-- ============================================================
DROP TABLE IF EXISTS public.import_delivery_notes CASCADE;
DROP TABLE IF EXISTS public.import_documents      CASCADE;
DROP TABLE IF EXISTS public.import_containers      CASCADE;
DROP TABLE IF EXISTS public.import_order_items     CASCADE;
DROP TABLE IF EXISTS public.import_orders          CASCADE;

-- ============================================================
-- 1. Shipments — one physical sailing (one BL / booking)
-- ============================================================
CREATE TABLE public.import_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES public.suppliers(id),
  bl_number TEXT,                              -- Bill of Lading / Booking no (260373565)
  carrier TEXT,                                -- Maersk
  vessel_name TEXT,                            -- MAERSK GIRONDE
  voyage_no TEXT,                              -- 542S
  port_loading TEXT,                           -- Gdansk
  port_discharge TEXT,                         -- Ashdod
  etd DATE,
  eta DATE,
  status TEXT NOT NULL DEFAULT 'booked',
    -- booked|sailing|arrived|customs|delivered|closed
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. Orders — commercial PO ↔ project
-- ============================================================
CREATE TABLE public.import_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES public.suppliers(id),
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL, -- NULL = stock
  is_stock BOOLEAN DEFAULT false,
  po_number TEXT,                              -- our purchase order
  supplier_order_no TEXT,                      -- Amiblu Sales Order (1322250535)
  supplier_project_no TEXT,                    -- Amiblu project no (3622009001)
  project_name TEXT,                           -- "IL - Electra - Matash Stage 4"
  currency TEXT DEFAULT 'USD',
  incoterms TEXT,                              -- CIF Ashdod port
  payment_terms TEXT,                          -- 30% in advance / 70% 60 days net
  total_amount NUMERIC(14,2) DEFAULT 0,
  order_date DATE,
  status TEXT NOT NULL DEFAULT 'open',
    -- open|confirmed|in_transit|partially_received|received|closed
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. Order items — what was ordered
-- ============================================================
CREATE TABLE public.import_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_order_id UUID NOT NULL REFERENCES public.import_orders(id) ON DELETE CASCADE,
  line_no INT,                                 -- supplier item position (10/30/40)
  material_no TEXT,                            -- 1419749
  description TEXT NOT NULL,
  dn TEXT,
  pn TEXT,
  sn TEXT,
  unit TEXT DEFAULT 'M',
  ordered_qty NUMERIC(14,2) DEFAULT 0,
  unit_price NUMERIC(14,2),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 4. Containers — belong to a shipment
-- ============================================================
CREATE TABLE public.import_containers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID REFERENCES public.import_shipments(id) ON DELETE CASCADE,
  container_number TEXT,                       -- MSKU1238262
  seal_number TEXT,                            -- C30333
  container_type TEXT,                         -- 40 DRY 9'6
  gross_weight NUMERIC(12,2),
  net_weight NUMERIC(12,2),
  pieces INT,                                  -- pipes loaded
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. Packing lines — THE BRIDGE (supplier delivery-note line):
--    "qty X of product Y, for order Z, inside container W (delivery note N)"
-- ============================================================
CREATE TABLE public.import_packing_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_no TEXT,                        -- 1822252491
  container_id UUID REFERENCES public.import_containers(id) ON DELETE SET NULL,
  import_order_id UUID REFERENCES public.import_orders(id) ON DELETE SET NULL,
  import_order_item_id UUID REFERENCES public.import_order_items(id) ON DELETE SET NULL,
  material_no TEXT,
  description TEXT,
  dn TEXT,
  shipped_qty NUMERIC(14,2) DEFAULT 0,
  unit TEXT DEFAULT 'M',
  pieces INT,
  gross_weight NUMERIC(12,2),
  net_weight NUMERIC(12,2),
  loading_date DATE,
  discharge_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. Invoices — financial (closes delivery notes)
-- ============================================================
CREATE TABLE public.import_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_order_id UUID REFERENCES public.import_orders(id) ON DELETE SET NULL,
  shipment_id UUID REFERENCES public.import_shipments(id) ON DELETE SET NULL,
  invoice_no TEXT,                             -- 2022253253
  invoice_type TEXT DEFAULT 'commercial',      -- proforma|commercial|advance
  invoice_date DATE,
  currency TEXT DEFAULT 'USD',
  net_value NUMERIC(14,2),
  freight NUMERIC(14,2),
  down_payment NUMERIC(14,2),
  final_amount NUMERIC(14,2),
  delivery_notes TEXT,                         -- covered DN numbers (comma list)
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 7. COA — inspection / quality certificates
-- ============================================================
CREATE TABLE public.import_coa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_order_id UUID REFERENCES public.import_orders(id) ON DELETE SET NULL,
  coa_no TEXT,                                 -- 179/2025
  coa_date DATE,
  dn TEXT,
  pn TEXT,
  sn TEXT,
  delivery_notes TEXT,                         -- covered DN numbers
  passed BOOLEAN,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 8. Documents — every source PDF, linked to what it belongs to
-- ============================================================
CREATE TABLE public.import_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type TEXT NOT NULL,
    -- email|order_confirmation|proforma_invoice|commercial_invoice|packing_list|bl|coa|other
  shipment_id UUID REFERENCES public.import_shipments(id) ON DELETE CASCADE,
  import_order_id UUID REFERENCES public.import_orders(id) ON DELETE CASCADE,
  container_id UUID REFERENCES public.import_containers(id) ON DELETE SET NULL,
  doc_number TEXT,                             -- the document's own number
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 9. Customer deliveries — downstream (Fibertech → Israeli customer) + accounting
-- ============================================================
CREATE TABLE public.import_customer_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_order_id UUID REFERENCES public.import_orders(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  delivery_note_number TEXT,
  delivery_date DATE,
  quantity_summary TEXT,
  signed BOOLEAN DEFAULT false,
  signed_file_path TEXT,
  sent_to_accounting BOOLEAN DEFAULT false,    -- הועבר להנה״ח
  invoice_issued BOOLEAN DEFAULT false,        -- הופקה חשבונית מס
  invoice_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_import_orders_supplier      ON public.import_orders(supplier_id);
CREATE INDEX idx_import_orders_project       ON public.import_orders(project_id);
CREATE INDEX idx_import_orders_status        ON public.import_orders(status);
CREATE INDEX idx_import_order_items_order    ON public.import_order_items(import_order_id);
CREATE INDEX idx_import_containers_shipment  ON public.import_containers(shipment_id);
CREATE INDEX idx_import_containers_number    ON public.import_containers(container_number);
CREATE INDEX idx_import_packing_container    ON public.import_packing_lines(container_id);
CREATE INDEX idx_import_packing_order        ON public.import_packing_lines(import_order_id);
CREATE INDEX idx_import_packing_dn           ON public.import_packing_lines(delivery_note_no);
CREATE INDEX idx_import_invoices_order       ON public.import_invoices(import_order_id);
CREATE INDEX idx_import_invoices_shipment    ON public.import_invoices(shipment_id);
CREATE INDEX idx_import_coa_order            ON public.import_coa(import_order_id);
CREATE INDEX idx_import_documents_shipment   ON public.import_documents(shipment_id);
CREATE INDEX idx_import_documents_order      ON public.import_documents(import_order_id);
CREATE INDEX idx_import_customer_deliv_order ON public.import_customer_deliveries(import_order_id);

-- ============================================================
-- RLS — module 'import' (select=view, insert/update=edit, delete=full)
-- ============================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'import_shipments','import_orders','import_order_items','import_containers',
    'import_packing_lines','import_invoices','import_coa','import_documents',
    'import_customer_deliveries'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format($p$CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO authenticated
      USING (public.has_module_permission('import','view'));$p$, t);
    EXECUTE format($p$CREATE POLICY %1$s_insert ON public.%1$I FOR INSERT TO authenticated
      WITH CHECK (public.has_module_permission('import','edit'));$p$, t);
    EXECUTE format($p$CREATE POLICY %1$s_update ON public.%1$I FOR UPDATE TO authenticated
      USING (public.has_module_permission('import','edit'))
      WITH CHECK (public.has_module_permission('import','edit'));$p$, t);
    EXECUTE format($p$CREATE POLICY %1$s_delete ON public.%1$I FOR DELETE TO authenticated
      USING (public.has_module_permission('import','full'));$p$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', t);
  END LOOP;
END $$;
