-- ============================================================
-- 20260726_001: unit length on purchase-order lines
-- ============================================================
-- Mirrors cost_input_items.length_m / quote_items.length_m: drives the
-- computed units column (qty ÷ length) in the PO editor and document.
-- No RLS change — existing import_order_items policies cover it.
ALTER TABLE public.import_order_items
  ADD COLUMN IF NOT EXISTS length_m numeric;
