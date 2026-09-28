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
| מכולות | ✅ פירוט פר-מכולה נבנה 28.9.2026 לפי גיליון המעקב של נורית (`docs/דוגמת מעקב יבוא איסכור`) — ראו §8. |

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
- `20260702_001_import_order_origin.sql` — `origin` ('manual'/'auto_from_quote') + `reviewed_at`/`reviewed_by` (הכנה לשלב תפ"י). **הוחלה 2.7.2026.**

**קבצים מרכזיים:**
- `app/import/page.tsx` — הדף (3 מבטים + מפת קשרים + 🛰️ מעקב ספינה חי).
- `app/api/import/extract/route.ts` — חילוץ Gemini Pro.
- `app/api/import/from-quote/route.ts` — זריעת טיוטת הזמנת יבוא מהצעה חתומה (service-role, אידמפוטנטי, + התראת חתימה in-app).
- `app/api/import/vessel-track/route.ts` — מיקום ספינה חי + ETA לאשדוד/חיפה (Datalastic; דורש `DATALASTIC_API_KEY`, בלעדיו מחזיר קישורי VesselFinder/MarineTraffic).
- `lib/import-reconcile.ts` — reconciliation.
- `components/import/SmartUpload.tsx`, `components/projects/ImportPanel.tsx`, `components/dashboard/OpenQuotesWidget.tsx`.

**החלטות ארכיטקטוניות:**
- FibertechOS **מחליפה את SAP** ליבוא (החלטת המשתמש).
- מכולה יכולה לשרת כמה פרויקטים → מודל מבוסס משלוח/מכולה, גשר `import_packing_lines`.
- אין קשר מספרי בין ה-PO שלנו לשל הספק — הקישור דרך המסמכים (delivery note ↔ container ↔ BL ↔ invoice).
- נורית **מאשרת לפני שמירה**; יכולה לערוך כל שדה ולהוסיף שורות.

## 7. מה נשאר / TODO

**Upstream (צד ניצן / תפ״י):**
- [x] ~~חיבור אוטומטי: הצעה נחתמת → טיוטת הזמנת יבוא~~ — **בוצע 2.7.2026** (`app/api/import/from-quote`, נזרע מ-`cost_input_items` עם fallback ל-`quote_items`, `origin='auto_from_quote'`, `status='draft'`).
- [ ] שלב תפ״י: מסך שחרור לניצן — כפתור "✔️ שחרר" שכותב `reviewed_at`/`reviewed_by` (העמודות קיימות) ומעביר `draft→planned`. כרגע השחרור אפשרי רק דרך dropdown הסטטוס הכללי.
- [ ] מנוע הצעות שלומד מתיקוני ניצן (כללים+מיפוי "מוצר מכירה↔קוד ספק", לא ML). כולל מקרי חומר-גלם ומחברי-שוחה (החלטות הנדסה → הצעה+אישור אדם).
- [ ] התראת איחוד משלוחים ("הזמנת לאחרונה מאותו ספק → אפשרות איחוד → בקש פרופורמה מעודכנת").

**כיוונון/הרחבה של צד נורית:**
- [ ] כיוונון prompt החילוץ אחרי בדיקה על מסמכים אמיתיים (LOT2 נבדק חלקית).
- [ ] תמיכה בחילוץ צרופות מקובץ `.msg` (כרגע רק PDF/תמונה).
- [ ] `import_customer_deliveries` — UI לתעודות משלוח ללקוח + דגלי הנה״ח (טבלה קיימת, UI בסיסי).
- [ ] חיבור לטבלת מלאי (`inventory`) כשמודול המלאי ייבנה.

**אבטחה — לזכור:** אף טבלת import לא ב-allowlist של רקסי (מידע פיננסי).

## 8. מעקב יבוא פר-פרויקט (28.9.2026, migration `20260928_001`)

תצוגת **"מעקב פרויקט"** בדף `/import` (וקישור "מעקב יבוא" בפאנל היבוא בעמוד הפרויקט → `/import?view=tracker&project=<id>`) משחזרת את גיליון ISKOOR של נורית:
שורה לכל מכולה × תעודת משלוח, מקובצת לפי LOT (משלוח); עמודות סטטוס · LOT · BL · תאריך שחרור · ETA · אספקה ללקוח · Date of INV · DN · Invoice no. · Invoice value · Container no. · עמודה לכל פריט שהוזמן (מטרים) · ת.מ רכש (הזמנת הרכש שלנו מול הספק) · COA1..n; בתחתית Ordered quantity / delivered / to be delivered.

- **מודל משותף** `lib/import-tracker.ts` (`buildTracker`) — אותם מספרים במסך ובייצוא. **ייצוא לאקסל** `lib/import-tracker-xlsx.ts` באותו מבנה (שורות מספרי שורה + ספק·הזמנה מעל הפריטים, תאי LOT ממוזגים לאורך הקבוצה, d/m/yy).
- **כל ערך נפתח במסמך המקור**: `source_document_id` על `import_packing_lines` / `import_invoices` / `import_coa` (SmartUpload מעלה קודם את הקבצים ואז כותב את השורות עם הקישור); BL/ETA → מסמך ה-BL של המשלוח; ת.מ רכש והכמות שהוזמנה → הזמנת הרכש (`POViewModal`). שורות ישנות ללא קישור מותאמות לפי מספר מסמך / שם קובץ.
- **"הושלם" = רק השלמה מלאה (נשלח ≥ הוזמן) או סימון ידני** (`import_order_items.completed_at/by`, כפתור "סמן כהושלם" בשורת to be delivered ובכרטיס ההזמנה) — אין סף סבילות אוטומטי. החסר מוצג בשורת to be delivered (כרטיסי "חסר להשלמה" מעל הטבלה הוסרו לבקשת המשתמש) + צ'יפ בכרטיס ההזמנה.
- **עריכה בגוף הטבלה** (כמו טבלת הפרויקטים; `Cell` ב-`ImportTracker.tsx` + `lib/import-tracker-edit.ts`): לחיצה על תא → שדה עריכה, Enter/יציאה שומרים, Esc מבטל. ניתנים לעריכה: סטטוס משלוח, LOT, BL, תאריך שחרור, ETA, אספקה ללקוח, אוניה (ב-LOT שבדרך), Date of INV, DN, Invoice no./value, מכולה, מטרים לכל פריט, COA (תא ריק נוסף להוספה), ומספר השורה בהזמנה בכותרת. ערך ממסמך מסומן באייקון קובץ שפותח את המקור. קבוצה "ללא LOT" מקבלת משלוח בעריכה הראשונה. "+ הוספת שורה" פותחת שורה ריקה בתחתית הטבלה. ריקון כמות = 0, ריקון COA = ניתוק מהתעודה בלבד; מחיקת שורה (פח) רק ב-import:full עם אישור כפול ומוחקת רק את שורות התעודה. כמות שהוזמנה לא נערכת כאן (היא הזמנת הרכש שנשלחה לספק).
- **LOT בדרך** (`isFutureLot` — לא שוחרר, לא סופק, לא delivered/closed): מתחת לסטטוס מוצגים האוניה, "הגעה צפויה dd/mm · בעוד N ימים" (כתום אם עבר) וכפתור "אתר ספינה" שפותח את `VesselTracker` (אותו רכיב של תצוגת המשלוחים, הוצא ל-`components/import/VesselTracker.tsx`).
- **כניסה מ"הצעות מאושרות"**: לחיצה על שם הפרויקט פותחת את טבלת המעקב שלו (אייקון קטן ליד השם — לעמוד הפרויקט). פרויקט בלי הזמנה שנשלחה לספק מקבל הודעה.
- **פרטי LOT ידניים** ב-`import_shipments`: `lot_label`, `released_at`, `customer_delivery_date` (מודאל עריכה בטבלה). הסטטוס נגזר: אספקה ללקוח → "סופק dd/mm", שחרור → "השתחרר dd/mm", אחרת סטטוס המשלוח.
- **התאמת שורה ↔ פריט** (`lib/import-match.ts`, `lib/import-status.ts:itemIdForLine`): מק"ט ספק → DN+PN+SN → וריאנט (standard / w/nozzles / first pipe — "special pipe … w/o spigot" = first גם כשיש לו grout ports). שורה נספרת לפריט אחד בלבד (בעבר DN1280 נספר לכל פריטי DN1280). בשיוך, מק"ט הספק נלמד על הפריט שלנו.
- **רשימת אריזה של כמה מכולות במסמך אחד** (Alkhamis — "Packing_Lists_..._4_Containers"): החילוץ מחזיר `container_number` לכל שורת פריט; שורה בלי מספר תעודת משלוח מקובצת בטבלה לפי המכולה (`rowKeyOf`). לשורה כזו מוצמדת החשבונית היחידה של ה-LOT (לפי `shipment_id`, לא פרופורמה/מקדמה): מספר ותאריך בכל שורת מכולה, הסכום פעם אחת בשורה הראשונה ("ל-N מכולות"), בשאר "כלול למעלה" — גם באקסל. מספר חשבונית לעולם לא נרשם כמספר תעודת משלוח (`asDn` ב-reconcile).
- **מסמכים שכבר נקלטו**: אם מספר החשבונית או ה-BL כבר רשומים על הזמנה חיה — ההעלאה משויכת אליה אוטומטית (`priorRecordOf`) עם אזהרה "כבר נקלטו במערכת"; שורות שכבר קיימות (DN/מכולה + מק"ט + כמות) מדולגות.
- **SmartUpload**: בורר "שייך להזמנת רכש קיימת" (ברירת מחדל לפי מספר הזמנת הספק או ההזמנה היחידה של הפרויקט; מספר הזמנת הספק נשמר על ה-PO) — מונע הזמנה כפולה; בורר LOT קיים + שם LOT; עמודת "פריט בהזמנה" לכל שורת תעודה (כתום = לא שויך); תעודה שכבר נקלטה מדולגת (לא נספרת פעמיים); מפתח אחסון ASCII (`safeExt`).
