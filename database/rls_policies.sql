-- ============================================================
-- RLS Policies — Fibertech OS
-- Enable Row Level Security on all core tables
-- Current phase: full access for authenticated users
-- ============================================================

-- 1. clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access_clients" ON clients
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_read_clients" ON clients
  FOR SELECT
  TO anon
  USING (true);

-- 2. projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access_projects" ON projects
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_read_projects" ON projects
  FOR SELECT
  TO anon
  USING (true);

-- 3. leads
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access_leads" ON leads
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_read_leads" ON leads
  FOR SELECT
  TO anon
  USING (true);

-- 4. alerts
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access_alerts" ON alerts
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_read_alerts" ON alerts
  FOR SELECT
  TO anon
  USING (true);

-- 5. team_members
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access_team_members" ON team_members
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_read_team_members" ON team_members
  FOR SELECT
  TO anon
  USING (true);
