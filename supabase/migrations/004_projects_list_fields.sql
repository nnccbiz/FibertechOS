-- ============================================================
-- Migration 004: Projects table — new fields for projects list page
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add new columns to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS serial_number INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS developer_name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS planning_office TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS probability_percent INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS realization_status TEXT DEFAULT 'נמוך' CHECK (realization_status IN ('הזמנה', 'גבוהה', 'בינוני', 'נמוך'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS delivery_months INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS order_execution_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMPTZ DEFAULT now();

-- Monthly revenue breakdown (auto-calculated, stored for fast queries)
CREATE TABLE IF NOT EXISTS project_monthly_revenue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_actual BOOLEAN DEFAULT false,          -- false = צפי, true = בפועל (מהזמנה/יבוא)
  source TEXT DEFAULT 'forecast',           -- forecast / order / import
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, year, month)
);

-- RLS
ALTER TABLE project_monthly_revenue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_monthly_revenue" ON project_monthly_revenue
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_write_monthly_revenue" ON project_monthly_revenue
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_monthly_revenue" ON project_monthly_revenue
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
