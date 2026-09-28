-- מעקב יבוא פר-מכולה (לפי גיליון המעקב של נורית — docs/דוגמת מעקב יבוא איסכור).
-- עמודות בלבד: אין טבלאות חדשות ואין שינוי RLS — הפוליסות הקיימות של מודול
-- היבוא (select=view, insert/update=edit, delete=full) חלות על העמודות החדשות.

-- א. פרטי LOT ברמת המשלוח (נקלטים ידנית במעקב)
ALTER TABLE public.import_shipments
  ADD COLUMN IF NOT EXISTS lot_label text,                -- "LOT3a"
  ADD COLUMN IF NOT EXISTS released_at date,              -- תאריך שחרור מהנמל
  ADD COLUMN IF NOT EXISTS customer_delivery_date date;   -- תאריך אספקה ללקוח

-- ב. שורת תעודת משלוח: הפניה לשורת הזמנת הספק + מסמך המקור שממנו נחלצה
ALTER TABLE public.import_packing_lines
  ADD COLUMN IF NOT EXISTS supplier_order_item text,      -- "1322250749/000030"
  ADD COLUMN IF NOT EXISTS source_document_id uuid REFERENCES public.import_documents(id) ON DELETE SET NULL;

-- ג. חשבונית ו-COA: מסמך המקור (כל נתון במעקב פותח את המסמך שממנו נלקח)
ALTER TABLE public.import_invoices
  ADD COLUMN IF NOT EXISTS source_document_id uuid REFERENCES public.import_documents(id) ON DELETE SET NULL;
ALTER TABLE public.import_coa
  ADD COLUMN IF NOT EXISTS source_document_id uuid REFERENCES public.import_documents(id) ON DELETE SET NULL;

-- ד. סימון ידני "הושלם" לפריט הזמנה (אחרת פריט הושלם רק כשנשלח >= הוזמן)
ALTER TABLE public.import_order_items
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES auth.users(id);
