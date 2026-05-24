-- Customer card: company registration number (ח.פ.) and full address.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS tax_id  TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT;
