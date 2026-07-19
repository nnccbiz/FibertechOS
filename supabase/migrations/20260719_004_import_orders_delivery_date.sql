-- Requested delivery date on a purchase order (shown on the PO document,
-- replaces the unused supplier_project_no field in the procurement editor).
ALTER TABLE public.import_orders ADD COLUMN IF NOT EXISTS delivery_date date;
