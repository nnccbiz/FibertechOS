-- ============================================================
-- Migration: Add מירי + Inventory table
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add מירי to team_members
INSERT INTO team_members (name, role, email, access_level)
VALUES ('מירי', 'office', 'miri@fibertech.co.il', 'standard')
ON CONFLICT DO NOTHING;

-- 2. Create inventory table
CREATE TABLE IF NOT EXISTS inventory (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  manufacturer TEXT NOT NULL,                          -- שם יצרן
  pipe_type TEXT NOT NULL CHECK (pipe_type IN (        -- סוג צינור
    'הטמנה', 'דחיקה', 'השחלה'
  )),
  diameter_mm INTEGER NOT NULL,                        -- קוטר צינור (מ"מ)
  pressure_bar NUMERIC(6,2),                           -- לחץ (בר)
  stiffness_sn INTEGER,                                -- קשיחות SN
  length_m NUMERIC(8,2),                               -- אורך (מטר)
  in_stock INTEGER NOT NULL DEFAULT 0,                 -- קיים במלאי
  category TEXT NOT NULL DEFAULT 'צינורות' CHECK (category IN (
    'צינורות', 'אביזרים', 'חומרי סיכה'
  )),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

-- Allow anon read access
CREATE POLICY "Allow anon read inventory" ON inventory
  FOR SELECT USING (true);

-- Allow anon insert/update (adjust as needed)
CREATE POLICY "Allow anon write inventory" ON inventory
  FOR ALL USING (true);
