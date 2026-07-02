-- Link each quote to a specific project contact (the addressee).
-- Fixes the preview pulling the project's first contact for every quote.
-- ON DELETE SET NULL: deleting a contact won't block; the quote falls back
-- to the project's first contact in the UI.
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES project_contacts(id) ON DELETE SET NULL;
