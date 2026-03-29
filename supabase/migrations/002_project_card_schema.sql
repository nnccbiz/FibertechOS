-- ============================================================
-- Migration 002: Expanded Project Card Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Project Details (one-to-one with projects)
CREATE TABLE IF NOT EXISTS project_details (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE UNIQUE,

  -- מידע בסיסי
  form_number TEXT DEFAULT 'B-80',
  project_number INTEGER,
  location TEXT,                          -- מיקום הפרויקט
  description TEXT,                       -- תיאור הפרויקט

  -- תאריכים
  order_received_date DATE,               -- תאריך קבלת ההזמנה
  approved_order_date DATE,               -- תאריך ההזמנה המאושרת
  pipe_installation_start DATE,           -- תאריך התחלת הנחת צנרת

  -- גורמים
  ordering_entity TEXT,                   -- מזמין הפרויקט
  responsible_party TEXT,                 -- הגורם שהפרויקט באחריותו

  -- סוג פרויקט והתקנה
  project_type TEXT,                      -- ביוב, מים, תשתית וכו׳
  installation_type TEXT,                 -- חפירה פתוחה / השחלה בשרוול / דחיקה
  special_requirements TEXT,              -- דרישות מיוחדות לצנרת
  field_supervision TEXT,                 -- האם נדרש פיקוח שרות שדה

  -- שדות דחיקה (רלוונטי רק כשסוג ההתקנה = דחיקה)
  soil_type TEXT,                         -- סוג הקרקע באתר הדחיקה
  push_depth TEXT,                        -- עומק הדחיקה
  manhole_type TEXT,                      -- סוג השוחות
  connection_method TEXT,                 -- אופן התחברות לשוחות

  -- סטטוס פרויקט
  project_status TEXT DEFAULT 'תכנון כללי' CHECK (project_status IN (
    'תכנון כללי',
    'תכנון מפורט',
    'טרום מכרז',
    'מועד הגשת מכרז',
    'קבלן זוכה'
  )),
  tender_submission_date DATE,            -- מועד הגשת המכרז
  winning_contractor TEXT,                -- קבלן זוכה
  winning_date DATE,                      -- תאריך הכרזה על קבלן זוכה
  expected_pipe_order_date DATE,          -- צפי מועד להזמנת צנרת

  -- סיפור ואינטליגנציה
  project_story TEXT,                     -- סיפור הפרויקט
  competitors TEXT,                       -- מתחרים
  assessments TEXT,                       -- הערכות
  politics TEXT,                          -- פוליטיקה

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. אנשי קשר לפרויקט (many per project)
CREATE TABLE IF NOT EXISTS project_contacts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                     -- מזמין, מלווה מטעם מזמין, קבלן, מנהל פרויקט, מפקח, מתכנן, משרד מתכנן
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. מפרט צינורות (many per project)
CREATE TABLE IF NOT EXISTS pipe_specs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  diameter_mm INTEGER NOT NULL,           -- קוטר צינור (מ"מ)
  line_length_m NUMERIC(10,2),            -- אורך קו (מ׳)
  unit_length_m NUMERIC(6,2),             -- אורך יחידת הצינור (מ׳)
  stiffness_pascal INTEGER,               -- קשיחות צינור (פסקל)
  pressure_bar NUMERIC(6,2),              -- לחץ עבודה (בר)
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE project_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipe_specs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_project_details" ON project_details FOR SELECT USING (true);
CREATE POLICY "anon_write_project_details" ON project_details FOR ALL USING (true);

CREATE POLICY "anon_read_project_contacts" ON project_contacts FOR SELECT USING (true);
CREATE POLICY "anon_write_project_contacts" ON project_contacts FOR ALL USING (true);

CREATE POLICY "anon_read_pipe_specs" ON pipe_specs FOR SELECT USING (true);
CREATE POLICY "anon_write_pipe_specs" ON pipe_specs FOR ALL USING (true);
