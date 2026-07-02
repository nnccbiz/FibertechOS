# סיכום סשן: סקירת אבטחה ו-Rebase על main העדכני
**תאריך:** 28-29 במאי 2026  
**Project:** FibertechOS (Next.js 15 + Supabase + Vercel)  
**מצב סופי:** 4 commits של אבטחה הוטמעו ב-main של production. Roxy AI רצה על `gemini-2.5-flash`.

---

## מה עשינו — בשורה אחת

ביצענו סקירת אבטחה מקיפה של FibertechOS, יישמנו 5 ממצאי אבטחה (2 HIGH, 2 MEDIUM, 1 LOW) + ממצא בונוס שנתפס ע"י plugin אוטומטי. במהלך העבודה גילינו פיצול ענפים מהותי שדרש rebase מלא של התיקונים על main העדכני, וכן ביצענו revert מודע של ה-AI provider מ-Groq חזרה ל-Google Gemini.

---

## ה-commits הקנוניים ב-main (לא לדרוס!)
7279cf8  Merge pull request #8 from nnccbiz/security-on-main   ← ה-merge הסופי
56bf29b  fix(ai): switch Roxy model to gemini-2.5-flash
5a66800  fix(security): pass Gemini API key via header instead of URL
61ea04b  feat(security): complete #1 prompt isolation + #3 rate limiting (Gemma)
22e6de1  feat(security): apply 4 of 5 security findings against main

---

## חמשת ממצאי האבטחה — מה הם, איפה הקוד, ולמה לא לשבור

### #1 — Roxy Write Allowlist + Prompt Injection Defense (HIGH)
**הבעיה:** Roxy (סוכן ה-AI) קיבל פלט מודל לא-אמין שעבר ישירות ל-`supabase.from(table).insert/update` — וקטור prompt injection ישיר לכתיבה לכל טבלה.

**הפתרון:**
- **`lib/ai/write-allowlist.ts`** — קובץ חדש המכיל מילון של טבלאות מותרות ועמודות מותרות לכל אחת.
- **חובת `validateWrite(table, data)`** לפני כל `supabase.from(...)` ב:
  - `components/ai/CommandBar.tsx`
  - `components/ai/FloatingChat.tsx`
- **מדיניות: reject + log** — טבלה/עמודה לא מורשית דוחה את הכתיבה כולה ומתעדת ל-`ai_activity_log` עם `status='failed'`.
- **delimiter isolation** ב-`app/api/ai/route.ts`: קלט משתמש, מסמכים, וקונטקסט עטופים ב-`<user_input>`, `<document>`, `<context_data>` עם הוראה למודל להתייחס אליהם כ-DATA.
- **תוקנו column drift bugs** בפרומפט (היו טבלאות עם שמות עמודות שגויים — `alerts`, `projects`, `leads` כולם תוקנו לעמודות אמיתיות).
- **הוסרה `team_members`** מרשימת הטבלאות המורשות.

### #2 — Webhook Authentication (HIGH)
**הבעיה:** `/api/webhooks/quote-signed` היה בעבר חשוף עם `SUPABASE_SERVICE_ROLE_KEY` בלי שום אימות (`x-forwarded-for` בלבד).

**הפתרון:**
- **`x-webhook-secret` header** עם השוואת `timingSafeEqual` נגד `QUOTE_WEBHOOK_SECRET`.
- **הוסף ל-`PUBLIC_API_ROUTES` ב-middleware** (כי הוא self-secured, לא צריך session).
- **משתנה סביבה נדרש:** `QUOTE_WEBHOOK_SECRET` (קיים ב-Vercel + .env.local).

### #3 — Rate Limiting + Payload Caps (MEDIUM)
**הבעיה:** `/api/ai` לא היה מוגן מפני שימוש לרעה / DDoS / חשבון Gemini exhausted.

**הפתרון:**
- **DB-backed rate limiting**: per-user 15/min + 200/hr, global 60/min.
- **Payload caps**: 10MB body, 5 files max, 7MB/file, 100k doc chars, 10k message chars.
- כל הבדיקות **לפני** הקריאה ל-Gemini API (חיסכון בקריאות מיותרות).
- **מיגרציה:** `supabase/migrations/20260528_001_ai_rate_limit.sql` (כבר רצה ב-Supabase production).
  - יצרה: טבלת `ai_request_log`, פונקציית `can_make_ai_request(uuid)`.

### #4 — log-attempt Hardening (MEDIUM)
**הבעיה:** `/api/auth/log-attempt` (נקרא pre-auth מ-failed logins) סמך עיוורת על `x-forwarded-for`, ולא היה מוגן מ-spam.

**הפתרון:**
- **`parseClientIp()`** — validation סינטקטית של IPv4/IPv6, עדיפות ל-`x-real-ip`, NULL fallback.
- **per-IP rate limit** של 20/min (silent 200 throttled, לא חושף מידע).
- **תוחמים** על email/user_agent/failure_reason length.
- **הוסף ל-`PUBLIC_API_ROUTES`** (self-secured).

