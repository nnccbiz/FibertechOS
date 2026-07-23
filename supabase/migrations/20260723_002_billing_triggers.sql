-- ============================================================
-- 20260723_002: billing trigger anchor on quotes
-- ============================================================
-- The billing engine (cron rules 9a-9c) derives WHEN to bill from the signed
-- quote's payment terms. 'auto' = keyword detection from payment_terms text
-- (lib/billing.ts); the columns let the user override per deal.
-- billing_advance_pct: NULL = auto-detect "מקדמה X%" from the terms text.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS billing_trigger text NOT NULL DEFAULT 'auto'
    CHECK (billing_trigger IN ('auto','delivery','port_arrival')),
  ADD COLUMN IF NOT EXISTS billing_advance_pct numeric;
