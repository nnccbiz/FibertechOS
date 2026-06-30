-- 20260628_002_import_quote_link.sql
-- Link an import order to the approved quote it fulfills, and let import-module
-- users see APPROVED (signed) quotes so the import page can show the approved-
-- quote worklist ("which approved order still has no import order").

-- 1. import_orders → quotes link (also preps the future auto-create-on-signed flow)
ALTER TABLE public.import_orders
  ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_import_orders_quote ON public.import_orders(quote_id);

-- 2. RLS: import users may read SIGNED quotes only (least privilege).
--    Added as an extra permissive policy — existing projects.view access is unchanged.
CREATE POLICY quotes_import_select ON public.quotes FOR SELECT TO authenticated
  USING (status = 'signed' AND public.has_module_permission('import', 'view'));
