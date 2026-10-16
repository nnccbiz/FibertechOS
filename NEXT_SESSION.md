# פתיחת סשן חדש — FibertechOS (מעודכן 16.10.2026)

> להעתיק את הבלוק שבסעיף "פרומפט" כהודעה הראשונה בסשן הענן החדש.

## פרומפט

```
שלום. אנחנו ממשיכים לעבוד על FibertechOS.

לפני הכול:
1. תקרא את CLAUDE.md, את IMPORT_MODULE.md (במיוחד §8) ואת SESSION_HANDOFF_2026-10-16.md
   (כולל "עדכון 16.10.2026").
2. תסנכרן את הענף מ-main (הענף הקודם מוזג ב-PR #68):
   git fetch origin main claude/collections-system-review-vyioct
   git checkout -B claude/collections-system-review-vyioct origin/claude/collections-system-review-vyioct
   ותוודא שהוא זהה ל-origin/main (6db5991 או חדש יותר).
3. תבדוק שאתה רואה את הסקיילים של Emil Kowalski ב-~/.claude/skills
   (animate, review-animations, improve-animations, find-animation-opportunities,
   animation-performance, emil-design-eng, ask-sonner ועוד — מותקנים דרך ה-Setup script).
   אם הם לא שם — תגיד לי מה מצאת ואל תתקין בעצמך.

הכללים מ-CLAUDE.md §8 בתוקף: תענה בעברית, תציג תוכנית לפני שינוי משמעותי,
תראה לי SQL לפני כל migration, ומחיקת נתונים רק אחרי אישור כפול.
אין commit/push/מיזוג בלי שאבקש במפורש.

תסכם לי בקצרה מה פתוח ותשאל במה להתחיל.
```

## מצב נוכחי

- **`main` = פרודקשן** (https://fibertech-os.vercel.app) כולל: מעקב יבוא פר-פרויקט, העלאה חכמה ללא כפילויות, תיקון הרשאות אחרי התחברות, מסך ספקים `/suppliers` (לשונית בלוגיסטיקה). מוזג ב-PR #68 (squash, `6db5991`).
- **ענף עבודה**: `claude/collections-system-review-vyioct` — אותחל מ-`main` אחרי המיזוג, נקי.
- **DB**: נוקו (16.10) ההזמנה הריקה `a7ed0b07`, BL כפול `eac3c190`, הספק "Amiblu (העתק) (העתק)". אין migrations ממתינים.
- **סקיילים**: חבילת `emilkowalski/skills` מותקנת דרך ה-Setup script של סביבת הענן (`npx -y skills add emilkowalski/skills --all -g -y`) — זמינה בכל סשן ענן חדש.

## פתוח

1. **אחסון** — למחוק ידנית (Dashboard → Storage → `project-files/import/shipment_id/65858971-ed07-4e05-a98f-90f92b7c43ef/`):
   `bl_1790157553285_Blue Wave BL - Waybill.pdf` ו-`bl_1790585878134_2.pdf`. **לא** למחוק את `bl_1790157073939_…` (ה-BL המקורי).
2. **מאסף דרומי רהט** (LOT `BWLTUR26003051`, הזמנה `270212c8`): להעלות מחדש בהעלאה החכמה את `Packing_Lists_Alkhamis_..._4_Containers`, ואז למחוק (אישור כפול) את 2 השורות הישנות בלי מכולה: `8114b2fb` (DN700) ו-`cd94d705` (DN600), 72 מ' כל אחת.
3. **מייל/טלפון ספק ב-PDF של הזמנת הרכש** (`components/procurement/PODocument.tsx`) — הוצע, לא בוצע.
4. **בדיקה בשטח**: חילוץ תעודות LOT3a של איסכור, התרעת הכפילות בדפדפן, `lot_label` ו"סמן כהושלם" על נתונים אמיתיים.
5. **רעיון לסקיילים החדשים**: `/find-animation-opportunities` + `/review-animations` על המסכים הראשיים (תוך שמירה על ה-design tokens ב-`globals.css`).

## לקחים מהסשן

- **מחיקות DB**: כלי ה-MCP של Supabase מבקש אישור למחיקה שפג אחרי 60 שניות — להריץ מחיקות ב-SQL Editor ב-Dashboard ואז לבקש מ-Claude לאמת.
- **סקיילים**: סקיילים שמותקנים על ה-Mac (`~/.claude/skills`) לא נראים בסשן ענן — לענן רק דרך ה-Setup script.
- **אין service role key במכולה** — מחיקת קבצי אחסון נעשית ידנית ב-Dashboard.
