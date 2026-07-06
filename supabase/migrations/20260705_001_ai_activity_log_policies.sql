-- ============================================================
-- 20260705_001: ai_activity_log — align repo with live DB + add write policies
-- ============================================================
-- Live DB had only ai_log_admin_read (SELECT) — created manually in the
-- dashboard, never in a repo migration. The legacy anon read/write policies
-- from 003 were dropped there. Result: no INSERT policy existed at all, so
-- every client-side log write (including security rejections) failed silently
-- and the table stayed empty since launch.
--
-- This migration is the canonical state:
--   SELECT — owner or admin (each employee sees their own actions, admin all)
--   INSERT — authenticated, owner-stamped rows only
--   UPDATE — owner or admin (needed for undo: status -> 'reverted')
--   No DELETE. anon has no access.

DROP POLICY IF EXISTS anon_read_ai_log ON public.ai_activity_log;
DROP POLICY IF EXISTS anon_write_ai_log ON public.ai_activity_log;
DROP POLICY IF EXISTS authenticated_full_access_ai_log ON public.ai_activity_log;
DROP POLICY IF EXISTS ai_log_admin_read ON public.ai_activity_log;

CREATE POLICY ai_log_admin_read ON public.ai_activity_log
  FOR SELECT TO authenticated
  USING (is_admin() OR user_id = auth.uid());

CREATE POLICY ai_log_owner_insert ON public.ai_activity_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY ai_log_owner_update ON public.ai_activity_log
  FOR UPDATE TO authenticated
  USING (is_admin() OR user_id = auth.uid())
  WITH CHECK (is_admin() OR user_id = auth.uid());

REVOKE ALL ON public.ai_activity_log FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.ai_activity_log TO authenticated;
