-- 012: Add pipe_type to pipe_specs
ALTER TABLE pipe_specs ADD COLUMN IF NOT EXISTS pipe_type TEXT DEFAULT 'הטמנה';

COMMENT ON COLUMN pipe_specs.pipe_type IS 'סוג צינור: הטמנה / דחיקה (jacking) / השחלה (slip lining) / עילי / ביאקסיאלי';
