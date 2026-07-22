-- ============================================================
-- 20260722_001: collections module — customer invoices, payments, follow-up log
-- ============================================================
-- New tables only. RLS: new policies on the NEW tables (import-module pattern);
-- NO existing policy is touched. Convention: explicit GRANTs alongside RLS.

-- 1. חשבוניות לקוח — שורה לכל חשבונית מס. יכולה לכסות כמה תעודות משלוח,
--    או לעמוד לבד (מקדמה / אבן-דרך / חשבונית ידנית).
CREATE TABLE public.customer_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text,
  customer_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  invoice_type text NOT NULL DEFAULT 'delivery'
    CHECK (invoice_type IN ('delivery','advance','milestone','final','other')),
  amount numeric(14,2) NOT NULL DEFAULT 0,
  vat_amount numeric(14,2) NOT NULL DEFAULT 0,
  total_amount numeric(14,2) GENERATED ALWAYS AS (amount + vat_amount) STORED,
  issued_at date,
  payment_terms text,
  payment_due_date date,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','partially_paid','paid','cancelled')),
  paid_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ci_customer ON public.customer_invoices(customer_id);
CREATE INDEX idx_ci_project  ON public.customer_invoices(project_id);
CREATE INDEX idx_ci_open     ON public.customer_invoices(status, payment_due_date)
  WHERE status IN ('open','partially_paid');

-- 2. תקבולים — תשלומים חלקיים, אמצעי תשלום ואסמכתא.
CREATE TABLE public.customer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.customer_invoices(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_at date NOT NULL DEFAULT CURRENT_DATE,
  method text CHECK (method IN ('bank_transfer','check','credit','cash','other')),
  reference text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cp_invoice ON public.customer_payments(invoice_id);

-- 3. יומן גבייה — שיחה/מייל/הבטחת תשלום + תאריך פעולה הבאה + אחראי.
CREATE TABLE public.collection_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.customer_invoices(id) ON DELETE CASCADE,
  activity_type text NOT NULL
    CHECK (activity_type IN ('call','email','meeting','promise','note')),
  summary text NOT NULL,
  promised_date date,
  next_action_date date,
  assignee uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ca_invoice ON public.collection_activities(invoice_id);
CREATE INDEX idx_ca_next ON public.collection_activities(next_action_date)
  WHERE next_action_date IS NOT NULL;

-- 4. קישור תעודת משלוח ← חשבונית (חשבונית אחת יכולה לכסות כמה תעודות).
ALTER TABLE public.import_customer_deliveries
  ADD COLUMN IF NOT EXISTS customer_invoice_id uuid
    REFERENCES public.customer_invoices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_icd_invoice
  ON public.import_customer_deliveries(customer_invoice_id);

-- 5. טריגר: תקבול נרשם/עודכן/נמחק ⇒ סטטוס החשבונית מסונכרן.
CREATE OR REPLACE FUNCTION public.sync_invoice_payment_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invoice uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_paid numeric; v_total numeric; v_status text;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.customer_payments WHERE invoice_id = v_invoice;
  SELECT total_amount, status INTO v_total, v_status
    FROM public.customer_invoices WHERE id = v_invoice;
  IF v_status IS NULL OR v_status = 'cancelled' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  UPDATE public.customer_invoices SET
    status = CASE
      WHEN v_paid <= 0 THEN 'open'
      WHEN v_total > 0 AND v_paid >= v_total THEN 'paid'
      ELSE 'partially_paid' END,
    paid_at = CASE
      WHEN v_total > 0 AND v_paid >= v_total THEN COALESCE(paid_at, now())
      ELSE NULL END,
    updated_at = now()
  WHERE id = v_invoice;
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE EXECUTE ON FUNCTION public.sync_invoice_payment_status() FROM anon, authenticated;

CREATE TRIGGER trg_sync_invoice_status
  AFTER INSERT OR UPDATE OR DELETE ON public.customer_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_payment_status();

-- 6. View יתרות — balance = total_amount - סכום תקבולים.
CREATE VIEW public.customer_invoice_balances
WITH (security_invoker = true) AS
SELECT i.*,
       COALESCE(p.paid_total, 0) AS paid_total,
       i.total_amount - COALESCE(p.paid_total, 0) AS balance
FROM public.customer_invoices i
LEFT JOIN (
  SELECT invoice_id, SUM(amount) AS paid_total
  FROM public.customer_payments GROUP BY invoice_id
) p ON p.invoice_id = i.id;

-- 7. RLS — תבנית מודול import (select=view, insert/update=edit, delete=full).
ALTER TABLE public.customer_invoices     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_activities ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customer_invoices','customer_payments','collection_activities'] LOOP
    EXECUTE format($p$CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO authenticated
      USING (public.has_module_permission('import','view'));$p$, t);
    EXECUTE format($p$CREATE POLICY %1$s_insert ON public.%1$I FOR INSERT TO authenticated
      WITH CHECK (public.has_module_permission('import','edit'));$p$, t);
    EXECUTE format($p$CREATE POLICY %1$s_update ON public.%1$I FOR UPDATE TO authenticated
      USING (public.has_module_permission('import','edit'));$p$, t);
    EXECUTE format($p$CREATE POLICY %1$s_delete ON public.%1$I FOR DELETE TO authenticated
      USING (public.has_module_permission('import','full'));$p$, t);
  END LOOP;
END $$;

-- 8. GRANTs לפי הקונבנציה (RLS עדיין שולט בשורות).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_invoices     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_payments     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collection_activities TO authenticated;
GRANT SELECT ON public.customer_invoice_balances TO authenticated;

-- 9. Backfill: כל תעודה קיימת עם חשבונית ⇒ שורת customer_invoices מקושרת.
--    סכומים היסטוריים לא נשמרו במערכת ⇒ 0, להשלמה ידנית במסך הגבייה.
DO $$
DECLARE d record; new_id uuid;
BEGIN
  FOR d IN
    SELECT dd.id, dd.project_id, dd.invoice_number, dd.invoice_issued_at,
           dd.payment_due_date, dd.paid, dd.paid_at, dd.created_at,
           p.customer_id AS cust_id
    FROM public.import_customer_deliveries dd
    LEFT JOIN public.projects p ON p.id = dd.project_id
    WHERE dd.invoice_issued = true AND dd.customer_invoice_id IS NULL
  LOOP
    INSERT INTO public.customer_invoices
      (invoice_number, customer_id, project_id, invoice_type, amount, vat_amount,
       issued_at, payment_due_date, status, paid_at, notes)
    VALUES
      (d.invoice_number, d.cust_id, d.project_id, 'delivery', 0, 0,
       COALESCE(d.invoice_issued_at::date, d.created_at::date), d.payment_due_date,
       CASE WHEN d.paid THEN 'paid' ELSE 'open' END, d.paid_at,
       'הוסב אוטומטית מתעודת משלוח — יש להשלים סכום')
    RETURNING id INTO new_id;
    UPDATE public.import_customer_deliveries
      SET customer_invoice_id = new_id WHERE id = d.id;
  END LOOP;
END $$;
