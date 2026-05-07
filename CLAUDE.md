# CLAUDE.md — FibertechOS

## 1. Overview

FibertechOS is an internal operations management system for **Fibertech Tashtiyot** (פיברטק תשתיות), an Israeli distributor of GRP (Glass Reinforced Plastic) piping for water, sewage, and drainage infrastructure. The company imports pipes from Amiblu and Subor, then sells and supports installation across public-sector projects in Israel.

The system manages the full lifecycle: lead tracking, project management, quote generation with gross-margin pricing, production order tracking, inventory, logistics, and management reporting. The UI is entirely in Hebrew (RTL).

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict mode) |
| UI | React 18, Tailwind CSS 3.4 |
| Font | Heebo (Google Fonts, Hebrew-optimized) |
| Database | Supabase (Postgres 17, hosted `eu-west-3`) |
| Auth | Supabase Auth (email/password), custom permission matrix |
| Storage | Supabase Storage (quote attachments, drawings) |
| AI assistant | Groq API (llama-3.3-70b) — internal chatbot "Roxy" (רקסי) |
| PDF generation | jspdf + html2canvas |
| Hosting | Vercel (auto-deploy from GitHub) |
| Repo | GitHub `nnccbiz/FibertechOS`, branches: `main` (prod), `dev` (staging) |

## 3. Project Structure

```
FibertechOS/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout — RTL, Heebo font, AppShell wrapper
│   ├── page.tsx                  # Dashboard — KPIs, alerts, pipeline, reports
│   ├── globals.css               # Tailwind + animations (fadeInUp, skeleton shimmer, aiGlow)
│   ├── login/                    # Login page + LoginForm component
│   ├── request-access/           # Self-signup for new employees (@fibertech.co.il only)
│   ├── set-password/             # First-login password setup
│   ├── auth/callback/            # Supabase magic-link/invite handler
│   ├── projects/
│   │   ├── list/                 # Projects list page
│   │   ├── new/                  # New project form
│   │   └── [id]/                 # Project detail page
│   │       └── quote/[quoteId]/  # Quote preview page (A4, PDF, email)
│   ├── production/               # Production order tracking with status workflow
│   ├── forms/                    # Israeli standard forms (B116, B12-2, B165, B244)
│   ├── logistics/iskoor/         # Iskoor logistics tracker
│   ├── quote/[token]/            # Public shared quote page (no auth)
│   ├── (admin)/settings/
│   │   ├── requests/             # Admin: pending access request approval queue
│   │   └── users/                # Admin: user permission matrix editor
│   └── api/
│       ├── ai/                   # Groq AI proxy — Roxy chatbot
│       ├── access-requests/      # Public POST — new access request (rate-limited)
│       ├── approve-request/      # Admin — approve/decline access requests
│       ├── auth/log-attempt/     # Audit log for login attempts
│       ├── exchange-rate/        # USD/EUR/GBP → ILS rates
│       ├── quote-share/          # Generate share tokens for quotes
│       └── webhooks/quote-signed/ # Webhook for signed quotes
├── components/
│   ├── ui/
│   │   ├── AppShell.tsx          # Layout shell — Sidebar + BottomNav + FloatingChat
│   │   ├── Sidebar.tsx           # Desktop sidebar — permission-gated nav items
│   │   ├── BottomNav.tsx         # Mobile bottom nav — permission-gated
│   │   ├── PhotoUpload.tsx       # Photo upload component
│   │   └── SignaturePad.tsx      # Signature capture pad
│   ├── dashboard/                # KpiCard, AlertsList, ProjectsTable, Pipeline, TeamStatus, InventoryWidget
│   ├── projects/                 # PricingSection, AiChat, ContactsInput, PipeSpecsInput, StatusTracker, ExchangeRateWidget
│   ├── forms/                    # FormB116, FormB12_2, FormB165, FormB244
│   ├── logistics/                # IskoorTracker
│   ├── admin/                    # PendingRequestsList, UserPermissionsEditor
│   └── ai/                       # ActivityLog, AiSidebar, CommandBar, FloatingChat
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Browser Supabase client (anon key, respects RLS)
│   │   └── server.ts             # Server Supabase client + createAdminClient() (service_role, bypasses RLS)
│   ├── supabase.ts               # Legacy client (pre-auth)
│   ├── auth/
│   │   ├── permissions.ts        # Permission constants, types, validatePassword()
│   │   └── permissions-context.tsx # React context — usePermissions() hook
│   ├── pricing.ts                # Gross-margin pricing engine (pipe cost chain, roker, accessories, quote summary)
│   ├── revenue.ts                # Monthly revenue calculator, formatILS(), MONTH_NAMES
│   ├── exchange-rate.ts          # Currency conversion utilities
│   └── disclaimers.ts            # Quote disclaimer templates per product type
├── hooks/
│   └── usePricing.ts             # Pricing hook for components
├── middleware.ts                 # Auth gate — all routes require session except PUBLIC_ROUTES
├── supabase/
│   ├── schema.sql                # Base schema reference
│   └── migrations/               # 001-020 + 20260419_001-004 + 20260420_001
├── database/                     # STALE — pre-migration schema files (should be regenerated or deleted)
├── public/
│   └── logo.png
├── CLAUDE_HANDOFF.md             # Detailed session handoff from previous Claude sessions
└── RLS_MIGRATION_GUIDE.md        # Hebrew setup guide for RLS + auth
```

