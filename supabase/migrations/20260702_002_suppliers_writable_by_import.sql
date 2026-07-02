-- 20260702_002_suppliers_writable_by_import.sql
-- Let import-module users (edit+) create/edit suppliers, not just settings admins.
-- Import (Nurit) owns supplier onboarding, so gating supplier writes behind
-- 'settings' was too restrictive. Additive: settings:edit still qualifies.
-- Applied to Supabase 2026-07-02.

DROP POLICY IF EXISTS suppliers_write ON public.suppliers;
CREATE POLICY suppliers_write ON public.suppliers FOR ALL TO authenticated
  USING (public.has_module_permission('settings','edit') OR public.has_module_permission('import','edit'))
  WITH CHECK (public.has_module_permission('settings','edit') OR public.has_module_permission('import','edit'));
