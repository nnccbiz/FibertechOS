-- 20260706_003: signed quotes that do NOT need an import order.
-- The "טרם הזמנת יבוא" list showed every signed quote, including internal/ILS
-- deals that never involve import. A quote listed here is exempt: hidden from
-- the pending list (reversible). Rows are added manually from the import
-- screen, or automatically by /api/import/from-quote when the signing rule
-- decides no import order is needed (internal supplier / ILS pricing).

CREATE TABLE IF NOT EXISTS public.import_quote_exemptions (
  quote_id uuid PRIMARY KEY REFERENCES public.quotes(id) ON DELETE CASCADE,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.import_quote_exemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY import_quote_exemptions_select ON public.import_quote_exemptions
  FOR SELECT TO authenticated
  USING (has_module_permission('import'::app_module, 'view'::permission_level));

CREATE POLICY import_quote_exemptions_insert ON public.import_quote_exemptions
  FOR INSERT TO authenticated
  WITH CHECK (has_module_permission('import'::app_module, 'edit'::permission_level));

CREATE POLICY import_quote_exemptions_delete ON public.import_quote_exemptions
  FOR DELETE TO authenticated
  USING (has_module_permission('import'::app_module, 'edit'::permission_level));

GRANT SELECT, INSERT, DELETE ON public.import_quote_exemptions TO authenticated;
