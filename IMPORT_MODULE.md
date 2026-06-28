# מודול יבוא (Import) — תיעוד עבודה

> נוצר 2026-06-23. קובץ תיעוד למודול היבוא — מה הוחלט, מה נבנה, ומה נשאר.
> אינו מחליף את `CLAUDE.md` הראשי (שנשאר קנוני).

## 1. מטרת המודול

ניהול תהליך היבוא המלא של צינורות GRP מהספקים (Amiblu / Subor) עד ללקוח:
הזמנת רכש → אישור ספק → שריון אוניה/בוקינג → הפלגה → קבלת מסמכים →
הגעה לנמל → שחרור ממכס → אספקה ללקוח → סגירה.
כולל מעקב כמותי (הוזמן מול התקבל), התאמת חשבונית ספק להזמנת הרכש,
ניהול מסמכים, מכולות, ותעודות משלוח ללקוח עם העברה להנהלת חשבונות.

## 2. החלטות שהתקבלו (Q&A עם המשתמש)

| נושא | החלטה |
|---|---|
| קשר ללקוח | רוב ההזמנות לפרויקט ספציפי, אך גם יבוא למלאי. → `project_id` אופציונלי (NULL = מלאי) + דגל `is_stock`. |
| ספקים | טבלת `suppliers` נפרדת. |
| היקף בנייה | הכל בבת אחת (לא בשלבים). |
| מכולות | מבנה בסיסי בלבד כרגע. פירוט מלא פר-מכולה יתווסף לפי קובץ האקסל של נורית (בהמתנה לדוגמאות). |

## 3. מודל הנתונים — v2 (מבוסס משלוח/מכולה)

migration: `supabase/migrations/20260628_001_import_module_v2.sql` (מחליף את v1 `20260622_001`).

**התובנה:** מכולה אחת יכולה לשאת משלוחים של כמה פרויקטים/הזמנות. לכן **משלוח ומכולה הם ישויות עצמאיות**, ומגושרים להזמנות דרך `import_packing_lines` (שורות תעודות המשלוח של הספק). אין קשר מספרי בין ה-PO שלנו לשל הספק — הקישור הוא דרך המסמכים שסוגרים זה את זה.

9 טבלאות:
1. **`import_shipments`** — משלוח פיזי (הפלגה אחת): `bl_number`, carrier, vessel, voyage, נמלים, ETD/ETA, status.
2. **`import_orders`** — הזמנת רכש מסחרית ↔ פרויקט: `po_number` (שלנו) + `supplier_order_no` (Sales Order של Amiblu) + `supplier_project_no` + `project_name`, currency, incoterms, payment_terms.
3. **`import_order_items`** — מה הוזמן: `material_no`, description, dn/pn/sn, `ordered_qty`, `unit_price`.
4. **`import_containers`** — מכולה (FK → shipment): `container_number`, `seal_number`, type, gross/net weight, pieces.
5. **`import_packing_lines`** ⭐ — הגשר: `delivery_note_no` + container_id + import_order_id + import_order_item_id, `shipped_qty`, dn, pieces, משקלים, loading/discharge date. סיכום מולם נותן "התקבל מול הוזמן".
6. **`import_invoices`** — חשבוניות (PI/CI/מקדמה): `invoice_no`, value, freight, down_payment, final_amount, delivery_notes שמכוסים.
7. **`import_coa`** — תעודות אנליזה: `coa_no`, dn/pn/sn, delivery_notes, passed.
8. **`import_documents`** — כל ה-PDFים, מקושרים ל-shipment/order/container. Storage: bucket `project-files`, prefix `import/`.
9. **`import_customer_deliveries`** — תעודות משלוח ללקוח (במורד הזרם) + דגלי "הועבר להנה״ח"/"הופקה חשבונית מס".

### מיפוי מסמך → נתון (מתוך ניתוח LOT2 / ELECTRA)
| מסמך | מזין | מפתחות קישור |
|---|---|---|
| חשבונית CI (`2022253253`) | order + items + invoice | PO ref (1322250535), delivery notes |
| BL / Waybill (`260373565`) | shipment + containers | booking, container numbers + seals |
| תעודת משלוח / Packing List (`1822252491`) | packing_lines + container | delivery_note ↔ container number (MSKU1238262) |
| COA (`179/2025`) | coa | delivery notes מכוסים, DN/PN/SN |

## 4. אבטחה (קריטי — לפי §9 ב-CLAUDE.md)

- **RLS** על כל 9 הטבלאות, מגודר לפי מודול `import`:
  `select=view`, `insert/update=edit`, `delete=full` (דרך `has_module_permission`).
- **רוקסי (AI):** אף אחת מהטבלאות **לא** נכנסת ל-`WRITE_ALLOWLIST`.
  הטבלאות מכילות מידע פיננסי (חשבוניות ספק, גמר חשבון) — כתיבה מונחית-מודל היא סיכון.
- Storage: שימוש חוזר ב-bucket הקיים `project-files`.

## 5. UI

דף `/import` (כבר מקושר בניווט: `🚢 יבוא`):
- רשימת הזמנות יבוא + פילטר לפי שלב.
- מעקב-שלבים ויזואלי (כמו דף הייצור).
- צ׳קליסט מסמכים עם העלאה/הורדה.
- טבלת פריטים עם התקדמות כמותית + התאמת חשבונית ספק.
- מכולות (בסיסי) + תעודות משלוח ללקוח.

## 6. מה נשאר / TODO

- [ ] פירוט מלא של מכולות לפי קובץ האקסל של נורית (בהמתנה לדוגמאות).
- [ ] חיבור לטבלת מלאי (`inventory`) כשמודול המלאי ייבנה.
- [ ] ייבוא אוטומטי של Packing List ע״י רוקסי (אם יוחלט — בכפוף למגבלות האבטחה).
