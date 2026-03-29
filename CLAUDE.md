# CLAUDE.md - FibertechOS

## Project Overview

FibertechOS is an operational management system for Fibertech Infrastructure, an Israeli company. Built with Next.js 15 (App Router), React 18, TypeScript, Supabase, and Tailwind CSS. The entire UI is in **Hebrew (RTL)**.

## Tech Stack

- **Framework:** Next.js 15.3 (App Router), React 18, TypeScript 5
- **Database:** Supabase (PostgreSQL + PostGIS + Auth + Realtime)
- **Styling:** Tailwind CSS 3.4, PostCSS, Autoprefixer
- **Linting:** ESLint 8 (Next.js config)
- **Automation:** Make.com webhooks

## Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

No test framework is configured yet.

## Directory Structure

```
app/                          # Next.js App Router pages
  layout.tsx                  # Root layout (lang="he" dir="rtl")
  page.tsx                    # Homepage with module navigation
  api/webhooks/               # API routes (POST handlers)
  forms/                      # Field form pages (b165, b244, b116, b12-2)
  logistics/iskoor/           # ISKOOR shipment tracking page
components/
  ui/                         # Reusable UI (SignaturePad, PhotoUpload)
  forms/                      # Form components (FormB165, FormB244, FormB116, FormB12_2)
  logistics/                  # Logistics components (IskoorTracker)
lib/
  supabase.ts                 # Supabase client initialization
  pricing.ts                  # Gross margin pricing engine
database/
  schema.sql                  # Full PostgreSQL schema (enums, tables, RLS policies)
supabase/                     # Supabase project config
```

## Architecture & Patterns

### Routing
Next.js 15 App Router with file-based routing. Pages are server components by default.

### Client vs Server Components
- Interactive components (forms, signature pads, uploads) use `'use client'` directive
- Page wrappers and layouts are server components unless they need client interactivity
- Import path alias: `@/*` maps to project root

### Database
- Supabase PostgreSQL with PostGIS extension for GPS coordinates
- Schema defined in `database/schema.sql`
- Key tables: `profiles`, `contacts`, `quotes`, `projects`, `alerts`, `iskoor_shipments`
- Row-Level Security (RLS) is used
- Client initialized in `lib/supabase.ts` using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Forms
Each form (B-165, B-244, B-116, B-12-2) follows the pattern:
- Page in `app/forms/<id>/page.tsx` renders the form component from `components/forms/`
- Forms use controlled inputs with `useState`
- Include signature capture (canvas-based) and photo upload capabilities
- Submit data to Supabase

### API Routes
- Webhook handlers in `app/api/webhooks/` (e.g., `quote-signed/route.ts`)
- Integrate with Make.com for automation (email notifications, alerts)

## Internationalization

- All UI text is in **Hebrew**
- Root layout sets `lang="he" dir="rtl"`
- Date formatting uses `toLocaleDateString('he-IL')`
- Always maintain RTL layout conventions when adding UI

## Styling Conventions

- Use Tailwind CSS utility classes exclusively
- Content containers: `max-w-3xl mx-auto`
- Spacing: `p-4`, `gap-4`, `space-y-6`
- Primary color: blue (`blue-700`, `blue-50`, `blue-100`)
- Text: `text-sm text-gray-700`, headings use `font-semibold`
- Borders: `rounded-lg` or `rounded-xl`, `border`, `shadow-sm`

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=<supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
MAKE_WEBHOOK_URL=<make-automation-webhook-url>
FINANCE_EMAIL=<finance-team-email>
```

## Key Conventions

1. **TypeScript** — All new files should be `.ts`/`.tsx` with strict mode
2. **Hebrew UI** — All user-facing text in Hebrew; maintain RTL layout
3. **Supabase** — Use the shared client from `lib/supabase.ts`; never expose `SUPABASE_SERVICE_ROLE_KEY` client-side
4. **Component naming** — PascalCase for components, forms prefixed with `Form` (e.g., `FormB165`)
5. **File naming** — Page routes use lowercase kebab-case directories
6. **No Prettier** — Only ESLint is configured; run `npm run lint` before committing
7. **No tests yet** — No test runner is set up; if adding tests, use Vitest (compatible with Next.js)
