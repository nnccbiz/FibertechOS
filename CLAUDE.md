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
| AI assistant | Google Gemini API — `gemini-2.5-flash` (chat) + `gemini-2.5-pro` (extraction) — internal chatbot "Roxy" (רקסי) |
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
│   │       └── quote/[quoteId]/  # Quote preview page (A4, PDF, email — items paginated across pages)
│   ├── customers/                # Customers module (under marketing)
│   │   ├── page.tsx              # Customers list + search (company/contact/phone/email) + "new customer"
│   │   └── [id]/                 # Customer card: quote history (color-coded) + projects + contacts
│   ├── drawings/                 # Drawings search page (by drawing number / project name / project number) + Roxy can route here
│   ├── production/               # Production order tracking with status workflow
│   ├── forms/                    # Israeli standard forms (B116, B12-2, B165, B244)
│   ├── logistics/iskoor/         # Iskoor logistics tracker
│   ├── quote/[token]/            # Public shared quote page (no auth)
│   ├── (admin)/settings/
│   │   ├── requests/             # Admin: pending access request approval queue
│   │   └── users/                # Admin: user permission matrix editor
│   └── api/
│       ├── ai/                   # Gemini AI proxy — Roxy chatbot (PDF/image/chat) + local XLSX BOQ parsing
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
│   ├── projects/                 # PricingSection, AiChat, ContactsInput, PipeSpecsInput, StatusTracker, ExchangeRateWidget, CompanyAutocomplete
│   ├── customers/                # CustomerForm (create/edit customer card + contacts; reused in /customers, project page, new-quote form)
│   ├── forms/                    # FormB116, FormB12_2, FormB165, FormB244
│   ├── logistics/                # IskoorTracker
│   ├── admin/                    # PendingRequestsList, UserPermissionsEditor, ContractTemplatesEditor
│   ├── ui/                       # SearchableSelect (drop-in <select> replacement, used in 20+ places)
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
│   ├── disclaimers.ts            # Quote disclaimer templates per product type
│   └── contract-terms.ts         # Fallback contract sections (used when a quote has no template/overrides)
├── hooks/
│   └── usePricing.ts             # Pricing hook for components (cost inputs, quotes, orders, contract templates, project drawings/specs)
├── middleware.ts                 # Auth gate — all routes require session except PUBLIC_ROUTES
├── supabase/
│   ├── schema.sql                # Base schema reference
│   └── migrations/               # 001-020 + 20260419_001-004 + 20260420_001 + 20260524_001-006 + 20260524_007 (sync_contacts_to_customers_trigger) + 20260528_001 (contact_link_sync_and_quote_snapshot) + 20260528_002 (security_advisor_hardening) + 20260531_001 (duplicate_cost_input_rpc) + 20260603_001 (contract_term_templates)
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
- **New tables — GRANT convention**: Supabase is removing auto-exposure of new `public` tables to the Data API (new projects from 2026-05-30; enforced on new tables in existing projects from 2026-10-30). When a migration creates a table, add an explicit grant alongside RLS so the app (anon key) can reach it, e.g. `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;` (and `GRANT SELECT ... TO anon;` only for tables the public/share flow reads). GRANT opens the table at the API/table level; RLS still governs row access — both are required. Trigger/`SECURITY DEFINER` helper functions don't need `EXECUTE` granted to anon/authenticated — `REVOKE EXECUTE ... FROM anon, authenticated;` to keep them off the RPC surface.
- **Rate limiting on `/request-access`**: Domain check (`@fibertech.co.il`), 1 pending per email, 30-day cooldown on decline, 3 req/IP/hr, 20 req/hr global.

