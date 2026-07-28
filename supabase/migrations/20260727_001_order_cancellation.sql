-- ============================================================
-- 20260727_001: documented cancellation — purchase orders + customer orders
-- ============================================================
-- A signed deal that turns out wrong is CANCELLED with a reason, never deleted:
-- status='cancelled' (no CHECK constraint exists on either status column) +
-- who/when/why. No RLS change.

ALTER TABLE public.import_orders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancel_reason text;
