# מדריך הפעלה - תיקון אבטחה ב-FibertechOS

**תאריך:** 19 באפריל 2026
**מטרה:** החלפת מדיניות האבטחה הפתוחה במדיניות מחמירה מבוססת הרשאות

---

## מה אני עשיתי עכשיו (לפני הלחיצה שלך)

### קבצי SQL - ב-`supabase/migrations/`

1. **`20260419_001_cleanup_open_rls.sql`**
   מוחק את כל מדיניות ה-RLS הפתוחה (26 פוליסי עם `USING (true)`).
   לאחר הרצתו - המסד נעול לכולם חוץ מ-service_role, עד שמיגרציה 003 רצה.

2. **`20260419_002_auth_and_permissions.sql`**
   מוסיף טבלאות תמיכה: `user_module_permissions`, `access_requests`, `login_attempts`, `password_history`.
   מוסיף עמודות ל-`team_members`: `auth_user_id`, `active`, ועוד.
   יוצר פונקציות עזר: `is_admin()`, `has_module_permission()`, `can_submit_access_request()`.
   מכניס את מטריצת ההרשאות הראשונית ל-9 עובדי הצוות.

3. **`20260419_003_secure_rls_policies.sql`**
   מדיניות RLS חדשה לכל 21 הטבלאות, מבוססת על מטריצת ההרשאות.

4. **`20260419_004_rate_limit_functions.sql`**
   פונקציות עזר ל-rate limiting ול-view של בקשות ממתינות.

### קבצי Next.js - אפליקציה

