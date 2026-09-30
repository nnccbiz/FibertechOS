-- פרטי קשר לספק: מייל וטלפון (עמודות בלבד — אין שינוי RLS; הפוליסות הקיימות של suppliers חלות).
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text;
