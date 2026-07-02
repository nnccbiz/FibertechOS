-- 20260614_003: freeze the printed quote date with a dedicated sent_at.
-- The preview used quote.updated_at as the date for non-draft quotes, but
-- updated_at bumps on any back-office edit (notes, drawings, contact), so a
-- sent quote's printed date silently drifted forward. sent_at is stamped once,
-- when the quote first transitions to sent/signed, and never moves after.

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS sent_at timestamptz;

COMMENT ON COLUMN public.quotes.sent_at IS 'מתי ההצעה נשלחה/נחתמה לראשונה — מקפיא את תאריך ההצעה המודפס';