## 4. Code Conventions

- **Language**: All UI text is in Hebrew. Code identifiers are in English.
- **RTL**: Root `<html lang="he" dir="rtl">`. Layout flows right-to-left. Sidebar is on the right (`fixed top-0 right-0`). `mr-[60px]` on main content.
- **Styling**: Tailwind CSS utility classes inline. No CSS modules, no styled-components. Custom animations defined in `globals.css`. Primary color: `#1a56db` (blue).
- **Components**: Functional components with hooks. `'use client'` directive on interactive components. No class components.
- **Imports**: `@/*` path alias maps to project root. Supabase clients imported from `@/lib/supabase/client` (browser) or `@/lib/supabase/server` (server).
- **Data fetching**: Client-side `useEffect` + `createClient()` for most pages. Server-side `createClient()` from `@/lib/supabase/server` in API routes and server components.
- **State management**: React `useState` + `useEffect`. Permissions via `PermissionsProvider` context. No Redux/Zustand.
- **Currency**: All prices stored in ILS. Foreign currency costs converted via exchange rate API. Formatting via `Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' })`.
- **Dates**: Stored as ISO strings. Displayed via `toLocaleDateString('he-IL')`.
- **No tests**: No test files or testing framework configured.
- **No i18n library**: Hebrew strings are hardcoded in components.

## 5. Architectural Decisions

### Authentication & Authorization
- **Middleware gate**: `middleware.ts` checks Supabase session on every request. Unauthenticated users redirect to `/login`. Public routes: `/login`, `/request-access`, `/auth/callback`, `/set-password`, `/forgot-password`, `/quote`.
- **First-login password change**: Users with `must_change_password: true` in metadata are forced to `/set-password`.
- **Three-tier coarse roles**: `admin`, `member`, `viewer` (stored in `team_members.access_level`).
- **Fine-grained permission matrix**: `user_module_permissions` table = (user x module x level). Nine modules: `dashboard`, `projects`, `marketing`, `import`, `production`, `field`, `inventory`, `reports`, `settings`. Four levels: `none`, `view`, `edit`, `full`.
- **Admins bypass matrix**: `is_admin()` SQL function returns true for admin role, granting full access everywhere.
- **RLS enforcement**: 42 RLS policies on all tables. Every query through anon key is filtered by the user's permissions.
- **Rate limiting on `/request-access`**: Domain check (`@fibertech.co.il`), 1 pending per email, 30-day cooldown on decline, 3 req/IP/hr, 20 req/hr global.

### Pricing Engine
- **Gross-margin formula**: `Selling = Cost * (1 + overheads%) * (1 + profit%)`.
- **Full cost chain**: Supplier foreign price -> exchange rate -> ILS cost -> overheads -> profit -> selling price.
- **Item types**: `pipe_with_coupling`, `pipe_bare`, `coupling`, `roker`, `elbow`, `flange`, `reducer`, `other`.
- **Roker calculation**: Special formula based on DN diameter: `rokerLength = (DN / 1000) * 2`.
- **Quote tiers**: `planner_estimate`, `contractor_pre_tender`, `contractor_final`.
- **Margin validation**: Warns on items with margin < 10% or > 60%, or zero cost.

### AI Integration (Roxy)
- Groq API with llama-3.3-70b. Structured JSON output only.
- System prompt defines available tables and expected response format.
- Handles: create/update/delete records, import supplier quotes, generate reports, add tasks.
- Supplier quote extraction: Parses Amiblu/Flowtite quotation documents into structured `cost_input_items`.

