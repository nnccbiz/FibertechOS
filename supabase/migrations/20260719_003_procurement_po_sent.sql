-- Procurement stage: a PO lives in /procurement until Nitzan sends it to the
-- supplier; only then (po_sent_at stamped) it appears in /import.
ALTER TABLE public.import_orders ADD COLUMN IF NOT EXISTS po_sent_at timestamptz;
ALTER TABLE public.import_orders ADD COLUMN IF NOT EXISTS po_sent_by uuid REFERENCES auth.users(id);
-- Historical orders are already with the supplier — keep them in /import.
UPDATE public.import_orders SET po_sent_at = COALESCE(order_date::timestamptz, created_at) WHERE po_sent_at IS NULL;