- **`middleware.ts`** - מגן על כל הדפים. משתמש לא מחובר מופנה ל-`/login`.
- **`lib/supabase/client.ts`** + **`server.ts`** - חיבורים ל-Supabase (client, server, admin).
- **`lib/auth/permissions.ts`** - קבועים ו-validation של סיסמאות (12 תווים + סימן וכו').
- **`app/login/page.tsx`** - דף התחברות עם סיסמה.
- **`app/request-access/page.tsx`** - דף בקשת גישה למי שאין לו חשבון עדיין.
- **`app/set-password/page.tsx`** - דף קביעת סיסמה אחרי אישור.
- **`app/auth/callback/route.ts`** - handler של לינקי מייל.
- **`app/(admin)/settings/requests/page.tsx`** - דף אישור בקשות ממתינות.
- **`app/(admin)/settings/users/page.tsx`** - עריכת מטריצת הרשאות של כל עובד.
- **`app/api/access-requests/route.ts`** - API ציבורי לשליחת בקשות.
- **`app/api/approve-request/route.ts`** - API לאדמינים לאישור בקשות.
- **`app/api/auth/log-attempt/route.ts`** - רישום ניסיונות התחברות.
- **`components/admin/PendingRequestsList.tsx`** + **`UserPermissionsEditor.tsx`** - רכיבי UI.
- **`.env.example`** - תבנית משתני סביבה.

---

## מה אתה צריך לעשות - שלב אחר שלב

### שלב 1: להתקין תלויות חדשות

בתיקיית הפרויקט, הרץ:

```bash
npm install @supabase/ssr
```

(אם אין לך עדיין `@supabase/supabase-js`, הרץ גם `npm install @supabase/supabase-js`.)

### שלב 2: לוודא שמשתני הסביבה מוגדרים

פתח את `.env.local` וודא שיש שם את השלושה הבאים. אם חסר - הוסף.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://qiccyigkqunxhvqzncol.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<המפתח הציבורי שלך>
SUPABASE_SERVICE_ROLE_KEY=<המפתח הפרטי - חובה!>
NEXT_PUBLIC_SITE_URL=https://fibertech-os-git-dev-nnccbiz-4044s-projects.vercel.app
```

ב-Vercel Dashboard → fibertech-os → Settings → Environment Variables - הוסף את אותם ארבעה משתנים אם חסר.

**חשוב:** את `SUPABASE_SERVICE_ROLE_KEY` אפשר למצוא ב-Supabase Dashboard → Project Settings → API → `service_role`.

### שלב 3: להגדיר את Supabase Auth

ב-Supabase Dashboard → Authentication → Providers:

- **Email:** פעיל, עם **"Confirm email"** = מופעל, **"Secure email change"** = מופעל
- **Password:** מופעל
- ב-**Settings** → **Email Auth** → **Minimum password length**: הגדר ל-12

ב-Authentication → URL Configuration:

- **Site URL:** `https://fibertech-os-git-dev-nnccbiz-4044s-projects.vercel.app`
- **Redirect URLs:** הוסף:
  - `https://fibertech-os-git-dev-nnccbiz-4044s-projects.vercel.app/auth/callback`
  - `https://fibertech-os-git-dev-nnccbiz-4044s-projects.vercel.app/set-password`
  - `http://localhost:3000/auth/callback` (למפתחים)
  - `http://localhost:3000/set-password`

### שלב 4: לסקור את הקוד ולדחוף ל-GitHub

מההתחלה, בדוק את הקבצים בעיניך. אם הכל נראה בסדר:

```bash
cd "Fibertech os"
git checkout dev           # ודא שאתה על ענף dev
git add supabase/ lib/ middleware.ts app/ components/ .env.example RLS_MIGRATION_GUIDE.md
git commit -m "feat(auth): password auth, permission matrix, RLS hardening

- Add 4 SQL migrations to replace permissive RLS policies
- Add Supabase Auth integration (browser + server clients)
- Add login, request-access, set-password pages
- Add admin pages for approving requests and managing permissions
- Add rate limiting: 3 req/IP/hr, 20 req/hr global, 1 pending per email
- Add password policy: 12 chars + complexity, 90-day rotation"
git push origin dev
```

Vercel יפרוס את השינוי אוטומטית לתוך כמה דקות. אבל **האפליקציה עדיין לא תעבוד** כי המסד לא ידע איך לטפל במשתמשים - צריך להריץ את ה-SQL.

### שלב 5: לחזור אליי כדי להריץ את ה-SQL על המסד

כשאתה מוכן (כולל לידע שצוות שלך יהיה במרץ כמה שעות בלי גישה), אמור לי משהו כמו:

> "הריץ את ה-migrations על המסד"

אני אריץ את ארבעת הקבצים בסדר 001 → 002 → 003 → 004 ואדווח על כל שלב.
הרצת כל הארבעה ביחד לוקחת פחות מ-30 שניות.

### שלב 6: אחרי הרצת ה-SQL - המערכת דורשת התחברות

**מה שיקרה מייד:**

- כל מי שיפתח את `https://fibertech-os-git-dev-...vercel.app` - יופנה ל-`/login`
- רק שני עובדים עם מייל במערכת יוכלו להתחבר (מירי, ואתה)
- אבל גם לכם עדיין אין סיסמה! לכן...

### שלב 7: אתה תצטרך ליצור לך סיסמה ראשונה

היכנס ל-Supabase Dashboard → Authentication → Users → **Add user** → מייל שלך + סיסמה חזקה.
זה ייצור לך חשבון. אחרי זה, תפתח את האתר, תתחבר, ותוכל להתחיל להשתמש במערכת.

**חזור על התהליך עבור:**

1. **אשר** - צור לו חשבון ב-Supabase Dashboard (הוא admin בטבלה, אז ברגע שיש מייל + auth_user - המערכת תזהה אותו כ-admin אוטומטית)
2. **כל שאר 7 העובדים** - כל אחד ייכנס ל-`/request-access`, ימלא את הפרטים, ואתה תאשר אותם מתוך `/settings/requests`

### שלב 8: הוסף מיילים חסרים ל-team_members

אחרי שתתחבר - בעמוד `/settings/users`, עדכן את המייל של כל עובד שחסר לו (אשר, הלל, יגאל, נורית, ניצן, זמיר, עאמר). אם אין לך את המייל של אשר - בקש ממנו.

---

## איך לבדוק שהכל עובד

אחרי הפעלה:

1. **פתח את האתר ב-incognito** - צריך להפנות אותך ל-`/login`.
2. **נסה להיכנס עם מייל שלא קיים** - צריך להיכשל בשקט ("מייל או סיסמה שגויים").
3. **נסה לגשת לכתובת `/` ישירות** - צריך להפנות אותך ל-`/login`.
4. **לחץ על "בקשת גישה"** - צריך להגיע ל-`/request-access`.
5. **נסה לבקש גישה עם מייל שאינו @fibertech.co.il** - צריך לקבל הודעת שגיאה.
6. **בקש גישה עם מייל חוקי** - ודא שהבקשה נכנסה ב-`/settings/requests` שלך.
7. **אשר את הבקשה עם הרשאת member** - המשתמש יקבל מייל עם לינק לקביעת סיסמה.

---

## הרצה חלקית - אם משהו לא עובד

אם אחרי הרצת ה-SQL משהו נשבר ואני לא זמין:

פתח Supabase Dashboard → SQL Editor, הדבק את התוכן של `backups/2026-04-19_pre-rls-cleanup/02_current_policies.sql`, הרץ. זה יחזיר את המדיניות הפתוחה (הלא-מאובטחת) ואפשר להמשיך עד שנפתור.

---

## שאלות שכדאי להכין מראש

לפני הפעלה, תחשוב על:

1. **המייל של אשר** - אם תכתוב אותו עכשיו, אוכל להוסיף אותו בזמן הרצת ה-SQL.
2. **תזמון** - האם יש שעה שנוח יותר לעבור (כי צוות לא יוכל לעבוד במערכת למשך כמה דקות עד שהם מקבלים חשבון)?
3. **מודול "שדה" ו-"יבוא"** - עדיין חוזרים ל-404. לא קריטי לאבטחה אבל כשאנשים יתחילו להיכנס הם יראו את זה. רוצה שאוסיף להם stub "בקרוב" בעדכון הזה?

---

**סוף המדריך. תגיד לי מתי אתה מוכן שאריץ את ה-SQL.**
