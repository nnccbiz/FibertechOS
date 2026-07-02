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

## 5. UI — דף `/import` (ניווט: 🚢 יבוא)

שלושה מבטים (toggle למעלה):
1. **הצעות מאושרות** (ברירת מחדל) — כל ההצעות בסטטוס `signed` מכל הפרויקטים, עם חיווי לכל אחת: 🔴 "טרם הזמנת יבוא" או שלב הזמנת היבוא המקושרת. פילטרים: הכל / טרם הזמנת יבוא / עם הזמנה. התאמה לפי `import_orders.quote_id` ובגיבוי `project_id`.
2. **הזמנות** — כרטיס לכל הזמנת יבוא: פריטים (הוזמן/התקבל/נותר מסיכום ה-packing lines), טאבים חשבוניות/COA/מסמכים, ו-🗺️ **מפת קשרים** (עץ: פרויקט→הזמנה→חשבוניות/COA→משלוח→מכולות→packing, כל מסמך פותח PDF, הפרויקט מקשר חזרה).
3. **משלוחים** — כרטיס לכל משלוח: מכולות + תכולה (packing lines מקובצות לפי הזמנה/פרויקט) + מסמכים.

**⚡ העלאה חכמה** (`components/import/SmartUpload.tsx`): נורית גוררת את כל מסמכי הלוט → `/api/import/extract` (Gemini Pro) מזהה ומחלץ כל מסמך → `lib/import-reconcile.ts` ממזג לפי מפתחות הקישור → **מסך אישור ערוך לחלוטין** (שינוי כל שדה + הוספה/מחיקת שורות) → אישור נורית → כתיבה ל-DB + העלאת קבצי מקור. מזהה הזמנות/משלוחים קיימים ולא משכפל חשבוניות/COA.

**קשר דו-כיווני לפרויקט**: `components/projects/ImportPanel.tsx` — פאנל "🚢 יבוא" בעמוד הפרויקט (מתחת לתמחור) עם הזמנות היבוא המקושרות + צ'יפים של מסמכים + קישור למודול. מוצג רק כשיש פעילות יבוא.

**דשבורד**: `components/dashboard/OpenQuotesWidget.tsx` — "📝 הצעות מחיר פתוחות" (draft+sent), עם שם פרויקט, לקוח, תאריך, סכום, שינוי סטטוס inline (draft/sent/rejected/expired; חתימה נשארת בעמוד ההצעה כדי לא לעקוף את זרימת הזמנת הייצור), כותרות טורים ניתנות למיון, וכניסה לפרויקט/הצעה.

## 6. Handoff — מצב נוכחי (יוני 2026)

**ענף עבודה:** `claude/fervent-mayer-dn0diw` (הענף המאוחד — כולל את מודול היבוא + תיקוני תמחור + כל הפיצ'רים המתקדמים. הענף `claude/dazzling-euler-afrrux` מיותר).

**Migrations שהוחלו על Supabase:**
- `20260622_001_import_module.sql` — v1 (הוחלף).
- `20260628_001_import_module_v2.sql` — v2, 9 טבלאות (מבנה נוכחי).
- `20260628_002_import_quote_link.sql` — `import_orders.quote_id` + פוליסת RLS `quotes_import_select` (משתמש יבוא רואה הצעות signed בלבד).

**קבצים מרכזיים:**
- `app/import/page.tsx` — הדף (3 מבטים + מפת קשרים).
- `app/api/import/extract/route.ts` — חילוץ Gemini Pro.
- `lib/import-reconcile.ts` — reconciliation.
- `components/import/SmartUpload.tsx`, `components/projects/ImportPanel.tsx`, `components/dashboard/OpenQuotesWidget.tsx`.

**החלטות ארכיטקטוניות:**
- FibertechOS **מחליפה את SAP** ליבוא (החלטת המשתמש).
- מכולה יכולה לשרת כמה פרויקטים → מודל מבוסס משלוח/מכולה, גשר `import_packing_lines`.
- אין קשר מספרי בין ה-PO שלנו לשל הספק — הקישור דרך המסמכים (delivery note ↔ container ↔ BL ↔ invoice).
- נורית **מאשרת לפני שמירה**; יכולה לערוך כל שדה ולהוסיף שורות.

## 7. מה נשאר / TODO

**Upstream (צד ניצן / תפ״י) — לא נבנה עדיין:**
- [ ] חיבור אוטומטי: הצעה נחתמת (`updateQuoteStatus`→'signed', ב-`hooks/usePricing.ts` ~שורה 1199 שם כבר נוצרת הזמנת ייצור) → יצירת **טיוטת הזמנת יבוא** נזרעת מפריטי ההצעה + ה-cost_input, כולל מילוי `import_orders.quote_id`.
- [ ] שלב תפ״י: סטטוס טיוטה→תוכנן(ניצן שחרר)→ביבוא, מסך לניצן לבדוק/לתקן.
- [ ] מנוע הצעות שלומד מתיקוני ניצן (כללים+מיפוי "מוצר מכירה↔קוד ספק", לא ML). כולל מקרי חומר-גלם ומחברי-שוחה (החלטות הנדסה → הצעה+אישור אדם).
- [ ] התראת איחוד משלוחים ("הזמנת לאחרונה מאותו ספק → אפשרות איחוד → בקש פרופורמה מעודכנת").

**כיוונון/הרחבה של צד נורית:**
- [ ] כיוונון prompt החילוץ אחרי בדיקה על מסמכים אמיתיים (LOT2 נבדק חלקית).
- [ ] תמיכה בחילוץ צרופות מקובץ `.msg` (כרגע רק PDF/תמונה).
- [ ] `import_customer_deliveries` — UI לתעודות משלוח ללקוח + דגלי הנה״ח (טבלה קיימת, UI בסיסי).
- [ ] חיבור לטבלת מלאי (`inventory`) כשמודול המלאי ייבנה.

**אבטחה — לזכור:** אף טבלת import לא ב-allowlist של רקסי (מידע פיננסי).
