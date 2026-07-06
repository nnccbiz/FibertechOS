-- 20260706_002: why did we lose? — lost_reason on rejected quotes.
-- Captured by a small dialog when a quote is marked נדחה; feeds win-rate
-- analysis and the pricing engine later.
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS lost_reason text;
