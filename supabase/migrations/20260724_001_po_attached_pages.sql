-- ============================================================
-- 20260724_001: pages attached to a purchase order
-- ============================================================
-- import_orders.attached_pages jsonb: [{path, page, label}] — a page picked
-- from a signed customer scan (order confirmation / quote upload) or a whole
-- drawing file linked to the quote. Rendered as full A4 pages at the end of
-- the PO PDF. No RLS change — existing import_orders policies cover it.
ALTER TABLE public.import_orders
  ADD COLUMN IF NOT EXISTS attached_pages jsonb;
