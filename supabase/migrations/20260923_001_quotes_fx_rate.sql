-- שער חליפין נעול להצעה שמוצאת במט"ח (ILS ליחידת מטבע), ותאריך השער.
-- ריק בהצעות שקליות (quotes.currency='ILS', ברירת המחדל).
-- התמחור הפנימי ו-total_amount נשארים בשקלים; ההמרה היא לתצוגה ללקוח בלבד.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS fx_rate NUMERIC(12,4);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS fx_rate_date DATE;