### #5 — CommandBar Update Validation (LOW)
**הבעיה:** עדכוני Roxy ב-CommandBar הסתמכו על `eq('id')` ללא וידוא, וחיווי "הצלחה" על 0-row updates (RLS denial / row לא קיים).

**הפתרון:**
- **UUID validation** על `id` המסופק מהמודל.
- **`.select('id')` אחרי update** לזיהוי 0-row → שגיאה מפורשת.

### Bonus — API Key in URL → Header (MEDIUM, נתפס ע"י plugin)
**הבעיה:** מיד אחרי שלב 2, ה-plugin `security-guidance` (שהותקן בבוקר) זיהה ש-`GEMINI_API_KEY` עובר ב-URL query string — דליפה דרך server logs, proxies, referrer headers.

**הפתרון:** מעבר ל-`x-goog-api-key` header (הדרך הרשמית של Google). פונקציונלית זהה.

---

## ההחלטות הגדולות במהלך הסשן (וההיגיון שמאחוריהן)

### 1. Provider revert: Groq → Gemma → gemini-2.5-flash
- **מאיפה התחלנו:** ה-`dev` המקומי שעבדנו עליו היה על Gemma (`gemma-3-27b-it`), אבל `origin/main` כבר היה על Groq (`llama-3.3-70b-versatile`) מ-7 במאי.
- **גילינו** שהמעבר ל-Groq נעשה בעבר בגלל בעיות מכסה של Gemini החינמי. אבל המשתמש (נתנאל) משלם עכשיו על Gemini בתשלום — בעיית המכסה לא רלוונטית.
- **החלטנו** להחזיר ל-Gemma גם בפרודקשן. זה גם החזיר multimodal (יכולת חילוץ קבצים/תמונות) ש-Groq llama text-only ביטל.
- **אבל**: `gemma-3-27b-it` הוסר מ-Gemini API בינתיים (404 בפרודקשן). **המודל הפעיל הנכון: `gemini-2.5-flash`** — multimodal, עברית טובה, יציב.

### 2. Rebase על main העדכני (ולא merge של dev הישן)
- ה-`dev` המקומי שעבדנו עליו היה על בסיס מאפריל. בינתיים `origin/main` קיבל 67 commits של פיצ'רים (תמחור, צנרת, פרויקטים, מספור מסמכים).
- אם היינו עושים `git pull` עיוור על dev הישן, היינו מתנגשים head-on עם Groq וגוררים cascade של קונפליקטים.
- **במקום זה:** יצרנו `security-on-main` חדש על בסיס `origin/main` העדכני, והבאנו לתוכו את 6 הקבצים של dev בנפרד.
- 5/6 הקבצים נכנסו ב-`git checkout dev -- ...` נקי (main לא נגע בהם).
- `middleware.ts` נערך ידנית כי main כן שינה אותו (אבל באזור אחר).
- `route.ts` היה הקובץ המורכב היחיד — לקחנו את גרסת dev כבסיס (כי main לא שינה את ה-prompt או הלוגיקה, רק את ה-provider).

### 3. הפרדה בין שלב 1 ושלב 2
- **שלב 1** (commit `22e6de1`): כל הקבצים הנקיים (allowlist, CommandBar, FloatingChat, log-attempt, webhook, middleware).
- **שלב 2** (commit `61ea04b`): רק `route.ts` (המורכב) + מיגרציה + עדכון CLAUDE.md.
- **הגיון:** אם משהו נשבר ב-route.ts, נדע שזה מבודד.

---

## משתני סביבה ב-Vercel (לא להסיר!)

