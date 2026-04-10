-- ============================================================
-- Migration 003: AI Activity Log with Undo Support
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_activity_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  -- מי ומתי
  user_id uuid,                           -- המשתמש שהפעיל את הפקודה
  user_name TEXT,                          -- שם המשתמש
  created_at TIMESTAMPTZ DEFAULT now(),

  -- מה הפקודה
  command_text TEXT NOT NULL,              -- הטקסט המקורי שהמשתמש הזין
  action_type TEXT NOT NULL CHECK (action_type IN (
    'create', 'update', 'delete', 'import', 'generate'
  )),

  -- על מה פעל
  target_table TEXT NOT NULL,              -- שם הטבלה שעודכנה
  target_id uuid,                          -- מזהה הרשומה שעודכנה
  target_label TEXT,                       -- תיאור קריא (למשל: "פרויקט מאסף ביוב רמת השרון")

  -- מה השתנה (לצורך Undo)
  changes_applied JSONB NOT NULL,          -- השדות החדשים שהוחלו
  previous_values JSONB,                   -- הערכים הקודמים (לפני השינוי)

  -- מקור
  source_type TEXT DEFAULT 'command' CHECK (source_type IN (
    'command',   -- פקודת טקסט
    'document',  -- עיבוד מסמך
    'chat'       -- שיחה
  )),
  source_file_name TEXT,                   -- שם הקובץ אם הועלה מסמך

  -- סטטוס
  status TEXT DEFAULT 'applied' CHECK (status IN (
    'applied',   -- הפעולה בוצעה
    'reverted',  -- הפעולה בוטלה (undo)
    'failed'     -- הפעולה נכשלה
  )),
  reverted_at TIMESTAMPTZ,                 -- מתי בוטל

  -- סיכום AI
  summary TEXT NOT NULL,                   -- תיאור קריא של מה ה-AI עשה
  fields_count INTEGER DEFAULT 0           -- כמה שדות עודכנו
);

-- Index for fast dashboard queries
CREATE INDEX idx_ai_log_created ON ai_activity_log (created_at DESC);
CREATE INDEX idx_ai_log_status ON ai_activity_log (status);
CREATE INDEX idx_ai_log_target ON ai_activity_log (target_table, target_id);

-- RLS
ALTER TABLE ai_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access_ai_log" ON ai_activity_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "anon_read_ai_log" ON ai_activity_log
  FOR SELECT TO anon USING (true);

-- Allow anon write for current dev phase
CREATE POLICY "anon_write_ai_log" ON ai_activity_log
  FOR ALL TO anon USING (true) WITH CHECK (true);
