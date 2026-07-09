-- ============================================================
-- 20260708_001: procurement → inventory → collection chain
-- ============================================================
-- Digitizes Nitzan's paper flow as "the system drafts, Nitzan confirms":
--   customer order (מ"ס, yearly serial) → purchase order (one screen for
--   import AND domestic) → purchase receipt (תעודת משלוח רכש — auto-drafted
--   from packing lines, discrepancies computed) → stock IN → Miri books the
--   supplier invoice → customer delivery note → stock OUT → customer invoice
--   → payment due date → collection.

-- --- Yearly document counters (מ"ס, קליטות) ---
CREATE TABLE IF NOT EXISTS public.doc_counters (
  kind text NOT NULL,
  year integer NOT NULL,
  counter integer NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, year)
);

CREATE OR REPLACE FUNCTION public.next_doc_number(p_kind text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year integer := EXTRACT(YEAR FROM now())::integer;
  v_counter integer;
BEGIN
  INSERT INTO public.doc_counters (kind, year, counter)
  VALUES (p_kind, v_year, 1)
  ON CONFLICT (kind, year) DO UPDATE SET counter = public.doc_counters.counter + 1
  RETURNING counter INTO v_counter;

  IF p_kind = 'ms' THEN
    RETURN v_year || '-' || lpad(v_counter::text, 3, '0');
  ELSE
    RETURN upper(p_kind) || '-' || v_year || '-' || lpad(v_counter::text, 3, '0');
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_doc_number(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_doc_number(text) TO authenticated;

-- --- Customer order serial (מ"ס) ---
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ms_number text UNIQUE;

-- Backfill existing orders retroactively by creation order.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, EXTRACT(YEAR FROM created_at)::integer AS y
           FROM public.orders WHERE ms_number IS NULL ORDER BY created_at LOOP
    INSERT INTO public.doc_counters (kind, year, counter) VALUES ('ms', r.y, 1)
    ON CONFLICT (kind, year) DO UPDATE SET counter = public.doc_counters.counter + 1;
    UPDATE public.orders
      SET ms_number = r.y || '-' || lpad((SELECT counter FROM public.doc_counters WHERE kind = 'ms' AND year = r.y)::text, 3, '0')
      WHERE id = r.id;
  END LOOP;
END $$;

-- --- Purchase orders: one screen for import AND domestic procurement ---
ALTER TABLE public.import_orders
  ADD COLUMN IF NOT EXISTS procurement_type text NOT NULL DEFAULT 'import'
    CHECK (procurement_type IN ('import', 'domestic')),
  ADD COLUMN IF NOT EXISTS customer_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

-- --- Purchase receipts (תעודת משלוח רכש) — the stock-IN event ---
CREATE TABLE IF NOT EXISTS public.purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text UNIQUE,
  import_order_id uuid NOT NULL REFERENCES public.import_orders(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  location text NOT NULL DEFAULT 'factory' CHECK (location IN ('factory', 'site')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
  received_at date NOT NULL DEFAULT CURRENT_DATE,
  verifier_name text,
  signature_file_path text,
  notes text,
  created_by uuid,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.purchase_receipts(id) ON DELETE CASCADE,
  import_order_item_id uuid REFERENCES public.import_order_items(id) ON DELETE SET NULL,
  packing_line_id uuid REFERENCES public.import_packing_lines(id) ON DELETE SET NULL,
  material_no text,
  description text,
  dn integer,
  pn numeric,
  sn numeric,
  length_m numeric,
  unit text,
  ordered_qty numeric,
  received_qty numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_order ON public.purchase_receipts (import_order_id);
CREATE INDEX IF NOT EXISTS idx_prl_receipt ON public.purchase_receipt_lines (receipt_id);

-- --- Inventory movements ledger + live balance ---
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  -- Normalized item identity: type|DN|PN|SN|length — derived automatically.
  item_key text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'צינורות',
  dn integer,
  pn numeric,
  sn numeric,
  length_m numeric,
  unit text,
  qty numeric NOT NULL CHECK (qty > 0),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  source_type text NOT NULL CHECK (source_type IN ('purchase_receipt', 'delivery', 'manual', 'production')),
  receipt_id uuid REFERENCES public.purchase_receipts(id) ON DELETE SET NULL,
  delivery_id uuid REFERENCES public.import_customer_deliveries(id) ON DELETE SET NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_im_key ON public.inventory_movements (item_key);
CREATE INDEX IF NOT EXISTS idx_im_created ON public.inventory_movements (created_at DESC);

-- Live balance — RLS of the movements table applies (security_invoker).
CREATE OR REPLACE VIEW public.inventory_balance
WITH (security_invoker = true) AS
SELECT
  item_key,
  max(description) AS description,
  max(category) AS category,
  max(dn) AS dn,
  max(pn) AS pn,
  max(sn) AS sn,
  max(length_m) AS length_m,
  max(unit) AS unit,
  sum(CASE WHEN direction = 'in' THEN qty ELSE -qty END) AS in_stock,
  sum(CASE WHEN direction = 'in' THEN qty ELSE 0 END) AS total_in,
  sum(CASE WHEN direction = 'out' THEN qty ELSE 0 END) AS total_out,
  max(created_at) AS last_movement
FROM public.inventory_movements
GROUP BY item_key;

-- --- Supplier invoice booking (Miri) ---
ALTER TABLE public.import_invoices
  ADD COLUMN IF NOT EXISTS booked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS booked_at timestamptz,
  ADD COLUMN IF NOT EXISTS booked_by uuid,
  ADD COLUMN IF NOT EXISTS booking_ref text;

-- --- Collection (customer side) ---
ALTER TABLE public.import_customer_deliveries
  ADD COLUMN IF NOT EXISTS payment_due_date date,
  ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by uuid;

-- --- RLS ---
ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_counters ENABLE ROW LEVEL SECURITY; -- only via the SECURITY DEFINER function

-- Receipts: office (import/projects) and field (Zamir on-site) work them.
CREATE POLICY pr_select ON public.purchase_receipts FOR SELECT TO authenticated USING (
  has_module_permission('import'::app_module, 'view'::permission_level)
  OR has_module_permission('projects'::app_module, 'view'::permission_level)
  OR has_module_permission('field'::app_module, 'view'::permission_level));
CREATE POLICY pr_write ON public.purchase_receipts FOR ALL TO authenticated USING (
  has_module_permission('import'::app_module, 'edit'::permission_level)
  OR has_module_permission('projects'::app_module, 'edit'::permission_level)
  OR has_module_permission('field'::app_module, 'edit'::permission_level))
  WITH CHECK (
  has_module_permission('import'::app_module, 'edit'::permission_level)
  OR has_module_permission('projects'::app_module, 'edit'::permission_level)
  OR has_module_permission('field'::app_module, 'edit'::permission_level));

CREATE POLICY prl_select ON public.purchase_receipt_lines FOR SELECT TO authenticated USING (
  has_module_permission('import'::app_module, 'view'::permission_level)
  OR has_module_permission('projects'::app_module, 'view'::permission_level)
  OR has_module_permission('field'::app_module, 'view'::permission_level));
CREATE POLICY prl_write ON public.purchase_receipt_lines FOR ALL TO authenticated USING (
  has_module_permission('import'::app_module, 'edit'::permission_level)
  OR has_module_permission('projects'::app_module, 'edit'::permission_level)
  OR has_module_permission('field'::app_module, 'edit'::permission_level))
  WITH CHECK (
  has_module_permission('import'::app_module, 'edit'::permission_level)
  OR has_module_permission('projects'::app_module, 'edit'::permission_level)
  OR has_module_permission('field'::app_module, 'edit'::permission_level));

-- Movements: broad read; writes by the flows that move goods.
CREATE POLICY im_select ON public.inventory_movements FOR SELECT TO authenticated USING (
  has_module_permission('inventory'::app_module, 'view'::permission_level)
  OR has_module_permission('import'::app_module, 'view'::permission_level)
  OR has_module_permission('projects'::app_module, 'view'::permission_level)
  OR has_module_permission('production'::app_module, 'view'::permission_level));
CREATE POLICY im_insert ON public.inventory_movements FOR INSERT TO authenticated WITH CHECK (
  has_module_permission('inventory'::app_module, 'edit'::permission_level)
  OR has_module_permission('import'::app_module, 'edit'::permission_level)
  OR has_module_permission('projects'::app_module, 'edit'::permission_level)
  OR has_module_permission('field'::app_module, 'edit'::permission_level));
CREATE POLICY im_delete ON public.inventory_movements FOR DELETE TO authenticated USING (
  has_module_permission('inventory'::app_module, 'full'::permission_level)
  OR has_module_permission('import'::app_module, 'full'::permission_level));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_receipt_lines TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.inventory_movements TO authenticated;
GRANT SELECT ON public.inventory_balance TO authenticated;