### Quote Sharing
- Public share via expiring tokens (`/quote/[token]`). View tracking. No auth required for public quote page.
- A4 preview with drawings. PDF generation via jspdf + html2canvas. Email via .eml file with PDF attachment.

### Navigation
- Desktop: Collapsible sidebar (hover to expand, 60px collapsed / 200px expanded).
- Mobile: Scrollable bottom nav bar.
- Both are permission-gated: only modules the user has access to appear.

## 6. Useful Commands

```bash
# Development
npm run dev          # Start Next.js dev server (localhost:3000)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint

# Git branches
git checkout dev     # Staging branch (deployed to Vercel preview)
git checkout main    # Production branch

# Environment
cp .env.example .env.local   # Then fill in keys
```

### Required Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=https://qiccyigkqunxhvqzncol.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from Supabase dashboard>
SUPABASE_SERVICE_ROLE_KEY=<from Supabase dashboard — SECRET>
NEXT_PUBLIC_SITE_URL=<Vercel deployment URL>
GROQ_API_KEY=<for Roxy AI>
```

## 7. Known Issues / TODO

### Urgent
- `main` branch (production) is broken — still uses old Supabase client without auth. All prod queries fail 403. Need `dev -> main` merge.
- Some team members still missing email addresses and auth accounts (7 out of 9).

### Important
- `/field` and `/import` routes return 404 — modules not yet built.
- `/marketing`, `/inventory`, `/reports`, `/settings` routes may also be stubs or missing.
- Password rotation (90-day) not enforced in middleware — only defined as policy.
- Password history check (last 3 passwords) not implemented at application level.
- No admin email notification for new access requests.
- `database/` folder contains stale schema files — out of sync with current DB.
- `lib/supabase.ts` is a legacy client file (pre-auth migration) — should be removed if unused.

### Nice-to-have
- Cloudflare Turnstile on request-access form.
- 2FA (TOTP) for admin accounts.
- Missing business modules: field visits, import/shipments, NCR/incidents.
- Normalize `clients` table — currently mixed FK + plaintext in `projects`.
- Project stage history tracking.

## 8. Working Instructions for Claude

### תקשורת
- תענה תמיד בעברית
- תסביר שלב-שלב לפני ביצוע משימות מורכבות, ותחכה לאישור לפני שממשיכים
- בסיום כל שלב משמעותי - תאר מה עשית ומה השתנה

### Git ו-commits
- אל תעשה commit או push בלי שביקשתי במפורש
- אל תיצור branches חדשים בלי לשאול
- כשמסיים משימה - תציע commit message ותחכה לאישור
- אל תיגע ב-main branch ישירות - תמיד דרך PR

### שינויי קוד
- לפני שינוי משמעותי בקובץ - תראה לי את התוכנית קודם
- אל תוסיף ספריות (npm packages) חדשות בלי לשאול
- שמור על הקונבנציות הקיימות בפרויקט (RTL, עברית ב-UI, אנגלית בקוד)
- אל תכתוב בדיקות (tests) אלא אם ביקשתי

### Supabase ובסיס נתונים
- אל תריץ migrations או תשנה schema בלי לשאול ולהראות לי את ה-SQL קודם
- אל תיגע ב-RLS policies בלי אישור מפורש - זה קריטי לאבטחה
- שינוי בטבלאות = צריך לבדוק השפעה על RLS, על ה-types, ועל הקוד שמשתמש בהן
- כל פעולה שיכולה למחוק נתונים - חובה לשאול פעמיים

### אבטחה
- אל תשים secrets, API keys או סיסמאות בקוד - רק ב-env vars
- אל תחשוף service role key ב-client-side code
- כשנוגעים בהרשאות (3-tier + matrix) - תסביר לי מה ההשפעה לפני השינוי

### פריסה (Vercel)
- אל תפרוס ל-production בלי אישור
- preview deployments בסדר, production לא
- אם יש שינוי ב-env vars נדרש - תגיד לי במפורש

### כשנתקלים בבעיה
- אם משהו לא ברור - תשאל, אל תנחש
- אם יש כמה דרכים לפתור - תציג את האפשרויות עם יתרונות וחסרונות
- אם פעולה מסוכנת - תעצור ותתריע

### זיכרון בין שיחות
- בתחילת כל שיחה - תקרא את CLAUDE.md ואת README אם קיים
- אם משהו חשוב השתנה במהלך השיחה (החלטה ארכיטקטונית, קונבנציה חדשה) - תזכיר לי לעדכן את CLAUDE.md
