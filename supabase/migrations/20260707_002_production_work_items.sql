-- ============================================================
-- 20260707_002: local manufacturing — production work lines
-- ============================================================
-- A signed quote line can require work at the Fibertech factory (e.g. buy a
-- regular coupling, convert it to a manhole coupling; buy raw pipe, make
-- fittings). Marked per-line on the quote; on signing each marked line becomes
-- a work item on the production order: input (what was purchased) → output
-- (what to manufacture), with stages awaiting_material → in_progress → qc →
-- ready (QC evidence file required to reach ready).

ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS requires_production boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS production_input text,
  ADD COLUMN IF NOT EXISTS production_notes text;

CREATE TABLE IF NOT EXISTS public.production_work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  quote_item_id uuid REFERENCES public.quote_items(id) ON DELETE SET NULL,
  input_desc text NOT NULL DEFAULT '',
  output_desc text NOT NULL DEFAULT '',
  quantity numeric,
  unit text,
  dn integer,
  status text NOT NULL DEFAULT 'awaiting_material'
    CHECK (status IN ('awaiting_material', 'in_progress', 'qc', 'ready')),
  material_arrived boolean NOT NULL DEFAULT false,
  material_arrived_at timestamptz,
  qc_file_path text,
  notes text,
  started_at timestamptz,
  ready_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pwi_order ON public.production_work_items (order_id);
CREATE INDEX IF NOT EXISTS idx_pwi_awaiting ON public.production_work_items (status)
  WHERE status = 'awaiting_material';

ALTER TABLE public.production_work_items ENABLE ROW LEVEL SECURITY;

-- Factory (production) or office (projects) can see; edit needs edit-level in
-- either module — the signer (projects edit) creates the lines, the factory
-- (production edit) advances them.
CREATE POLICY pwi_select ON public.production_work_items
  FOR SELECT TO authenticated
  USING (
    has_module_permission('production'::app_module, 'view'::permission_level)
    OR has_module_permission('projects'::app_module, 'view'::permission_level)
  );

CREATE POLICY pwi_insert ON public.production_work_items
  FOR INSERT TO authenticated
  WITH CHECK (
    has_module_permission('production'::app_module, 'edit'::permission_level)
    OR has_module_permission('projects'::app_module, 'edit'::permission_level)
  );

CREATE POLICY pwi_update ON public.production_work_items
  FOR UPDATE TO authenticated
  USING (
    has_module_permission('production'::app_module, 'edit'::permission_level)
    OR has_module_permission('projects'::app_module, 'edit'::permission_level)
  )
  WITH CHECK (
    has_module_permission('production'::app_module, 'edit'::permission_level)
    OR has_module_permission('projects'::app_module, 'edit'::permission_level)
  );

CREATE POLICY pwi_delete ON public.production_work_items
  FOR DELETE TO authenticated
  USING (
    has_module_permission('production'::app_module, 'full'::permission_level)
    OR has_module_permission('projects'::app_module, 'edit'::permission_level)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_work_items TO authenticated;

-- Delivery certificates can now originate from a production order (finished
-- goods leave the factory, not the container).
ALTER TABLE public.import_customer_deliveries
  ADD COLUMN IF NOT EXISTS production_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;
