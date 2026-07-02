-- Security Advisor hardening (all were WARN-level).

-- Trigger functions should not be callable directly via the RPC surface.
REVOKE EXECUTE ON FUNCTION public.sync_project_contact_to_customer() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_customer_contact_to_projects() FROM PUBLIC, anon, authenticated;

-- Pin the flagged function's search_path.
ALTER FUNCTION public.assign_project_number() SET search_path = public;

-- Replace "always true" write policies with the projects-edit check
-- (same gate as quotes/orders; admins still bypass via is_admin()).
DROP POLICY IF EXISTS auth_insert_attachments ON public.attachments;
CREATE POLICY auth_insert_attachments ON public.attachments FOR INSERT TO authenticated
  WITH CHECK (has_module_permission('projects'::app_module, 'edit'::permission_level));

DROP POLICY IF EXISTS auth_delete_attachments ON public.attachments;
CREATE POLICY auth_delete_attachments ON public.attachments FOR DELETE TO authenticated
  USING (has_module_permission('projects'::app_module, 'edit'::permission_level));

DROP POLICY IF EXISTS auth_insert_order_docs ON public.order_documents;
CREATE POLICY auth_insert_order_docs ON public.order_documents FOR INSERT TO authenticated
  WITH CHECK (has_module_permission('projects'::app_module, 'edit'::permission_level));

DROP POLICY IF EXISTS auth_delete_order_docs ON public.order_documents;
CREATE POLICY auth_delete_order_docs ON public.order_documents FOR DELETE TO authenticated
  USING (has_module_permission('projects'::app_module, 'edit'::permission_level));
