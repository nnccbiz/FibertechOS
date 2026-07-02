-- 20260614_001: add PN (pressure) / SN (stiffness) columns to quote_items.
-- These are pulled from the project's pipe_specs (pressure_bar / stiffness_pascal)
-- by matching DN when a quote is built, and are editable per quote line.
-- quote_items is an existing table with RLS + grants already in place, so no
-- grant/RLS changes are needed here.

ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS pn numeric;
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS sn integer;

COMMENT ON COLUMN public.quote_items.pn IS 'לחץ עבודה (PN, בר) — נמשך ממפרט הצנרת לפי DN, ניתן לעריכה';
COMMENT ON COLUMN public.quote_items.sn IS 'קשיחות (SN, פסקל) — נמשכת ממפרט הצנרת לפי DN, ניתנת לעריכה';
