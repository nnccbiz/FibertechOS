-- תאריך עדכון אוטומטי לפרויקט: כל "נגיעה" בפרויקט — בשורה עצמה או בכל
-- טבלה ששייכת לו — מטביעה projects.last_updated_at.
-- אין עמודות חדשות (created_at ו-last_updated_at כבר קיימים) ואין שינוי RLS.

-- א. שינוי בשורת הפרויקט עצמו
CREATE OR REPLACE FUNCTION stamp_project_row() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.last_updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_projects_stamp ON projects;
CREATE TRIGGER trg_projects_stamp BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION stamp_project_row();

-- ב. שינוי בטבלה ששייכת לפרויקט. SECURITY DEFINER כי מי שעורך מסמך/הצעה
--    לא בהכרח מורשה לעדכן את שורת הפרויקט תחת RLS.
CREATE OR REPLACE FUNCTION touch_parent_project() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; old_pid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    pid := OLD.project_id;
  ELSE
    pid := NEW.project_id;
    IF TG_OP = 'UPDATE' THEN old_pid := OLD.project_id; END IF;
  END IF;
  IF pid IS NOT NULL THEN
    UPDATE projects SET last_updated_at = now() WHERE id = pid;
  END IF;
  -- שורה שהועברה בין פרויקטים — שני הצדדים "נגעו"
  IF old_pid IS NOT NULL AND old_pid IS DISTINCT FROM pid THEN
    UPDATE projects SET last_updated_at = now() WHERE id = old_pid;
  END IF;
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION touch_parent_project() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION stamp_project_row() FROM anon, authenticated;

-- ג. חיבור הטריגר לכל טבלה שמייצגת עבודה על הפרויקט.
--    alerts מוחרגת בכוונה (הקרון כותב אליה לבד — היה מקפיץ את התאריך כל בוקר).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'project_details', 'project_contacts', 'pipe_specs', 'project_updates',
    'quotes', 'cost_inputs', 'attachments', 'orders', 'fitting_estimates',
    'import_orders', 'customer_invoices', 'import_customer_deliveries', 'purchase_receipts'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_project ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_touch_project AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION touch_parent_project()', t);
  END LOOP;
END $$;