### Pricing Engine
- **Gross-margin formula**: `Selling = Cost * (1 + overheads%) * (1 + profit%)`.
- **Full cost chain**: Supplier foreign price -> exchange rate -> ILS cost -> overheads -> profit -> selling price.
- **Item types**: `pipe_with_coupling`, `pipe_bare`, `coupling`, `wall_coupling`, `roker`, `elbow`, `flange`, `reducer`, `other`.
- **Roker calculation**: Special formula based on DN diameter: `rokerLength = (DN / 1000) * 2`.
- **Quote tiers**: `planner_estimate`, `contractor_pre_tender`, `contractor_final`.
- **Margin validation**: Warns on items with margin < 10% or > 60%, or zero cost.
- **Bulk profit control**: In the quote items editor, one profit % can be applied across a category at once — pipes, accessories, or all. Short pipes/rokers count as accessories (`itemCategory()` in `usePricing.ts`).

### AI Integration (Roxy)
- Google Gemini API. `gemini-2.5-flash` for chat (cheap, fast). `gemini-2.5-pro` for supplier-quote / drawing-meta extraction (better grounding). Requires `GEMINI_API_KEY` + active billing on Google AI Studio.
- System prompt defines available tables and expected response format. Structured JSON output (`responseMimeType: application/json`).
- Extraction is tuned for grounded reading: `temperature: 0, topK: 1, topP: 0.1`, `thinkingConfig.thinkingBudget: 16384`, `maxDuration: 120`. The prompt requires Pro to emit a verbatim `_audit_rows` array (one entry per source row with each column's literal value) BEFORE producing `data`; items not derivable from `_audit_rows` are treated as fabrication. Translation and prefix substitution (e.g. `CC-GRP` → `GRP`) are explicitly banned.
- Excel/CSV BOQ files are parsed **locally only** via `xlsx` (`parseExcelBOQ` scans for every header row in the sheet for multi-section BoQs and skips totals). Excel uploads no longer fall back to Gemini — if local parsing finds nothing, the user sees an explicit error instead of fabricated items.
- One multimodal call handles chat + PDF + image. Each file gets its own Gemini call, then results are merged; `generateWithRetry` retries 503/429/500 with exponential backoff (1s/2s/4s, 3 attempts).
- Handles: create/update/delete records, import supplier quotes, generate reports, add tasks.
- Supplier quote extraction: Parses Amiblu / Subor / Flowtite quotation documents into structured `cost_input_items` (with `original_price`, `original_currency`, `pn`, `sn`, `length_m`).

### Customers Module (under marketing permission)
- The existing `clients` table is the customer master (company `name`, `tax_id` (ח.פ.), `address`, `city`, `phone`, `email`, `notes`). `client_contacts` holds multiple per-customer contacts.
- `quotes.customer_id` and `projects.customer_id` link quotes/projects to a customer. `quotes.contact_id` -> `project_contacts` is the specific addressee for that quote's preview.
- Flow: a project starts with no customer (quotes go to potential customers); after the tender is won, the "🏆 לקוח זוכה" selector in the project's contacts section sets `projects.customer_id`.
- Customer card aggregates quote history (🟢 signed / 🟠 sent·pending / 🔴 rejected·expired) with an auto-generated background line, plus the customer's projects.
- RLS: `clients`/`client_contacts` readable with `marketing` or `projects` view; writable with `marketing` or `settings` edit.
- `project_contacts.company` notes which company each project contact belongs to.
- **Contact link + bidirectional sync** (migration `20260528_001`): `project_contacts.client_contact_id` FK (ON DELETE SET NULL) links a project contact to its master client contact. A trigger keeps name/role/phone/email in sync from master → project contacts. A second trigger reverse-syncs project_contact → master when the project copy is edited (so the user can edit a contact from anywhere).
- **Quote contact snapshot**: `quotes.contact_snapshot` (jsonb) freezes the addressee at the moment status flips to `sent`/`signed`, so the public/PDF view doesn't drift if the project_contact is later edited. The internal preview uses the snapshot when present, falls back to the live linked contact otherwise.
- **Contact picker scope**: In the new-quote form, picking a customer restricts the contact dropdown to that customer's `client_contacts`; on existing draft quotes the picker shows both project + customer contacts grouped via `SearchableSelect`'s `group` field. Picker values are prefixed `pc:<id>` (project contact) or `cc:<id>` (customer contact); `assignQuoteContact` materializes a `cc:` pick into `project_contacts` with `client_contact_id` set, reusing an existing row when name already matches.
- **Customer card contacts panel** filters `project_contacts` by `client_contact_id IN customer's client_contacts.id` (strong signal), with a `company`-text fallback for legacy rows.

### Drawings & Specs Module
- Two project-level attachment kinds, both stored in `attachments` with `entity_type='project'`:
  - **Drawings** — `file_type='drawing'`, blue 📐 chip, displayed as `{project_number}/{drawing_number}`. On upload the AI route's `drawing_meta` mode (Gemini Pro) extracts the drawing number; falls back to a `\d{3,5}-\d{1,4}` pattern in the filename. Render orientation in the quote PDF: **landscape** A4.
  - **Specs** — `file_type='spec'`, amber 📋 chip, no drawing-number column, no Gemini extraction. Drag-drop accepts `pdf,png,jpg,doc,docx,xls,xlsx`. Render orientation in the quote PDF: **portrait** A4.
- Each lives in its own card on the project page (specs on top, drawings on bottom), each with its own drag-and-drop overlay.
- `/drawings` search page: by drawing number / project name / project number. Roxy understands "find a drawing of project X" and routes to `/drawings?q=`.
- `quote_drawings` (despite its name) links **both** drawings and specs to a quote via checkboxes in the quote card. Multi-select. The quote preview renders each linked file as a full A4 page (orientation per `file_type`) inserted between the summary section and the contract terms. Picker label: "📐 שרטוטים ומפרטים לצירוף להצעה זו"; each item shows the matching 📐/📋 icon.
- After uploading or deleting a spec/drawing on the project page, `attachmentVersion` (a counter) is bumped and passed to `PricingSection`, which calls `usePricing.refreshProjectDrawings()` so the quote-card checkboxes pick up the change without a full reload.
- Public `/quote/[token]` does not yet show linked drawings/specs (needs anon RLS).

### Contract Terms Library
- Master templates live in `contract_term_templates` (jsonb `content` of `{title, clauses: [{num, text}]}[]`). Editor at `/settings/contract-templates` lets admins create, rename, duplicate, mark a default, delete, and edit sections/clauses of templates.
- `quotes.contract_template_id` picks a template; `quotes.contract_overrides` (jsonb) holds per-quote edits (also used as the snapshot once issued).
- Each draft quote shows a "📜 תנאי הסכם" picker + ✏️ "ערוך להצעה זו" modal + 🔄 "שחזר מהתבנית" button. `duplicateQuote` carries over `contract_template_id` + `contract_overrides`.
- On send/signed, if no overrides exist, the linked template's content is copied into `contract_overrides` so future template edits don't change an issued quote. **Known gap**: quotes with `contract_template_id=NULL` aren't snapshotted — they render from `lib/contract-terms.ts:CONTRACT_SECTIONS` at preview time, meaning a code edit can mutate already-signed terms retroactively.
- Quote preview resolves terms in this order: `contract_overrides` > template.content > `lib/contract-terms.ts` fallback.

### Cost Inputs (Pricing Source)
- A project can hold multiple `cost_inputs` (one per supplier quote or internal pricing). Each has `source_type` (`supplier` / `internal`), `currency`, optional `exchange_rate`, `exchange_rate_date`, `payment_terms`, `notes`, `is_archived`.
- Items in `cost_input_items` carry: `product_name`, `dn_size`, `quantity`, `unit`, `cost_price` (always ILS), `original_price` + `original_currency` (when foreign), `item_type`, `pn`, `sn`, `length_m`, `sort_order`.
- **Effective currency**: when a cost input was duplicated buggily into ILS but its items are still EUR/USD, the UI (`CostInputCard`, `CostItemsEditor`, `addCostItem`, `updateCostItem`, `refreshCostInputRate`) falls back to the items' `original_currency` when `cost_inputs.currency='ILS'`. **This duplication is a known altitude smell** — see Issues from Code Review (item #11).
- **Duplicate**: `duplicate_cost_input(p_ci_id)` RPC atomically copies the row + all items + attachment rows in one transaction (attachment rows reuse the same storage object — see Bugs #4 below).
- **Refresh rate**: 🔄 button on a foreign-currency cost input pulls today's Bank-of-Israel rate, rewrites `cost_inputs.exchange_rate`/`exchange_rate_date`, and re-prices every item via `original_price × newRate`. Manual ILS overrides are clobbered (Bug #8).
- **File upload to Roxy**: drag PDFs / Excel / images onto an expanded card → `parseCostFile` uploads them as attachments + sends to Gemini Pro for extraction. Excel files never reach Gemini (local-only parser).
- **Linking to a quote**: dropdown labels include the currency, date, and item count — `⚠ ריק` flag when 0 items. `setQuoteCostInput` replaces all `quote_items` (DELETE + INSERT, no transaction, no merge — manual overrides are lost on switch).

### Quote Sharing
- Public share via expiring tokens (`/quote/[token]`). View tracking. No auth required for public quote page.
- A4 preview with drawings. PDF generation via jspdf + html2canvas. Email via .eml file with PDF attachment.
- Quote date in the printed header/footer: drafts → today (fresh each render, since prices are pegged to today's FX); sent/signed → `quote.updated_at`. **Known drift**: `updated_at` advances on any back-office tweak (notes, drawings toggle, contact change), so a sent quote's date can shift. Proper fix is a `sent_at` column.

### Navigation
- Desktop: Collapsible sidebar (hover to expand, 60px collapsed / 200px expanded).
- Mobile: Scrollable bottom nav bar.
- Both are permission-gated: only modules the user has access to appear.

### UI Conventions
- **SearchableSelect** (`components/ui/SearchableSelect.tsx`) is the drop-in replacement for native `<select>` used across the app (20+ places). Popover uses fixed positioning (so it escapes table/overflow containers), auto-flips above when there isn't room below, clamps to the viewport horizontally, repositions on scroll/resize while open. Supports `optgroup`-style grouping via the `group` field on options.
- **Drag-and-drop** is used in two places (cost input cards in `PricingSection.tsx`, project drawings/specs in `app/projects/[id]/page.tsx`). Pattern is duplicated — see Issues #12.
- **Modal wrappers** (CustomerForm, ContractTermsModal) use a fixed-inset overlay with `bg-black/40` and a centered card. Pattern is duplicated in 5 places.
- **Currency display**: `formatILS` lives in `lib/revenue.ts` but many files inline a local `formatCurrency`. Same with `formatDate`. Should be consolidated.

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
GEMINI_API_KEY=<for Roxy AI — Google AI Studio, billing must be enabled>
```
(`GROQ_API_KEY` is no longer used — Roxy runs entirely on Gemini.)

## 7. Known Issues / TODO

### Issues from Code Review (Fri 2026-06-12, branch `claude/read-claude-md-TBUdH`)

Verified findings from a high-effort multi-angle review of the branch. Ranked by severity — fix top-to-bottom.

**🔴 Critical — data loss / wrong-money bugs**
1. **`app/api/ai/route.ts:200`** — `detectCol` normalizes apostrophes (`replace(/[״"''`]/g, '"')`) but the unit-column keyword list still contains literal `'יח\''`. A header `יח'` becomes `יח"`, never matches the keyword, so `parseExcelBOQ` defaults `price_per` to `'unit'` on every row → meter-priced BoQs save as per-unit, multiplying real cost by the meter count.
2. **`hooks/usePricing.ts:492`** — `saveCostInputItems` inserts without `.select()` then writes `setCostInputItems({ [costInputId]: valid })` where `valid` has no DB `id`. Subsequent `refreshCostInputRate` updates by `.eq('id', undefined)` — 0 rows affected, local state lies. User clicks 🔄 → UI updates → reload reverts.
3. **`components/customers/CustomerForm.tsx:76`** — On every save, deletes all `client_contacts` for the customer and re-inserts with new UUIDs. FK `project_contacts.client_contact_id` (ON DELETE SET NULL) is nulled for every linked project_contact → customer card filter (which depends on this link) loses them silently.
4. **`hooks/usePricing.ts:419` ↔ `:280`** — `duplicateCostInput` reuses the source's `file_url` ("no duplicated bytes"). `deleteCostInput` unconditionally calls `storage.remove(paths)`. Deleting either side destroys the blob the other still references → orphan attachment row.
5. **`hooks/usePricing.ts:898`** — `setQuoteCostInput` does `DELETE FROM quote_items WHERE quote_id=...` then INSERT, with no transaction. INSERT failure (varchar overflow, RLS edge, network) leaves the quote empty in DB while the local cache still shows old items. Also: this destroys any manual per-line work (discount, custom unit_price, notes).

**🟠 High — legal/contractual mismatch**
6. **`app/projects/[id]/quote/[quoteId]/page.tsx:269`** — Quote date for non-draft quotes is `quote.updated_at`. Every back-office mutation (`setQuoteNotes`, `toggleQuoteDrawing`, `setQuoteContact`, `setQuoteCustomer`, `setQuoteContractOverrides`) bumps `updated_at` → printed date silently shifts forward after the quote was sent. Fix: add `quotes.sent_at` column, freeze it in `updateQuoteStatus`.
7. **`hooks/usePricing.ts:1012`** — `updateQuoteStatus` only freezes contract terms when `q.contract_template_id` is non-null (`if (q && !q.contract_overrides && q.contract_template_id)`). Quotes without a template render from the hard-coded `lib/contract-terms.ts:CONTRACT_SECTIONS` at preview time → editing that file changes already-signed quotes retroactively. Drop the guard and snapshot the resolved sections (including fallback).
8. **`app/quote/[token]/page.tsx`** — Public share page never resolves `quote.contract_overrides` → template.content → fallback. The internal preview does. Customer-facing terms can disagree with the signed PDF.
9. **`hooks/usePricing.ts:988`** — `updateQuoteStatus` snapshots `contact_snapshot` from `(q.contact_id && contacts.find(...)) || contacts[0]`. If the linked contact was deleted between draft and 'sent', the fallback silently freezes `contacts[0]` (often the planner) as the recipient.
10. **`hooks/usePricing.ts:219`** — `refreshCostInputRate` unconditionally rewrites `cost_price` for every foreign item via `original_price × newRate`. Any manual ILS override the user typed in (negotiated discount, fixed price) is silently wiped. The confirm dialog explicitly says "המחיר במטבע המקור נשאר זהה" but doesn't warn about ILS overrides.

**🟡 Architectural / bandaids**
11. **Effective-currency duplication** — The "use header currency if foreign, else look at items' `original_currency`" rule is repeated in 6+ places (`usePricing.ts:451,455,324,1098`, `PricingSection.tsx:305,466`) and the quote preview's `currencyPegNote` uses only `cost_inputs.currency` (the simpler form) — a EUR-tagged-ILS cost input shows the right column in the editor but the wrong currency-peg sentence on a sent quote. Real fix: drop `cost_inputs.currency` as a separate source, or maintain it via trigger from items.
12. **Drag-drop boilerplate duplicated** — `PricingSection.tsx:314` (cost-input cards) and `app/projects/[id]/page.tsx:1080-1106` (drawings/specs) repeat the same `dragOver` state + `dragDepth` ref + four handlers. The drawings copy is missing the `Files`-type guard in `onDragLeave`/`onDrop` — a directory drop fires `uploadProjectDrawing` on zero files and leaves the overlay stuck. Extract a `useFileDrop({ enabled, onFiles })` hook.
13. **`quote_items` missing pn/sn/length_m columns** — Cost input items have `pn`, `sn`, `length_m` (populated by Gemini extraction), but `quote_items` doesn't have these columns at all. `parsePipeSpec` only extracts via regex from `product_name`; for Flowtite descriptions like "Flowtite GRP Pipe with One Coupling on end L=5.7m" there's no PN/SN token so the table shows "—". Fix: add columns + propagate in `createQuote`/`setQuoteCostInput`.

**🟢 Smaller bugs / future-failing**
14. **`supabase/migrations/20260524_006_quote_drawings.sql`** — Missing `GRANT SELECT/INSERT/UPDATE/DELETE ON public.quote_drawings TO authenticated` (project's stated convention in §5). Will break when Supabase enforces no-auto-expose on existing-project new tables (2026-10-30).
15. **`app/customers/[id]/page.tsx:59`** — `new Date(q.valid_until) < new Date()` compares a DATE column (UTC midnight) to local-time `now`. In Israel (UTC+3), a quote expiring today is flagged "פג תוקף" from 03:00 local — a full day early.
16. **`supabase/migrations/20260528_002_security_advisor_hardening.sql:13`** — `auth_insert_attachments` tightened from `WITH CHECK (true)` to `has_module_permission('projects','edit')`. `uploadCostInputAttachment` only console.errors RLS denial and `parseCostFile` catches it silently. Marketing-only users uploading supplier PDFs see "items extracted" but the source file is silently lost (orphan in storage). Same on `order_documents` for production-only users.

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
- Normalize `clients` table — partially done: `clients` is now the customer master with `customer_id` links on quotes/projects, but `projects` still keeps plaintext `developer_name`/`planning_office` alongside the FK roles.
- Project stage history tracking.
- Backfill `projects.customer_id` for existing projects (only quotes were auto-seeded to customers).
- Linked drawings/specs on public `/quote/[token]` (needs anon RLS on `quote_drawings` + `attachments`).
- Consolidate inline `formatCurrency` / `formatDate` copies into `lib/revenue.ts` helpers (Reuse cleanup, see review #11-12).
- Extract `useFileDrop` hook and `<Modal>` wrapper from duplicated implementations.
- Move pdf.js dynamic import to module scope (currently re-imported per attachment in quote preview).

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

### קונבנציות שנלמדו במהלך הסשנים (יוני 2026)
- **Safari popup blocker**: כדי לפתוח קובץ פרטי מ-Supabase Storage בטאב חדש ב-iPad/Safari, חייבים לפתוח את ה-tab _סינכרונית_ ב-onClick handler (`const w = window.open('about:blank', '_blank')`) ולשנות `w.location.href` בתוך `.then()` של `createSignedUrl`. אחרי await הוא נחסם.
- **RTL וכיווניות**: על מספרי טלפון, קודי מוצר אנגליים (DN1700, OD1720, PN01), ותיאורי מוצרים בלטינית בתוך טבלאות עבריות — חובה `dir="ltr"`. בלי זה Safari משכפל סדר ספרות (0 בסוף, פרנתזות הפוכות).
- **iPad SearchableSelect**: על מסך נמוך עם מקלדת או צד התחתון של הדף, ה-popover חייב לבדוק שטח ולהיפתח כלפי מעלה. הלוגיקה כבר בקוד — אם תוסיף עוד אחד, אל תשבור אותה.
- **Hooks order**: אל תוסיף `useEffect` אחרי early return של loading state (זה משנה את סדר ה-hooks → React error). הזז את ה-hook למעלה.
- **Quote preview pagination**: רצף הדפים הוא items → summary → drawings/specs (landscape/portrait לפי file_type) → contract title → clauses → signatures. ה-force-break לפני `ctitle` משולב גם ב-pack של ה-estimates וגם ב-DOM measurement. אל תשכח לעדכן את שניהם.
- **Cost-input duplication bug**: לעיתים שכפול של תמחור משאיר `cost_inputs.currency='ILS'` בעוד שהפריטים ב-EUR/USD. הלוגיקה של "effective currency" ב-6+ מקומות מתמודדת עם זה. הפתרון הנכון הוא לתקן את ה-`duplicate_cost_input` RPC ולנרמל את ה-DB (TODO).
- **משימה לפני אישור**: כשמטפלים בבעיה שיכולה להיות אובדן נתונים (delete-then-insert בלי טרנזקציה, FK SET NULL בקנה מידה גדול), חובה להתריע ולשאול לפני שמריצים.
- **Code review דוח (יוני 2026)**: סעיף 7 כולל 16 ממצאים מאומתים מהביקורת. כשמתחילים סשן חדש לתקן באגים — להתחיל מהקריטיים (#1-#5) ולפי הסדר.
