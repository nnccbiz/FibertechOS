# Session Handoff — 2026-07-05

מסמך מסירה לשיחה הבאה. מסכם את העבודה של 3–5.7.2026: **מיתוג מלא (בפרודקשן)** + **6 פיצ'רים** משלבים ב'/ג' של `SYSTEM_REVIEW_2026-07-02.md`.
קנוני: `CLAUDE.md`. מודול יבוא: `IMPORT_MODULE.md`. backlog מלא: `SYSTEM_REVIEW_2026-07-02.md`. מסירה קודמת: `SESSION_HANDOFF_2026-07-02.md`.

---

## 1. תמונת מצב — מוזג מול פתוח

| # | ענף | תוכן | סטטוס |
|---|---|---|---|
| — | `claude/ui-ux-rebrand` | מיתוג: token layer + פרימיטיבים + הגירת כל האפליקציה | ✅ **מוזג ל-main + בפרודקשן** |
| #13 | `claude/tafi-release-screen` | כפתור שחרור תפ"י (draft→planned + reviewed stamp) | ✅ **מוזג** |
| #14 | `claude/quote-aging-viewed` | גיול הצעות + חיווי "נצפתה" בדשבורד | ✅ **מוזג** |
| #15 | `claude/scheduled-alerts` | מנוע התראות מתוזמן (Vercel Cron) | ✅ **מוזג** ⚠️ צריך `CRON_SECRET` |
| — | `claude/import-derived-status` | סטטוס קבלה נגזר מכיסוי packing | ✅ **מוזג ל-main 5.7** (`241a9ac`) |
| — | `claude/prod-import-link` | צ'יפים חוצי-מודול ייצור↔יבוא | ✅ **מוזג ל-main 5.7** (`763e440`) |
| — | `claude/signed-quote-routing` | ניתוב חתימה מותנה ליבוא + מסירה מלאה לייצור | 🟠 **PR פתוח — לא מוזג** (משנה התנהגות חתימה — ממתין להחלטה) |

> **כל הפיצ'רים אומתו `tsc --noEmit` + `npm run build` נקי, וכן אומתו מול ה-DB החי היכן שרלוונטי.**
> **אף פיצ'ר לא דורש migration / שינוי RLS / שינוי סכמה** (חוץ מהמיתוג שהוא CSS/config בלבד).

---

## 2. ✅ פעולות שנשארו לך (חובה)

1. **`import-derived-status` + `prod-import-link` — מוזגו ל-main 5.7** (בסשן המשך). נותר PR פתוח אחד:
   **`signed-quote-routing`** — לא מוזג בכוונה כי הוא **משנה התנהגות חתימה בפרודקשן** (יצירת הזמנת יבוא רק לספק חיצוני במטבע זר). מזג רק אחרי שתאשר את שינוי ההתנהגות.
   קישור: `https://github.com/nnccbiz/FibertechOS/pull/new/claude/signed-quote-routing`.
2. **להוסיף env var `CRON_SECRET`** בפרויקט Vercel → Settings → Environment Variables (Production), ערך = מחרוזת אקראית חזקה. **בלעדיו מנוע ההתראות לא יפעל** (ה-route מחזיר 401). מתועד ב-`.env.example`.
3. *(אופציונלי)* ה-cron ירוץ ב-07:00 ישראל (0 4 * * * UTC); בהרצה הראשונה הוא ייצור ~5 התראות "הצעה מתיישנת" (אומת מול ה-DB).

---

## 3. מה נעשה — פירוט

### 3.1 מיתוג — Fibertech Design System ✅ בפרודקשן
מקור: תיק "Fibertech Design System" מ-Claude Design. פרטים מלאים ב-`CLAUDE.md §5 (Design System)`.
- **שכבת tokens:** `app/globals.css` (CSS variables) + `tailwind.config.ts` (מיפוי לשמות Tailwind). פונט **Assistant** (במקום Heebo) + Roboto Mono לספרות טכניות.
- **9 פרימיטיבים** ב-`components/ui/`: `Button`, `Input`/`Textarea`/`Select`, `Field`, `Card`, `Badge`, `StatusPill`, `Modal`, `Toast` (עם `ToastProvider` גלובלי ב-`AppShell` — **סוף עידן `alert()`** לפי הצורך).
- **הגירה מלאה:** ~40 קבצים, ~2,900 מופעי צבע קשיח → tokens. 0 hits ישנים שנותרו (חוץ מ-3 שימורים מכוונים: כפתורי שיתוף WhatsApp/מייל, דיו חתימה).
- **פלטה:** primary/navy `#15427E`, accent azure `#1A73B8`, סטטוס success/warning/danger/info.
- **מיפוי צבעים לשימוש עתידי + כלל "לעולם לא לקודד hex"** מתועדים ב-`CLAUDE.md §4/§5`.
- **חשוב:** `gray-*` של Tailwind **לא נדרס** — היעד להגירה הוא `neutral-*`. אל תוסיף hex קשיח בקוד חדש; השתמש ב-tokens ובפרימיטיבים.

