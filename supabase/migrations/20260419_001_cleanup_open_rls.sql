-- ============================================================================
-- Migration 001: Cleanup all permissive RLS policies
-- Date: 2026-04-19
-- Purpose: Drop all existing "USING (true)" policies before installing secure ones
-- ============================================================================
-- IMPORTANT: Run migrations 001, 002, 003, 004 together in sequence.
-- After 001 runs, tables still have RLS enabled but NO policies - meaning
-- nothing except service_role can access them. Apps will be temporarily
-- offline until 003 installs the new policies.
-- ============================================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   r.policyname, r.schemaname, r.tablename);
    RAISE NOTICE 'Dropped policy % on %.%',
                 r.policyname, r.schemaname, r.tablename;
  END LOOP;
END $$;

-- Ensure RLS remains enabled on all user tables
ALTER TABLE public.ai_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_input_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rate_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipe_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_monthly_revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