| משתנה | נדרש ל- | מצב |
|--------|----------|-----|
| `GEMINI_API_KEY` | Roxy AI (חובה) | קיים מ-18 במאי |
| `QUOTE_WEBHOOK_SECRET` | אימות webhook (#2) | קיים מ-28 במאי |
| `SUPABASE_SERVICE_ROLE_KEY` | webhook + rate-limit functions | קיים |
| `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` | Supabase client | קיים |
| `NEXT_PUBLIC_SITE_URL` | invitation flows | קיים |
| `GROQ_API_KEY` | (לא בשימוש יותר) | אפשר להסיר בעתיד, לא דחוף |

---

## חוקי ברזל לסשנים עתידיים — קרא לפני שאתה משנה משהו!

ראה גם את `CLAUDE.md` בריפו עצמו, סעיף 9 ("Security invariants").

### 🚫 אל תעשה — אבטחה
1. **אל תוסיף טבלאות/עמודות חדשות ל-`WRITE_ALLOWLIST`** של Roxy בלי לחשוב היטב. במיוחד — **לעולם** אל תוסיף את הטבלאות החסומות: `team_members`, `user_module_permissions`, `profiles`, `access_requests`, `login_attempts`, `password_history`, `quotes`, `orders`, `payments`, `exchange_rate_log`, `ai_activity_log`.

2. **אל תוסיף נתיב חדש ל-`PUBLIC_API_ROUTES` ב-middleware** בלי שיש לו אימות עצמי (header secret, signature, וכו'). אם הוא צריך session — אל תעקוף את ה-middleware.

3. **אל תכתוב `supabase.from(...).insert/update()` ב-AI flow** בלי לעבור דרך `validateWrite()` מ-`lib/ai/write-allowlist.ts`. גם אם נראה לך שאתה "יודע שהקלט בטוח" — Roxy עובדת על קלט לא-אמין.

4. **אל תקצר את delimiters בקלט ל-Gemini ב-`route.ts`**. הקלט עטוף ב-`<user_input>`, `<document>`, `<context_data>` בכוונה. אל תשרשר טקסט גולמי לתוך ה-SYSTEM_PROMPT.

5. **אל תעביר API keys ב-URL query strings**. השתמש ב-headers (כמו `x-goog-api-key`).

### ⚠️ הקפד — תהליך
6. **לפני שמתחילים עבודה גדולה — תמיד `git fetch` + `git status` קודם.** הסיבה שכל היום הסתבכנו: ה-`.env.local` המקומי לא היה מסונכרן עם Vercel, ו-`dev` היה ישן ב-67 commits מ-main.

7. **אם אתה מוסיף טבלה חדשה ל-DB** (מיגרציה): גם תוסיף אותה ל-`WRITE_ALLOWLIST` אם Roxy אמורה לכתוב לשם, ועדכן גם את ה-`SYSTEM_PROMPT` ב-`route.ts` עם רשימת העמודות המעודכנת. רשימת העמודות במילון נגזרת מהסכמה האמיתית, לא מהפרומפט!

8. **המיגרציה `20260528_001_ai_rate_limit.sql` חייבת לרוץ ב-Supabase production** כדי שה-rate-limit באמת ייאכף. הקוד fails open (לא error) אם הפונקציה לא קיימת — אז אם תפרוס ל-Supabase חדש, צריך לרוץ את המיגרציה ידנית.

### 🤖 על המודל
9. **Roxy רצה על `gemini-2.5-flash` דרך `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`** עם header `x-goog-api-key`. אל תחזיר ל-`gemma-3-27b-it` — הוא הוסר מ-API.

10. **אם תרצה להחליף מודל בעתיד**: ודא קודם שהוא זמין דרך `generativelanguage.googleapis.com/v1beta/models` (פקודת `curl` עם המפתח). שמור על מבנה הבקשה `contents/parts + inline_data` (multimodal).

---

## מצב התיקייה המקומית (אחרי הסנכרון)

- **ענף יחיד מקומי:** `main` (מסונכרן עם origin/main).
- **קבצים untracked** שצריכים החלטה:
  - `public/logo.png.local-backup` — גיבוי של גרסה מקומית של הלוגו. החלטה: להחזיר אם רוצים, או למחוק. כרגע שמור.
  - `.claude/settings.local.json` — קובץ הגדרות מקומי של Claude Code (M ב-status). שווה להוסיף ל-`.gitignore` בעתיד.

---

## מה עוד שווה לדעת לעתיד

### דברים שראינו במהלך הסשן ועלולים להפתיע
- ה-`pg_net` trigger ל-webhook **מוערה** ב-`database/schema.sql:842-876`. אם תפעיל אותו בעתיד, ודא שהוא שולח את ה-header `x-webhook-secret`.
- **Make.com integration לא קיימת** למרות שמופיעה ב-`MAKE_WEBHOOK_URL` ב-env. אם תפעיל בעתיד — אותו תיקון כמו ה-trigger.
- ה-`.env.local` המקומי לא היה כולל את `GEMINI_API_KEY` (היה רק ב-Vercel). אם תרצה להריץ `npm run dev` מקומית עם Roxy עובדת — תוסיף אותו ל-`.env.local`.

### בדיקות שכדאי לעשות מפעם לפעם
- **ה-allowlist עובדת**: שלח ל-Roxy "תוסיף משתמש לטבלת team_members" — צריך להידחות.
- **rate-limit עובד**: 20+ בקשות מהירות → מקבל 429.
- **webhook auth עובד**: קריאה ל-`/api/webhooks/quote-signed` בלי header → 401.

---

## תודה
התהליך הזה לקח שעות ונעשה בזהירות יוצאת דופן — בדיקת כל diff, אישור כל פעולת כתיבה. אין שום קוד שנאבד, אין פיצ'ר שנשבר, ויש 6 שיפורי אבטחה פעילים בפרודקשן.

לסשנים עתידיים: הקובץ הזה + `CLAUDE.md` סעיף 9 הם המקור היחיד לאמת על מה שנעשה. אל תניחו דברים אחרים על סמך זיכרון.