### 3.2 מסלול חתימה — `signed-quote-routing` 🟠 PR פתוח
**Part 1 — ניתוב מותנה ליבוא + תיקון effective-currency (באג #11):**
- `lib/pricing.ts` → `effectiveCurrency(header, items)` = **מקור אמת יחיד** למטבע האמיתי (הדר אם זר, אחרת `original_currency` של פריט). החליף את 5 העותקים המוטבעים (`usePricing.ts` ×3, `PricingSection.tsx` ×2).
- `/api/import/from-quote` → יוצר טיוטת יבוא **רק** לספק חיצוני במטבע זר (`source_type!='internal'` וגם `effectiveCurrency!='ILS'`). אחרת מחזיר `{created:false, reason}`.

**Part 2 — מסירה מלאה לייצור (החלטה: live-link, לא snapshot):**
- `/api/production/order-context` — route שרת (service-role, מאמת `production:view`) שמחזיר שרטוטים/מפרטים/`project_details`/`pipe_specs`/אנשי קשר + signed URLs. **סיבה ל-live-link:** שרטוט מתעדכן אחרי חתימה ולפני ייצור; המפעל צריך גרסה עדכנית (בניגוד לתנאי חוזה שקפואים).
- `app/production/page.tsx` — אזור מתקפל "📋 מסירה לייצור" ב-`OrderCard`.

### 3.3 מסך שחרור תפ"י — `tafi-release-screen` ✅ מוזג (#13)
- `app/import/page.tsx` — כפתור **"✔️ שחרר לתפ"י"** על טיוטות; כותב `reviewed_at`/`reviewed_by` ומעביר `draft→planned`. צ'יפ "ממתין לשחרור" / "✔️ שוחרר · תאריך". (העמודות קיימות מ-`20260702_001`.)

### 3.4 גיול הצעות + "נצפתה" — `quote-aging-viewed` ✅ מוזג (#14)
- `components/dashboard/OpenQuotesWidget.tsx` — pill גיל ("לפני Nי'", צבע מסלים: טרי/עוקב/ישן) לפי `sent_at`; חיווי **👁️** מ-`quote_views` (מספר צפיות + אחרונה ב-tooltip).

### 3.5 מנוע התראות מתוזמן — `scheduled-alerts` ✅ מוזג (#15) ⚠️ צריך `CRON_SECRET`
- `app/api/cron/alerts/route.ts` + `vercel.json` (cron `0 4 * * *` UTC = 07:00 ישראל).
- 4 חוקים: הצעה מתיישנת (>7ימ) · תוקף מחיר (≤3ימ/עבר) · ETA משלוח (≤7ימ/עבר) · טיוטת יבוא ממתינה (>2ימ).
- **דד-דופ ללא סכמה:** `alert.type = cron:<rule>:<entityId>`; מדלג על טיפוסים קיימים (טופלו או לא).
- v2 שנדחה: **דדליין ייצור** (`quotes.delivery_time` נגזר/עמום — צריך join).

### 3.6 סטטוס נגזר ביבוא — `import-derived-status` 🟠 PR פתוח
- `lib/import-status.ts` — `deriveReceivedStatus` (כל הפריטים מכוסים → `received`, חלק → `partially_received`) + `orderCoveragePct`.
- `SmartUpload` — אחרי כתיבת packing, סטטוס ההזמנה מתקדם אוטומטית (override ידני `closed` נשמר; לא מוריד דרגה).
- `app/import/page.tsx` — צ'יפ "📦 התקבל X%".
- **גישה ב'** (צד-אפליקציה, ללא trigger/migration). v2 אפשרי: trigger ב-DB + עמודת דגל override.

### 3.7 חיבור ייצור↔יבוא — `prod-import-link` 🟠 PR פתוח
- `app/api/deal/cross-status?quoteIds=...` — route שרת אחד לשני הכיוונים (מאמת production:view **או** import:view; RLS-siloed → admin client). ETA best-effort דרך packing→container→shipment.
- `/production` → צ'יפ "🚢 יבוא: <סטטוס> · ETA"; `/import` → צ'יפ "🏭 ייצור: <סטטוס>". מקושרים דרך `quote_id`.
- **מצב נתונים:** כרגע אין הזמנת יבוא מקושרת ל-`quote_id` בפרודקשן → הצ'יפים יופיעו כשזרימת חתימה→יבוא תיצור קישור.

---

## 4. מה נותר (backlog)

> 🎨 **החלפת אמוג׳י→Phosphor Icons — מטופל בסשן הענן על ענף נפרד.** אין לגעת באייקונים / שכבת ה-Icon כאן כדי לא להתנגש.

### שלב ב' — בקרה ✅ **הושלם** (כל 4 הפריטים)

### שלב ג' — קישוריות
- [x] **חיבור ייצור↔יבוא** (PR פתוח).
- [ ] **ציר חיים של עסקה** — מסך אחד: הצעה→ייצור→PO→משלוח→קבלה→אספקה→חשבונית.
- [ ] **UI ל-`import_customer_deliveries`** — תעודות משלוח ללקוח + דגלי הנה"ח (טבלה קיימת, אין מסך שכותב). סוגר לולאה סחורה→נמסרה→חויבה.
- [ ] **חיבור טפסי שטח לפרויקט** — כרגע submit = `console.log`, הנתונים נזרקים. דורש טבלת `field_reports` + Storage (ממצא #5 בסקירה).

### שלב ד' — עומק
- [ ] **חתימה בצד שרת + audit trail** — כל ה-cascade רץ בדפדפן החותם; route אחד אטומי `/api/quotes/sign`.
- [ ] **פירוק עמוד הפרויקט** (1,561 שורות) לטאבים.
- [ ] **איחוד מקורות סטטוס הצעה** — 3 רשימות שונות.
- [ ] **הגירת איסקור** — `v_iskoor_tracking` רץ על טבלאות שלא קיימות (ממצא #7).

### מודול יבוא (`IMPORT_MODULE.md §7`)
- [ ] **מנוע הצעות שלומד מתיקוני ניצן** — הבסיס (`reviewed_by`) **כבר נאסף** מ-#13.
- [ ] התראת איחוד משלוחים · תמיכה ב-`.msg` · חיבור למלאי.

### חוב טכני (`CLAUDE.md §7`)
- [ ] שרטוטים בעמוד `/quote/[token]` הציבורי (anon RLS) · אכיפת רוטציית סיסמאות · התראת מייל לאדמין על בקשת גישה · איחוד `formatCurrency`/`formatDate` · חילוץ `useFileDrop` · חיווי "מחובר" מזויף בצוות.

---

## 5. הערות ולקחים (חשוב לשיחה הבאה)

- **Git push:** HTTPS נכשל (אין token/`gh`). לדחוף דרך SSH: `git push git@github.com:nnccbiz/FibertechOS.git HEAD:<branch>`. פירוט + gotcha של `settings.local.json` שחוסם `checkout` ב-`memory/git-push-auth.md`.
- **`.next` stale cache:** אחרי מעבר בין ענפים עם routes שונים, `npx tsc` עלול לזרוק שגיאות על routes שנעלמו. פתרון: `rm -rf .next` ואז tsc.
- **schema.sql מיושן** — טבלת `alerts` שם שגויה (`title/severity/is_read`). הסכמה **האמיתית**: `type · project_id · message · is_resolved · assigned_to (uuid!) · created_at`. תמיד לאמת מול ה-DB (Supabase MCP `execute_sql`) לפני עיצוב inserts.
- **RLS חוצה-מודול:** `orders` דורש `projects:view`, `import_orders` דורש `import:view`, `attachments`/`project_details` דורשים `projects`. משתמש מודול אחד לא רואה נתוני מודול אחר — **הדפוס לפתרון:** route שרת עם `createAdminClient()` שמאמת הרשאה עם `rpc('has_module_permission', {p_module, p_min_level})`. שלושה routes כאלה כבר קיימים (`from-quote`, `order-context`, `cross-status`).
- **advisor tool:** הוגדר ל-Fable 5 אבל החזיר "unavailable" לכל אורך הסשן — לא ניתן להתייעצות בפועל.
- **Vercel:** push ל-`main` → production; push לענף → preview. team `team_ZQ1GFVmPiMujLC9s2rRz2JJz`, project `fibertech-os`.
