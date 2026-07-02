-- 20260702_001_import_order_origin.sql
-- Track how an import order was created, and prepare the תפ"י (planning) review step.
--
--   origin      — 'manual' (created in /import) | 'auto_from_quote' (seeded when a
--                 customer quote was signed). Lets the UI badge auto-seeded drafts
--                 and lets a future suggestion engine learn from Nitzan's edits.
--   reviewed_at — when Nitzan checked the draft and released it (draft → planned).
--   reviewed_by — who released it.
--
-- Additive only. No RLS change, no CHECK constraint on status (status stays free
-- TEXT, so the new 'draft'/'planned' values need no migration).

ALTER TABLE public.import_orders
  ADD COLUMN IF NOT EXISTS origin      TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN public.import_orders.origin IS
  'manual | auto_from_quote — provenance of the import order';
COMMENT ON COLUMN public.import_orders.reviewed_at IS
  'set when a planner released the auto-seeded draft (draft -> planned)';
