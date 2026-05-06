-- 015: Add archive flag to cost_inputs
ALTER TABLE cost_inputs ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
