-- 20260622_001_import_module.sql
-- מודול יבוא: הזמנות רכש מפיברטק לספקים, מעקב משלוח, מסמכים,
-- מכולות, התאמה כמותית/חשבונאית, ותעודות משלוח ללקוח.
-- RLS מגודר לפי מודול 'import' (has_module_permission).
--
-- הערה: טבלת public.suppliers כבר קיימת (master-data של מערכת התמחור,
-- מקושרת ל-supplier_quotes). היא לא נוצרת/נשנית כאן — import_orders רק מפנה אליה.
-- ה-SELECT שלה כבר כולל import.view; ה-WRITE דורש settings.edit.

-- ============================================================
-- 1. הזמנות יבוא (הזמנת רכש מפיברטק לספק)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.import_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT,                                              -- מספר הזמנת רכש
  supplier_id UUID REFERENCES public.suppliers(id),
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL, -- NULL = יבוא מלאי
  is_stock BOOLEAN DEFAULT false,                              -- יבוא מלאי
  status TEXT NOT NULL DEFAULT 'po_sent',
    -- po_sent|confirmed|booking|sailing|docs_received|at_port|customs_cleared|delivered|closed
  currency TEXT DEFAULT 'EUR',
  total_amount NUMERIC(14,2) DEFAULT 0,                        -- סכום הזמנת רכש
  order_date DATE,
  confirmed_ship_date DATE,                                    -- תאריך יעד למשלוח (מהספק)
  booking_ref TEXT,                                            -- שריון אוניה / בוקינג
  vessel_name TEXT,                                            -- שם אוניה
  bl_number TEXT,                                              -- שטר מטען BL
  etd DATE,                                                    -- מועד הפלגה
  eta DATE,                                                    -- מועד הגעה צפוי
  port TEXT,                                                   -- נמל יעד
  customs_agent TEXT,                                          -- עמיל מכס
  customs_clearance_date DATE,                                 -- תאריך שחרור
  customs_final_amount NUMERIC(14,2),                          -- גמר חשבון מעמיל (הוצאות שחרור)
  supplier_invoice_number TEXT,
  supplier_invoice_amount NUMERIC(14,2),
  invoice_matches_po BOOLEAN,                                  -- חשבונית ספק תואמת הזמנת רכש
  carrier TEXT,                                                -- מוביל
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. פריטי הזמנה (מעקב כמותי: הוזמן מול התקבל)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.import_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_order_id UUID NOT NULL REFERENCES public.import_orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  dn TEXT,
  pn TEXT,
  sn TEXT,
  unit TEXT DEFAULT 'm',
  ordered_qty NUMERIC(14,2) DEFAULT 0,
  received_qty NUMERIC(14,2) DEFAULT 0,
  unit_price NUMERIC(14,2),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. מכולות (מבנה בסיסי; פירוט מלא יתווסף לפי האקסל של נורית)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.import_containers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_order_id UUID NOT NULL REFERENCES public.import_orders(id) ON DELETE CASCADE,
  container_number TEXT,
  seal_number TEXT,
  contents TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 4. מסמכי יבוא (מגובה Storage: bucket project-files, prefix import/)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.import_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_order_id UUID NOT NULL REFERENCES public.import_orders(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
    -- purchase_order|order_confirmation|packing_list|commercial_invoice|vgm|analysis|bl|customs_account|other
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. תעודות משלוח ללקוח + העברה להנה״ח
-- ============================================================
CREATE TABLE IF NOT EXISTS public.import_delivery_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_order_id UUID NOT NULL REFERENCES public.import_orders(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  delivery_note_number TEXT,
  delivery_date DATE,
  quantity_summary TEXT,
  signed BOOLEAN DEFAULT false,
  signed_file_path TEXT,
  sent_to_accounting BOOLEAN DEFAULT false,                    -- הועבר להנה״ח
  invoice_issued BOOLEAN DEFAULT false,                        -- הופקה חשבונית מס
  invoice_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- אינדקסים
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_import_orders_supplier ON public.import_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_import_orders_project  ON public.import_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_import_orders_status   ON public.import_orders(status);
CREATE INDEX IF NOT EXISTS idx_import_order_items_ord ON public.import_order_items(import_order_id);
CREATE INDEX IF NOT EXISTS idx_import_containers_ord  ON public.import_containers(import_order_id);
CREATE INDEX IF NOT EXISTS idx_import_documents_ord   ON public.import_documents(import_order_id);
CREATE INDEX IF NOT EXISTS idx_import_delivery_ord    ON public.import_delivery_notes(import_order_id);

-- ============================================================
-- RLS — מגודר לפי מודול 'import'
--   select = view, insert/update = edit, delete = full
-- ============================================================
ALTER TABLE public.import_orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_order_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_containers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_delivery_notes ENABLE ROW LEVEL SECURITY;

-- import_orders
CREATE POLICY import_orders_select ON public.import_orders FOR SELECT TO authenticated
  USING (public.has_module_permission('import', 'view'));
CREATE POLICY import_orders_insert ON public.import_orders FOR INSERT TO authenticated
  WITH CHECK (public.has_module_permission('import', 'edit'));
CREATE POLICY import_orders_update ON public.import_orders FOR UPDATE TO authenticated
  USING (public.has_module_permission('import', 'edit'))
  WITH CHECK (public.has_module_permission('import', 'edit'));
CREATE POLICY import_orders_delete ON public.import_orders FOR DELETE TO authenticated
  USING (public.has_module_permission('import', 'full'));

-- import_order_items
CREATE POLICY import_order_items_select ON public.import_order_items FOR SELECT TO authenticated
  USING (public.has_module_permission('import', 'view'));
CREATE POLICY import_order_items_insert ON public.import_order_items FOR INSERT TO authenticated
  WITH CHECK (public.has_module_permission('import', 'edit'));
CREATE POLICY import_order_items_update ON public.import_order_items FOR UPDATE TO authenticated
  USING (public.has_module_permission('import', 'edit'))
  WITH CHECK (public.has_module_permission('import', 'edit'));
CREATE POLICY import_order_items_delete ON public.import_order_items FOR DELETE TO authenticated
  USING (public.has_module_permission('import', 'full'));

-- import_containers
CREATE POLICY import_containers_select ON public.import_containers FOR SELECT TO authenticated
  USING (public.has_module_permission('import', 'view'));
CREATE POLICY import_containers_insert ON public.import_containers FOR INSERT TO authenticated
  WITH CHECK (public.has_module_permission('import', 'edit'));
CREATE POLICY import_containers_update ON public.import_containers FOR UPDATE TO authenticated
  USING (public.has_module_permission('import', 'edit'))
  WITH CHECK (public.has_module_permission('import', 'edit'));
CREATE POLICY import_containers_delete ON public.import_containers FOR DELETE TO authenticated
  USING (public.has_module_permission('import', 'full'));

-- import_documents
CREATE POLICY import_documents_select ON public.import_documents FOR SELECT TO authenticated
  USING (public.has_module_permission('import', 'view'));
CREATE POLICY import_documents_insert ON public.import_documents FOR INSERT TO authenticated
  WITH CHECK (public.has_module_permission('import', 'edit'));
CREATE POLICY import_documents_update ON public.import_documents FOR UPDATE TO authenticated
  USING (public.has_module_permission('import', 'edit'))
  WITH CHECK (public.has_module_permission('import', 'edit'));
CREATE POLICY import_documents_delete ON public.import_documents FOR DELETE TO authenticated
  USING (public.has_module_permission('import', 'full'));

-- import_delivery_notes
CREATE POLICY import_delivery_notes_select ON public.import_delivery_notes FOR SELECT TO authenticated
  USING (public.has_module_permission('import', 'view'));
CREATE POLICY import_delivery_notes_insert ON public.import_delivery_notes FOR INSERT TO authenticated
  WITH CHECK (public.has_module_permission('import', 'edit'));
CREATE POLICY import_delivery_notes_update ON public.import_delivery_notes FOR UPDATE TO authenticated
  USING (public.has_module_permission('import', 'edit'))
  WITH CHECK (public.has_module_permission('import', 'edit'));
CREATE POLICY import_delivery_notes_delete ON public.import_delivery_notes FOR DELETE TO authenticated
  USING (public.has_module_permission('import', 'full'));

-- ============================================================
-- GRANTs (אין auto-expose; הרשאות מפורשות ל-authenticated, RLS מסנן)
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_orders         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_order_items    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_containers     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_documents      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_delivery_notes TO authenticated;
