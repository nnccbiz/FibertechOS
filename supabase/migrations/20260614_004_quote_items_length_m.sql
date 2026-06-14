-- 20260614_004: carry unit length onto quote_items.
-- cost_input_items has length_m (populated by Gemini extraction) but quote_items
-- didn't, so the value was lost when a quote was built from a cost input. Add the
-- column so it can be propagated alongside pn/sn.

ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS length_m numeric;

COMMENT ON COLUMN public.quote_items.length_m IS 'אורך יחידה (מ׳) — נמשך מ-cost_input_items בעת בניית ההצעה';
