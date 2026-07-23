-- ============================================================
-- 20260723_003: proforma invoices + uploaded invoice files + line detail
-- ============================================================
-- customer_invoices gains: 'proforma' type (numbered PF-YYYY-NNN via
-- next_doc_number), a jsonb lines detail (feeds the proforma A4 document),
-- and file_path for the SAP-issued invoice PDF uploaded to storage.
-- No RLS change — existing customer_invoices policies cover the new columns.

ALTER TABLE public.customer_invoices DROP CONSTRAINT customer_invoices_invoice_type_check;
ALTER TABLE public.customer_invoices ADD CONSTRAINT customer_invoices_invoice_type_check
  CHECK (invoice_type IN ('delivery','advance','milestone','final','proforma','other'));

ALTER TABLE public.customer_invoices
  ADD COLUMN IF NOT EXISTS lines jsonb,
  ADD COLUMN IF NOT EXISTS file_path text;
