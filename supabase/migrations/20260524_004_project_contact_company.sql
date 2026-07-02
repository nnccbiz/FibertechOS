-- Allow noting which company each project contact belongs to.
ALTER TABLE project_contacts
  ADD COLUMN IF NOT EXISTS company TEXT;
