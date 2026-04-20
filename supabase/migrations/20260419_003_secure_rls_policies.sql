-- ============================================================================
-- Migration 003: Secure RLS policies per module
-- Date: 2026-04-19
-- Purpose: Replace "USING (true)" with policies based on user × module matrix
-- ============================================================================
-- Mapping of table → module (for RLS decisions):
--   projects, project_details, project_monthly_revenue,
--   project_contacts, project_updates, pipe_specs, alerts     → 'projects'
--   cost_inputs, cost_input_items,
--   supplier_quotes, supplier_quote_items, suppliers          → 'projects' (cost data)
--   quotes, quote_items, orders                               → 'projects'
--   clients                                                   → 'projects' (read), 'settings' (write)
--   leads                                                     → 'marketing'
--   inventory                                                 → 'inventory'
--   team_members                                              → 'settings' (admin write, all authenticated read)
--   user_module_permissions                                   → 'settings' (admin only)
--   access_requests, login_attempts, password_history         → admin only
--   ai_activity_log                                           → admin read, system write
--   exchange_rate_log                                         → authenticated read, system write
-- ============================================================================

-- =================== PROJECTS CLUSTER ========================================

CREATE POLICY projects_select ON public.projects FOR SELECT TO authenticated
  USING (public.has_module_permission('projects', 'view'));
CREATE POLICY projects_insert ON public.projects FOR INSERT TO authenticated
  WITH CHECK (public.has_module_permission('projects', 'edit'));
CREATE POLICY projects_update ON public.projects FOR UPDATE TO authenticated
  USING (public.has_module_permission('projects', 'edit'))
  WITH CHECK (public.has_module_permission('projects', 'edit'));
CREATE POLICY projects_delete ON public.projects FOR DELETE TO authenticated
  USING (public.has_module_permission('projects', 'full'));

CREATE POLICY project_details_select ON public.project_details FOR SELECT TO authenticated
  USING (public.has_module_permission('projects', 'view'));
CREATE POLICY project_details_write  ON public.project_details FOR ALL TO authenticated
  USING (public.has_module_permission('projects', 'edit'))
  WITH CHECK (public.has_module_permission('projects', 'edit'));

CREATE POLICY project_monthly_revenue_select ON public.project_monthly_revenue FOR SELECT TO authenticated
  USING (public.has_module_permission('projects', 'view'));
CREATE POLICY project_monthly_revenue_write  ON public.project_monthly_revenue FOR ALL TO authenticated
  USING (public.has_module_permission('projects', 'edit'))
  WITH CHECK (public.has_module_permission('projects', 'edit'));

CREATE POLICY project_contacts_select ON public.project_contacts FOR SELECT TO authenticated
  USING (public.has_module_permission('projects', 'view'));
CREATE POLICY project_contacts_write  ON public.project_contacts FOR ALL TO authenticated
  USING (public.has_module_permission('projects', 'edit'))
  WITH CHECK (public.has_module_permission('projects', 'edit'));

CREATE POLICY project_updates_select ON public.project_updates FOR SELECT TO authenticated
  USING (public.has_module_permission('projects', 'view'));
CREATE POLICY project_updates_write  ON public.project_updates FOR ALL TO authenticated
  USING (public.has_module_permission('projects', 'edit'))
  WITH CHECK (public.has_module_permission('projects', 'edit'));

CREATE POLICY pipe_specs_select ON public.pipe_specs FOR SELECT TO authenticated
  USING (public.has_module_permission('projects', 'view'));
CREATE POLICY pipe_specs_write  ON public.pipe_specs FOR ALL TO authenticated
  USING (public.has_module_permission('projects', 'edit'))
  WITH CHECK (public.has_module_permission('projects', 'edit'));

CREATE POLICY alerts_select ON public.alerts FOR SELECT TO authenticated
  USING (public.has_module_permission('projects', 'view'));
CREATE POLICY alerts_write  ON public.alerts FOR ALL TO authenticated
  USING (public.has_module_permission('projects', 'edit'))
  WITH CHECK (public.has_module_permission('projects', 'edit'));

-- =================== CLIENTS =================================================
-- All authenticated users who have 'view' on projects can read clients
-- (to see who is the developer/planner/contractor on a project).
-- Only users with 'edit' on 'settings' can write.

CREATE POLICY clients_select ON public.clients FOR SELECT TO authenticated
  USING (public.has_module_permission('projects', 'view'));
CREATE POLICY clients_write ON public.clients FOR ALL TO authenticated
  USING (public.has_module_permission('settings', 'edit'))
  WITH CHECK (public.has_module_permission('settings', 'edit'));

-- =================== COSTS & QUOTES & ORDERS =================================

CREATE POLICY suppliers_select ON public.suppliers FOR SELECT TO authenticated
  USING (public.has_module_permission('projects', 'view') OR public.has_module_permission('import','view'));
CREATE POLICY suppliers_write  ON public.suppliers FOR ALL TO authenticated
  USING (public.has_module_permission('settings', 'edit'))
  WITH CHECK (public.has_module_permission('settings', 'edit'));

CREATE POLICY supplier_quotes_select ON public.supplier_quotes FOR SELECT TO authenticated
  USING (public.has_module_permission('projects', 'view') OR public.has_module_permission('import','view'));
