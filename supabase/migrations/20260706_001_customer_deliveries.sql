-- ============================================================
-- 20260706_001: customer delivery certificates — signing + accounting flow
-- ============================================================
-- import_customer_deliveries existed (with RLS: import view/edit/full) but had
-- no writer. This adds the columns for the full flow:
--   container auto-fill · items snapshot · remote-signing share token ·
--   signature capture · send-to-accounting / invoice stamps.
-- RLS policies are NOT touched — the existing import-module policies stand.
-- The public signing page never touches this table directly: it goes through
-- /api/delivery-sign/[token] (service role, token-gated).

ALTER TABLE public.import_customer_deliveries
  ADD COLUMN IF NOT EXISTS container_id uuid REFERENCES public.import_containers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS items jsonb,
  ADD COLUMN IF NOT EXISTS share_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS share_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS signer_name text,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signature_file_path text,
  ADD COLUMN IF NOT EXISTS sent_to_accounting_at timestamptz,
  ADD COLUMN IF NOT EXISTS accounting_assignee uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE INDEX IF NOT EXISTS idx_icd_order ON public.import_customer_deliveries (import_order_id);
CREATE INDEX IF NOT EXISTS idx_icd_project ON public.import_customer_deliveries (project_id);
CREATE INDEX IF NOT EXISTS idx_icd_pending_invoice
  ON public.import_customer_deliveries (sent_to_accounting, invoice_issued)
  WHERE sent_to_accounting = true AND invoice_issued = false;

-- Per project convention — explicit grants (RLS still governs rows).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_customer_deliveries TO authenticated;
