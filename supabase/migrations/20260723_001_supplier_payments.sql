-- ============================================================
-- 20260723_001: supplier payments — due dates + partial payments on import_invoices
-- ============================================================
-- Extends the EXISTING supplier-invoice table (import_invoices); its existing
-- RLS policies are untouched. New table supplier_payments gets the import-module
-- pattern + GRANTs per convention.

-- 1. מועד פירעון + סטטוס תשלום על חשבונית הספק
ALTER TABLE public.import_invoices
  ADD COLUMN IF NOT EXISTS payment_due_date date,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'open'
    CHECK (payment_status IN ('open','partially_paid','paid','cancelled')),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- 2. תשלומים לספק — חלקיים (מקדמה / ביניים / יתרה), במטבע החשבונית.
CREATE TABLE public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.import_invoices(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_at date NOT NULL DEFAULT CURRENT_DATE,
  method text CHECK (method IN ('bank_transfer','check','credit','cash','other')),
  reference text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sp_invoice ON public.supplier_payments(invoice_id);

-- 3. טריגר סנכרון סטטוס — סכום התשלומים מול הסכום לתשלום
--    (final_amount, fallback net_value+freight).
CREATE OR REPLACE FUNCTION public.sync_supplier_invoice_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invoice uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_paid numeric; v_total numeric; v_status text;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.supplier_payments WHERE invoice_id = v_invoice;
  SELECT COALESCE(final_amount, COALESCE(net_value, 0) + COALESCE(freight, 0)), payment_status
    INTO v_total, v_status FROM public.import_invoices WHERE id = v_invoice;
  IF v_status IS NULL OR v_status = 'cancelled' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  UPDATE public.import_invoices SET
    payment_status = CASE
      WHEN v_paid <= 0 THEN 'open'
      WHEN v_total > 0 AND v_paid >= v_total THEN 'paid'
      ELSE 'partially_paid' END,
    paid_at = CASE
      WHEN v_total > 0 AND v_paid >= v_total THEN COALESCE(paid_at, now())
      ELSE NULL END
  WHERE id = v_invoice;
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE EXECUTE ON FUNCTION public.sync_supplier_invoice_status() FROM anon, authenticated;

CREATE TRIGGER trg_sync_supplier_invoice
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_invoice_status();

-- 4. View יתרות ספק
CREATE VIEW public.supplier_invoice_balances
WITH (security_invoker = true) AS
SELECT i.*,
       COALESCE(i.final_amount, COALESCE(i.net_value, 0) + COALESCE(i.freight, 0)) AS payable_amount,
       COALESCE(p.paid_total, 0) AS paid_total,
       COALESCE(i.final_amount, COALESCE(i.net_value, 0) + COALESCE(i.freight, 0))
         - COALESCE(p.paid_total, 0) AS balance
FROM public.import_invoices i
LEFT JOIN (
  SELECT invoice_id, SUM(amount) AS paid_total
  FROM public.supplier_payments GROUP BY invoice_id
) p ON p.invoice_id = i.id;

-- 5. RLS — תבנית מודול import על הטבלה החדשה בלבד.
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_payments_select ON public.supplier_payments FOR SELECT TO authenticated
  USING (public.has_module_permission('import','view'));
CREATE POLICY supplier_payments_insert ON public.supplier_payments FOR INSERT TO authenticated
  WITH CHECK (public.has_module_permission('import','edit'));
CREATE POLICY supplier_payments_update ON public.supplier_payments FOR UPDATE TO authenticated
  USING (public.has_module_permission('import','edit'));
CREATE POLICY supplier_payments_delete ON public.supplier_payments FOR DELETE TO authenticated
  USING (public.has_module_permission('import','full'));

-- 6. GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_payments TO authenticated;
GRANT SELECT ON public.supplier_invoice_balances TO authenticated;