CREATE POLICY supplier_quotes_write  ON public.supplier_quotes FOR ALL TO authenticated
  USING (public.has_module_permission('projects', 'edit') OR public.has_module_permission('import','edit'))
  WITH CHECK (public.has_module_permission('projects', 'edit') OR public.has_module_permission('import','edit'));

CREATE POLICY supplier_quote_items_select ON public.supplier_quote_items FOR SELECT TO authenticated
  USING (public.has_module_permission('projects', 'view') OR public.has_module_permission('import','view'));
CREATE POLICY supplier_quote_items_write  ON public.supplier_quote_items FOR ALL TO authenticated
  USING (public.has_module_permission('projects', 'edit') OR public.has_module_permission('import','edit'))
  WITH CHECK (public.has_module_permission('projects', 'edit') OR public.has_module_permission('import','edit'));

CREATE POLICY cost_inputs_select ON public.cost_inputs FOR SELECT TO authenticated
  USING (public.has_module_permission('projects', 'view'));
CREATE POLICY cost_inputs_write  ON public.cost_inputs FOR ALL TO authenticated
  USING (public.has_module_permission('projects', 'edit'))
  WITH CHECK (public.has_module_permission('projects', 'edit'));

CREATE POLICY cost_input_items_select ON public.cost_input_items FOR SELECT TO authenticated
  USING (public.has_module_permission('projects', 'view'));
CREATE POLICY cost_input_items_write  ON public.cost_input_items FOR ALL TO authenticated
  USING (public.has_module_permission('projects', 'edit'))
  WITH CHECK (public.has_module_permission('projects', 'edit'));

CREATE POLICY quotes_select ON public.quotes FOR SELECT TO authenticated
  USING (public.has_module_permission('projects', 'view'));
CREATE POLICY quotes_write  ON public.quotes FOR ALL TO authenticated
  USING (public.has_module_permission('projects', 'edit'))
  WITH CHECK (public.has_module_permission('projects', 'edit'));

CREATE POLICY quote_items_select ON public.quote_items FOR SELECT TO authenticated
  USING (public.has_module_permission('projects', 'view'));
CREATE POLICY quote_items_write  ON public.quote_items FOR ALL TO authenticated
  USING (public.has_module_permission('projects', 'edit'))
  WITH CHECK (public.has_module_permission('projects', 'edit'));

CREATE POLICY orders_select ON public.orders FOR SELECT TO authenticated
  USING (public.has_module_permission('projects', 'view'));
CREATE POLICY orders_write  ON public.orders FOR ALL TO authenticated
  USING (public.has_module_permission('projects', 'edit'))
  WITH CHECK (public.has_module_permission('projects', 'edit'));

-- =================== MARKETING (leads) =======================================

CREATE POLICY leads_select ON public.leads FOR SELECT TO authenticated
  USING (public.has_module_permission('marketing', 'view'));
CREATE POLICY leads_write  ON public.leads FOR ALL TO authenticated
  USING (public.has_module_permission('marketing', 'edit'))
  WITH CHECK (public.has_module_permission('marketing', 'edit'));

-- =================== INVENTORY ===============================================

CREATE POLICY inventory_select ON public.inventory FOR SELECT TO authenticated
  USING (public.has_module_permission('inventory', 'view'));
CREATE POLICY inventory_write  ON public.inventory FOR ALL TO authenticated
  USING (public.has_module_permission('inventory', 'edit'))
  WITH CHECK (public.has_module_permission('inventory', 'edit'));

-- =================== TEAM MEMBERS (settings module) =========================
-- Any authenticated user can read their own row (to know who they are).
-- Any authenticated user with 'view' on settings can see full team list.
-- Only admins can insert/update/delete rows.

CREATE POLICY team_members_select_self ON public.team_members FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());
CREATE POLICY team_members_select_all ON public.team_members FOR SELECT TO authenticated
  USING (public.has_module_permission('settings', 'view'));
CREATE POLICY team_members_admin_write ON public.team_members FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =================== MODULE PERMISSIONS =====================================
-- Users can read their own permissions (for UI gating).
-- Only admins can read everyone else's and write any.

CREATE POLICY ump_select_self ON public.user_module_permissions FOR SELECT TO authenticated
  USING (user_id = public.current_team_member_id());
CREATE POLICY ump_admin_all   ON public.user_module_permissions FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =================== ACCESS REQUESTS ========================================
-- Admins can read and decide. anon can INSERT via the Next.js API route
-- (server uses service_role key) - no direct anon access here.

CREATE POLICY access_requests_admin ON public.access_requests FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =================== LOGIN ATTEMPTS =========================================

CREATE POLICY login_attempts_admin ON public.login_attempts FOR SELECT TO authenticated
  USING (public.is_admin());

-- =================== PASSWORD HISTORY =======================================

CREATE POLICY password_history_self ON public.password_history FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- =================== AI ACTIVITY LOG ========================================

CREATE POLICY ai_log_admin_read ON public.ai_activity_log FOR SELECT TO authenticated
  USING (public.is_admin() OR user_id = auth.uid());
-- Writes happen via API route with service_role, not from client

-- =================== EXCHANGE RATE LOG ======================================
-- Read-only for all authenticated users; writes happen via server only
CREATE POLICY exchange_rate_log_read ON public.exchange_rate_log FOR SELECT TO authenticated
  USING (true);
