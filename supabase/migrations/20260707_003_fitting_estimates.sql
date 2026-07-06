-- ============================================================
-- 20260707_003: fitting estimates — Hillel's factory pricing engine
-- ============================================================
-- Digitizes the cost layer of the factory's fitting-design workbook
-- (Pipe__Fitting_design): live material prices, labor rates, per-fitting
-- labor norms, and drawing-based estimates that Roxy analyzes and Hillel
-- approves. Approved estimates feed quote lines (cost basis + 🏭 flag) and
-- accumulate as training examples for future estimates.

-- --- Factory settings (key/value, editable by production editors) ---
CREATE TABLE IF NOT EXISTS public.factory_settings (
  key text PRIMARY KEY,
  value numeric NOT NULL,
  label text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO public.factory_settings (key, value, label) VALUES
  ('labor_rate_hourly',    225.56, 'עלות שעת עבודה במפעל (₪)'),
  ('labor_cost_per_kg',    40,     'עלות עבודה לק"ג למינט (₪)'),
  ('laminate_cost_per_kg', 39.02,  'עלות חומר לק"ג למינט (₪) — שרף+סיבים+קטליסט'),
  ('overhead_pct',         10,     'תוספת פחת ותקורה (%)'),
  ('default_markup_pct',   100,    'מרווח ברירת מחדל על עלות (%)')
ON CONFLICT (key) DO NOTHING;

-- --- Material price list (from the workbook's "material price" sheet) ---
CREATE TABLE IF NOT EXISTS public.factory_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'kg',
  price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  category text,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.factory_materials (name, unit, price, currency, category) VALUES
  ('RESIN Ortophtalic', 'kg', 2.9, 'EUR', 'שרף'),
  ('RESIN Isophtalic', 'kg', 3.335, 'EUR', 'שרף'),
  ('RESIN Tetraphtalic', 'kg', 3.5, 'EUR', 'שרף'),
  ('Derakane 411', 'kg', 10, 'EUR', 'שרף'),
  ('Derakane 470', 'kg', 12, 'EUR', 'שרף'),
  ('Derakane A510', 'kg', 15, 'EUR', 'שרף'),
  ('Derakane HT470', 'kg', 16, 'EUR', 'שרף'),
  ('CATALIST M-60', 'kg', 8.43, 'EUR', 'כימיקלים'),
  ('COBALT', 'kg', 18.96, 'EUR', 'כימיקלים'),
  ('SURFACE MAT', 'sq', 3, 'EUR', 'סיבים'),
  ('ROVING FOR CHOPPED', 'kg', 2.16, 'EUR', 'סיבים'),
  ('F.W ROVING', 'kg', 1.8, 'EUR', 'סיבים'),
  ('CSM 450', 'kg', 2.54, 'EUR', 'סיבים'),
  ('WR 500', 'kg', 1.5, 'EUR', 'סיבים'),
  ('Quatroaxial', 'kg', 5, 'EUR', 'סיבים'),
  ('RELEASE FILM', 'kg', 4.875, 'EUR', 'עזר'),
  ('Silica', 'kg', 0.135, 'EUR', 'עזר'),
  ('STEEL BAND', 'kg', 6.9, 'EUR', 'עזר'),
  ('TOPCOAT', 'kg', 6.5, 'USD', 'גימור'),
  ('TIOX', 'kg', 7, 'USD', 'גימור')
ON CONFLICT DO NOTHING;

-- --- Labor norms per fitting type + DN range (hours) ---
-- Seeded with rough starting values — CALIBRATION REQUIRED by Hillel.
CREATE TABLE IF NOT EXISTS public.factory_labor_norms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fitting_type text NOT NULL,
  dn_min integer NOT NULL DEFAULT 0,
  dn_max integer NOT NULL DEFAULT 4000,
  hours numeric NOT NULL,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.factory_labor_norms (fitting_type, dn_min, dn_max, hours, note) VALUES
  ('manhole_coupling', 0, 800, 6, 'לכיול ע"י הלל'),
  ('manhole_coupling', 801, 1600, 10, 'לכיול ע"י הלל'),
  ('elbow', 0, 600, 8, 'לכיול ע"י הלל'),
  ('elbow', 601, 1200, 16, 'לכיול ע"י הלל'),
  ('elbow', 1201, 4000, 28, 'לכיול ע"י הלל'),
  ('tee', 0, 600, 12, 'לכיול ע"י הלל'),
  ('tee', 601, 1200, 22, 'לכיול ע"י הלל'),
  ('tee', 1201, 4000, 36, 'לכיול ע"י הלל'),
  ('reducer', 0, 800, 8, 'לכיול ע"י הלל'),
  ('reducer', 801, 4000, 14, 'לכיול ע"י הלל'),
  ('flange', 0, 800, 5, 'לכיול ע"י הלל'),
  ('flange', 801, 4000, 9, 'לכיול ע"י הלל'),
  ('nozzle', 0, 4000, 10, 'לכיול ע"י הלל'),
  ('liner', 0, 4000, 12, 'חבישה/חיוץ — לכיול'),
  ('other', 0, 4000, 8, 'לכיול ע"י הלל')
ON CONFLICT DO NOTHING;

-- --- Fitting estimates (the work object) ---
CREATE TABLE IF NOT EXISTS public.fitting_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  quote_item_id uuid REFERENCES public.quote_items(id) ON DELETE SET NULL,
  attachment_id uuid REFERENCES public.attachments(id) ON DELETE SET NULL,
  drawing_path text,
  name text NOT NULL DEFAULT '',
  fitting_type text NOT NULL DEFAULT 'other',
  dn integer,
  pn numeric,
  quantity numeric NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  -- what Gemini read from the drawing (geometry, verbatim fields, confidence)
  ai_analysis jsonb,
  -- the deterministic estimator's output at creation time (for learning)
  ai_estimate jsonb,
  -- editable cost lines: [{kind: material|labor|purchased|other, desc, qty, unit, unit_price, total}]
  lines jsonb NOT NULL DEFAULT '[]',
  total_cost numeric NOT NULL DEFAULT 0,
  markup_pct numeric,
  final_price numeric,
  notes text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fe_project ON public.fitting_estimates (project_id);
CREATE INDEX IF NOT EXISTS idx_fe_type_dn ON public.fitting_estimates (fitting_type, dn) WHERE status = 'approved';

-- --- RLS: production/projects view to read, edit to write ---
ALTER TABLE public.factory_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_labor_norms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fitting_estimates ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['factory_settings', 'factory_materials', 'factory_labor_norms', 'fitting_estimates'] LOOP
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (
      has_module_permission(''production''::app_module, ''view''::permission_level)
      OR has_module_permission(''projects''::app_module, ''view''::permission_level))', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (
      has_module_permission(''production''::app_module, ''edit''::permission_level)
      OR has_module_permission(''projects''::app_module, ''edit''::permission_level))
      WITH CHECK (
      has_module_permission(''production''::app_module, ''edit''::permission_level)
      OR has_module_permission(''projects''::app_module, ''edit''::permission_level))', t, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fitting_estimates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.factory_materials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.factory_labor_norms TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.factory_settings TO authenticated;
