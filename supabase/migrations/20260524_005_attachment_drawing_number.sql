-- Drawing number read from the drawing's title block (e.g. 7156-40).
-- Displayed in the system as {project_number}/{drawing_number}.
ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS drawing_number TEXT;
