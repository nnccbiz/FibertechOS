-- 017: Add delivery_time field to quotes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS delivery_time TEXT DEFAULT '70 ימי עבודה מיום סגירת הזמנה - אישור הצעת מחיר, חתימה על שרטוט לייצור ותשלום מקדמה';
