-- ============================================================
-- Migration 006: Project Updates / Meeting Log
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS project_updates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  update_date DATE NOT NULL DEFAULT CURRENT_DATE,
  people TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  tasks TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_project_updates_project ON project_updates (project_id, update_date DESC);

ALTER TABLE project_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_project_updates" ON project_updates FOR SELECT USING (true);
CREATE POLICY "anon_write_project_updates" ON project_updates FOR ALL USING (true);
CREATE POLICY "authenticated_full_project_updates" ON project_updates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
