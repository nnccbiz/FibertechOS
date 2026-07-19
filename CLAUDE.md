# CLAUDE.md — FibertechOS

## 1. Overview

FibertechOS is an internal operations management system for **Fibertech Tashtiyot** (פיברטק תשתיות), an Israeli distributor of GRP (Glass Reinforced Plastic) piping for water, sewage, and drainage infrastructure. The company imports pipes from Amiblu and Subor, then sells and supports installation across public-sector projects in Israel.

The system manages the full lifecycle: lead tracking, project management, quote generation with gross-margin pricing, production order tracking, inventory, logistics, and management reporting. The UI is entirely in Hebrew (RTL).

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict mode) |
| UI | React 18, Tailwind CSS 3.4 — Fibertech **design-token layer** (see §5) |
| Font | Assistant (Google Fonts, Hebrew+Latin) — `--ft-font-*`; Roboto Mono for technical figures |
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
│   ├── layout.tsx                # Root layout — RTL, Assistant font, AppShell wrapper
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
│       ├── ai/                   # Gemini AI proxy — file extraction (PDF/image/XLSX) + mode:'text' + mode:'drawing_meta'
│       │   └── chat/             # Roxy conversational engine — Flash tool-loop, RLS reads, propose_action, history
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
│   │   ├── Button.tsx            # Primitive — variants primary/secondary/ghost/danger, sizes sm/md/lg
│   │   ├── Input.tsx             # Primitives — Input / Textarea / Select (token-styled, invalid/iconLeft)
│   │   ├── Field.tsx             # Primitive — label + hint/error wrapper
│   │   ├── Card.tsx              # Primitive — variants default/sunken/navy/outline, accent rule
│   │   ├── Badge.tsx             # Primitive — navy/steel/solid/outline/aqua
│   │   ├── StatusPill.tsx        # Primitive — success/warning/danger/info/neutral with dot
│   │   ├── Modal.tsx             # Primitive — fixed-inset overlay, Escape/backdrop close, RTL
│   │   ├── Toast.tsx             # Primitive — ToastProvider + useToast() (mounted in AppShell)
│   │   ├── PhotoUpload.tsx       # Photo upload component
│   │   └── SignaturePad.tsx      # Signature capture pad
│   ├── dashboard/                # KpiCard, AlertsList, ProjectsTable, Pipeline, TeamStatus, InventoryWidget
│   ├── projects/                 # PricingSection, ContactsInput, PipeSpecsInput, StatusTracker, ExchangeRateWidget, CompanyAutocomplete
│   ├── customers/                # CustomerForm (create/edit customer card + contacts; reused in /customers, project page, new-quote form)
│   ├── forms/                    # FormB116, FormB12_2, FormB165, FormB244
│   ├── logistics/                # IskoorTracker
│   ├── admin/                    # PendingRequestsList, UserPermissionsEditor, ContractTemplatesEditor
│   ├── ui/                       # SearchableSelect (drop-in <select> replacement, used in 20+ places)
│   └── ai/                       # ActivityLog, FloatingChat (רקסי — conversational engine)
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Browser Supabase client (anon key, respects RLS)
│   │   └── server.ts             # Server Supabase client + createAdminClient() (service_role, bypasses RLS)
│   ├── supabase.ts               # Legacy client (pre-auth)
│   ├── auth/
│   │   ├── permissions.ts        # Permission constants, types, validatePassword()
│   │   └── permissions-context.tsx # React context — usePermissions() hook
│   ├── ai/
│   │   ├── roxy-tools.ts         # Roxy tool belt — Gemini function declarations + RLS-scoped executors + propose_action
│   │   ├── execute-action.ts     # Runs a user-confirmed pending_action: allowlist → RLS write → activity log (undo)
│   │   ├── activity-log.ts       # logAiAction() — owner-stamped rows in ai_activity_log
│   │   └── write-allowlist.ts    # Table+column allowlist for every AI-driven write (verified vs live schema)
│   ├── cn.ts                     # Minimal className joiner (no clsx/tailwind-merge dep) — used by primitives
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
│   └── migrations/               # 001-020 + 20260419_001-004 + 20260420_001 + 20260524_001-006 + 20260524_007 (sync_contacts_to_customers_trigger) + 20260528_001 (contact_link_sync_and_quote_snapshot) + 20260528_002 (security_advisor_hardening) + 20260531_001 (duplicate_cost_input_rpc) + 20260603_001 (contract_term_templates) + 20260614_001 (quote_items pn/sn) + 20260614_002/006 (replace_quote_items RPC, atomic + length_m) + 20260614_003 (quotes.sent_at) + 20260614_004 (quote_items.length_m) + 20260614_005 (quote_drawings GRANT) + 20260715_001 (shared_quote_peg_currency RPC) + 20260719_001 (anon RLS for shared-quote drawings/specs) + 20260719_002 (realization_status terminal values) + 20260719_003 (import_orders.po_sent_at/po_sent_by — procurement stage) + 20260719_004 (import_orders.delivery_date) — plus the 20260705/0706/0708 batches noted in §7
├── database/                     # STALE — pre-migration schema files (should be regenerated or deleted)
├── public/
│   └── logo.png
├── CLAUDE_HANDOFF.md             # Detailed session handoff from previous Claude sessions
└── RLS_MIGRATION_GUIDE.md        # Hebrew setup guide for RLS + auth
```

## 4. Code Conventions

- **Language**: All UI text is in Hebrew. Code identifiers are in English.
- **RTL**: Root `<html lang="he" dir="rtl">`. Layout flows right-to-left. Sidebar is on the right (`fixed top-0 right-0`). `mr-[60px]` on main content.
- **Styling**: Tailwind CSS utility classes inline. No CSS modules, no styled-components. Custom animations defined in `globals.css`. **Colors come from the design-token layer (see §5) — never hardcode hex.** Primary/brand is navy `#15427E` (Tailwind `primary`/`navy`), accent is water-azure `#1A73B8` (`azure`, links/interactive). Legacy `#1a56db` and raw `gray-*`/`blue-*`/etc. have been migrated to tokens.
- **Components**: Functional components with hooks. `'use client'` directive on interactive components. No class components.
- **Imports**: `@/*` path alias maps to project root. Supabase clients imported from `@/lib/supabase/client` (browser) or `@/lib/supabase/server` (server).
- **Data fetching**: Client-side `useEffect` + `createClient()` for most pages. Server-side `createClient()` from `@/lib/supabase/server` in API routes and server components.
- **State management**: React `useState` + `useEffect`. Permissions via `PermissionsProvider` context. No Redux/Zustand.
- **Currency**: All prices stored in ILS. Foreign currency costs converted via exchange rate API. Formatting via `Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' })`.
- **Dates**: Stored as ISO strings. Displayed via `toLocaleDateString('he-IL')`.
- **No tests**: No test files or testing framework configured.
- **No i18n library**: Hebrew strings are hardcoded in components.

## 5. Architectural Decisions

### Design System (Tokens & Primitives)
- **Source**: the "Fibertech Design System" built in Claude Design (industrial water-infrastructure palette: navy + steel + water-azure, squared/technical corners, Assistant + Roboto Mono). Applied on branch `claude/ui-ux-rebrand` → merged to `main` 2026-07-03.
- **Token layer** (two files, additive & authoritative):
  - `app/globals.css` `:root` — all CSS variables verbatim from the kit: colors (`--ft-navy*`, `--ft-steel*`, `--ft-azure*`, `--ft-gray*`, status), semantic aliases (`--text-*`, `--surface-*`, `--border-*`), type scale (`--fs-*`, `--lh-*`, `--ls-*`), spacing (`--sp-*`), radii (`--radius-*`), shadows (`--shadow-*`), motion. Plus brand utilities `.ft-section-marker`, `.ft-eyebrow`, `.ft-figure`, `::selection`, `:focus-visible`. Global font is Assistant (`* { font-family: var(--ft-font-sans) }`).
  - `tailwind.config.ts` — binds friendly Tailwind class names to those vars: `primary`/`navy` (navy ramp 50–800), `steel`, `azure`, `aqua`, `ink`, `neutral` (brand gray ramp), `success`/`warning`/`danger`/`info` (each `DEFAULT` + `soft`), semantic `surface-*` / `line-*` / `content-*`, `font-sans/display/mono`, the type scale (`text-3xs`…`text-5xl` with line-heights), `rounded-md/lg/pill`, `shadow-xs…navy` + `shadow-focus`, `ease-brand`, `duration-fast/base/slow`.
- **Naming map used during migration** (apply the same when writing new UI): `#1a56db`→`primary` (navy); links/interactive→`azure`; `#e2e8f0` & `gray-*` borders→`line-subtle`/`line-strong`; text `gray-*`→`content-strong/body/muted` or `neutral-400/300`; page bg→`surface-page`; `green→success`, `red→danger`, `amber/yellow/orange→warning`, `blue→azure` (info) — **except** active/selected/brand-CTA blues → `primary`; `indigo/violet/purple→primary/navy`; `cyan/teal→azure`. **Never** put a Tailwind opacity modifier (`/20`,`/30`) on a token color (they're CSS vars — use a solid shade like `ring-primary-100` instead).
- **Legacy `gray-*` is NOT overridden** in the config (only `neutral` carries the brand ramp) so any not-yet-migrated `gray-*` keeps Tailwind's default — migrate `gray-*`→`neutral-*` when touching a file. As of the rebrand, all pages/components were migrated (0 legacy hits); intentional keeps: WhatsApp/email share buttons (green `#dcf8c6` / pink `#fce4ec`) and the signature-ink color `#1a1a2e`.
- **Primitives** in `components/ui/` (`Button`, `Input`/`Textarea`/`Select`, `Field`, `Card`, `Badge`, `StatusPill`, `Modal`, `Toast`) are token-styled TSX faithful to the kit's component specs. `ToastProvider` is mounted app-wide in `AppShell`; use `useToast().show(msg, { variant })`. Prefer these over ad-hoc markup for new UI.

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
- **Conversational engine (2026-07-05)** — `/api/ai/chat`: server-side Gemini function-calling loop (max 6 rounds) over 10 read tools (projects, quotes, tasks, inventory, leads, customers, drawings, dashboard snapshot, team). Every read runs with the **user's** Supabase client → RLS enforces the permission matrix on answers. Persona: professional-warm Hebrew; answers only from tool data; when the user lacks permission it names WHO can (from `user_module_permissions`+`team_members`, injected per-request) and where to ask.
- **Writes are proposal-only**: the `propose_action` tool returns a `pending_action` (insert/update on allowlisted tables, **no deletes**); the user must click אשר in the chat, then `lib/ai/execute-action.ts` runs allowlist → RLS write → `ai_activity_log` with `previous_values` (undo via the dashboard widget). Import tables are excluded from Roxy by standing policy.
- **Conversation history**: `roxy_conversations`/`roxy_messages` (migration `20260705_002`, owner-only RLS — not even admins). FloatingChat resumes the latest conversation; "שיחה חדשה" button starts fresh.
- **Audit**: every applied/failed/rejected AI action lands in `ai_activity_log`, owner-stamped (policies in `20260705_001` — SELECT own+admin-all, INSERT own, UPDATE for undo). The table was EMPTY until 2026-07-05 (no INSERT policy + no success-logging code).
- All AI routes (`/api/ai`, `/api/ai/chat`, `/api/import/extract`) share the same guards: session, 10MB cap (256KB for chat), 15 req/min + 200/hr per user via `can_make_ai_request`, logged to `ai_request_log`.
- Legacy JSON-action system prompt in `/api/ai` now serves only file-extraction flows; `mode:'text'` serves the email/summary generators (plain text, no JSON envelope).
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
- Public `/quote/[token]` **now shows linked drawings/specs** (2026-07-19, migration `20260719_001`): the page fetches `quote_drawings` + the linked project attachments and renders them as A4 pages like the internal preview. Anon RLS added — `anon_read_shared_quote_drawings` on `quote_drawings`, and `anon_read_shared_attachments` on `attachments` broadened to also cover `entity_type='project'` files linked via `quote_drawings` — both strictly scoped to a valid (non-expired) share token. **Cost-input attachments (`entity_type='cost_input'`) are never referenced by `quote_drawings`**, so pricing files stay invisible to anon (verified against live DB: anon sees 0 cost_input rows). Files stream in real-time by token, so a link already sent to a customer picks up the specs on reload without re-issuing.

### Procurement Module (2026-07-19)
- **`/procurement` ("רכש")** — nav item between לקוחות and יבוא (Sidebar + BottomNav), gated by the **import** module permission (view to see, edit to act). Nitzan's desk: a PO is born, edited, exported and dispatched here.
- **Stage gate**: `import_orders.po_sent_at` (+`po_sent_by`, migration `20260719_003`). NULL → the PO is "בהכנה" and lives ONLY in /procurement; stamped → it appears in /import (the import page filters `orders` to sent ones; unsent are passed as `procurementOrders` for status chips). Historical orders were backfilled with `order_date`/`created_at`. Orders created directly in /import (+ הזמנה) or by SmartUpload are stamped sent on insert; `/api/import/from-quote` auto-drafts stay NULL → land in procurement.
- **Page sections**: (1) "ממתין להזמנת רכש" — signed quotes with no import_order and no exemption; one-click `createPO` (moved from the import page, now double-click-guarded, normalizes supplier names by stripping "(העתק)", opens the editor on creation); (2) "הזמנות רכש בהכנה" — expandable cards with full inline editor (supplier/currency/date/incoterms/payment terms/notes + line items add/edit/delete, auto total) and actions שמור / תצוגת PDF / **הועבר לספק** (stamps `po_sent_at`, promotes draft→planned + reviewed_*) / מחק (full permission); (3) collapsed "הועברו לספק" list linking to /import.
- **`components/procurement/PODocument.tsx`** — branded A4 PO document (same visual language + html2canvas/jsPDF export + measured hidden-mirror pagination as `QuoteDocument` — rows are never cut mid-page). **Language follows the currency**: ILS → Hebrew RTL; foreign (USD/EUR/GBP) → fully English LTR (all template labels, en-GB long date "19 July 2026", common Hebrew units mapped יח׳→pcs/מטר→m/קומפלט→set). Supplier addressee, delivery date, totals in the PO currency, Fibertech-only approval block (supplier signature removed by request).
- **PO editor extras**: `import_orders.delivery_date` (migration `20260719_004`) replaced the supplier_project_no field; editable `project_name` (shown on the PDF); multi-line notes seeded with 4 default terms — English for foreign POs, Hebrew for ILS (`defaultPoNotes`). **Translate window** ("תרגם לאנגלית"): collects every Hebrew field (project name, payment terms, notes, line descriptions), one Gemini `mode:'text'` call, side-by-side original↔editable-English modal, "החל" writes back into the editor.
- **Anomaly check vs the approved quote**: on card open the quote's `quote_items` are loaded and aggregated by spec identity `DN|PN|SN`; overlapping specs with different totals or approved specs missing from the PO show an orange panel (live while editing; green line when clean). "משוך כמויות מההצעה" aligns quantities (unique-row matches). "תקן אנומליה אוטומטית" repairs in order: complete blank PN/SN on rows that unambiguously match an approved spec → align quantities → add missing-spec rows (price 0) → drop zero-qty rows absent from the quote; report cites row numbers; all local until שמור.
- **/import**: `POViewButton` ("צפה בהזמנת רכש") opens the read-only PO PDF modal — on approved-quotes rows with an order and on every order card (so Nurit sees exactly what was sent).
- **`components/procurement/ProjectPOCard.tsx`** — project-page rubric "הזמנות רכש" (rendered between PricingSection and ImportPanel): read-only list of the project's POs with stage chip (בהכנה ברכש / נשלחה לספק + import status), links to /procurement//import. Renders nothing when RLS hides import_orders from the viewer.

### Projects Archive & Closure Documents (2026-07-19)
- `projects.realization_status` now also allows the terminal values `הסתיים`/`בוטל` (migration `20260719_002` relaxed the CHECK from `004` — until then Postgres silently rejected them and the UI optimistically lied; the list + project pages now surface save errors and re-fetch on failure).
- **Projects list** (`/projects/list`): the main table shows only active statuses; an **archive table** below it (collapsible) holds הסתיים/בוטל projects with its own status chips, its own sortable headers, the shared search box, and a total-value footer. The status pill is editable in the archive too — switching back to an active status restores the project to the main table. The header count + total cover active projects only.
- **Closure documents**: project-page card "מסמכי סיום פרויקט" uploads a completion report / warranty certificate as `attachments` rows with `file_type='completion_report'` / `'warranty_cert'` (`entity_type='project'`, storage path `{id}/closure/`). Uploading stamps `projects.last_updated_at` (the date shown in the archive's עדכון column) and offers to mark the project הסתיים. Marking הסתיים/בוטל manually also stamps it (list inline edit + project saveInfo already did).
- These closure `file_type`s are **excluded** from every drawings/specs surface: the quote-card linking checkboxes (`usePricing` queries filter `.in('file_type', ['drawing','spec'])`), the `/drawings` search page, and the project drawings card.
- Archived projects are excluded from the dashboard KPIs/active list and the management report revenue calculations (`app/page.tsx`); Roxy's dashboard snapshot already excluded them.

### Contract Terms Library
- Master templates live in `contract_term_templates` (jsonb `content` of `{title, clauses: [{num, text}]}[]`). Editor at `/settings/contract-templates` lets admins create, rename, duplicate, mark a default, delete, and edit sections/clauses of templates.
- `quotes.contract_template_id` picks a template; `quotes.contract_overrides` (jsonb) holds per-quote edits (also used as the snapshot once issued).
- Each draft quote shows a "📜 תנאי הסכם" picker + ✏️ "ערוך להצעה זו" modal + 🔄 "שחזר מהתבנית" button. `duplicateQuote` carries over `contract_template_id` + `contract_overrides`.
- On send/signed, if no overrides exist, the resolved sections are copied into `contract_overrides` so future edits don't change an issued quote. **Fixed (2026-06-14, #7)**: this now snapshots even when `contract_template_id=NULL` — the `lib/contract-terms.ts:CONTRACT_SECTIONS` fallback is frozen into `contract_overrides` on issue, so a later code edit can't mutate already-signed terms.
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
- Quote date in the printed header/footer: drafts → today (fresh each render, since prices are pegged to today's FX); sent/signed → `quote.sent_at` (frozen on issue, falls back to `updated_at` for legacy quotes). **Fixed (2026-06-14, #6)**: `sent_at` is stamped once in `updateQuoteStatus`, so the printed date no longer drifts when back-office fields change.

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
DATALASTIC_API_KEY=<optional — live vessel tracking on /import; without it the tracker shows external map links only>
```
(`GROQ_API_KEY` is no longer used — Roxy runs entirely on Gemini.)

## 7. Known Issues / TODO

### 📍 Status — 2026-07-05

Production (`main` → https://fibertech-os.vercel.app) is live with full auth + branding + import module. Sessions **2026-07-03 → 05** shipped 8 features across the `SYSTEM_REVIEW_2026-07-02.md` phases — **no migrations / RLS / schema changes in any of them**. Recap of what merged and what's still open:

**✅ Done & live (2026-07-03 → 05)**
- **Full rebrand / Design System** — `tailwind.config.ts` token layer + primitives (`Button`/`Input`/`Card`/`Modal`/`Badge`/`Toast`/`StatusPill`/`Field`), core pages migrated.
- **שלב ב' (control) — COMPLETE (4/4):**
  - **תפ"י release screen** — `✔️ שחרר` on an auto-seeded import draft writes `reviewed_at`/`reviewed_by` and moves `draft→planned` (`app/import/page.tsx`).
  - **Scheduled alert engine** — Vercel Cron (`vercel.json`, daily `0 4 * * *` UTC = 07:00 IL) → `/api/cron/alerts`, service-role, writes to the existing `alerts` table. Rules: stale sent quote (>7d), `valid_until` ≤3d/past, shipment ETA ≤7d/past, import draft waiting >2d. Dedup via `type='cron:<rule>:<entityId>'` (no schema change). **Guarded by `CRON_SECRET`** (Vercel env — set 2026-07-05; route returns 401 without it).
  - **Derived import status** — `lib/import-status.ts`: packing coverage ≥100% → `received`, >0% → `partially_received` (app-side, on SmartUpload write; manual/terminal status preserved). Coverage chip `📦 התקבל X%` on the order card.
  - **Quote aging + viewed indicator** — `OpenQuotesWidget`: aging pill (days since `sent_at`, colour-escalating) + `👁️` from `quote_views`.
- **שלב ג' (connectivity) — STARTED:**
  - **Production↔import cross-status chips** (`🏭 ייצור:` on the import card; the two share `quote_id`).
  - **Conditional import routing on sign** — `/api/import/from-quote` now seeds a draft **only** for an external supplier in a **foreign** currency (`effectiveCurrency() !== 'ILS'` AND `source_type != 'internal'`); internal / ILS / no-cost-input returns `{created:false, reason}` instead of silence. `effectiveCurrency()` centralised in `lib/pricing.ts` (fixes review #11 duplication — 5 inline copies replaced). The production order is still always created on sign.
  - **Full hand-off to production** — `GET /api/production/order-context` (admin client, pre-signed URLs) surfaces drawings/specs/details/pipe-specs/contacts to production users who lack `projects` permission; collapsible section on the `/production` OrderCard.

**🎯 Next up / open**
- **🎨 Emoji → Phosphor Icons (duotone) — ✅ DONE 2026-07-05** (branch `claude/phosphor-icons-duotone-o5arh2`): `components/ui/Icon.tsx` (~100 logical names, duotone, currentColor), ~230 emoji replaced across 44 files; nav active-state per spec. Left as content (not icons): text-string emoji (alerts/chat/reports), PDF-page emoji, 🔴 status dots. Original spec: Replace every emoji used as a *functional* icon (nav, action buttons, headings, statuses, toasts) with a single `components/ui/Icon.tsx` (`@phosphor-icons/react`, weight `duotone`, `currentColor`) so weight/style is swappable from one place. Sits on top of the new primitives. RTL: `margin-inline`/`border-inline-start` (never left/right). Colours: idle `#15427E`; active nav `#135C95` on bg `#DCEBF6` + `border-inline-start: 3px solid #15427E`. Sizes: 22px nav · 20px buttons/tables. Don't touch logic/routing/text/layout — icon layer only. End with a list of replacements + any ambiguous emoji for approval.
- **שלב ג' remaining:** field forms → DB (`field_reports` table + Storage; today submit = `console.log`, review #5). ~~deal timeline~~ ✅ done 2026-07-06 (`DealTimeline` on the project page). ~~UI for `import_customer_deliveries`~~ ✅ done 2026-07-06 — **delivery-certificates flow**: create from container packing lines (deliveries tab on the import order card), 3 signing paths (scan upload / SignaturePad on-site / public `/delivery/[token]` customer link via service-role `/api/delivery-sign`), send-to-accounting task (default מירי) + `/deliveries` screen + dashboard "ממתין לחשבונית" widget + cron rule 5. Migrations `20260706_001` (delivery columns; RLS untouched) + `20260706_002` (`quotes.lost_reason`).
- **Finality layer (2026-07-06):** quote reject dialog captures `lost_reason`; cron rule 0 stamps `expired` on sent quotes past `valid_until`; project terminal statuses (`הסתיים`/`בוטל` in `realization_status` options); production completed orders collapsed.
- **Procurement→inventory→collection chain — ✅ DONE 2026-07-08** (Nitzan's flow, "system drafts / Nitzan confirms"). Migration `20260708_001` (applied): `doc_counters` + `next_doc_number(kind)` SECURITY DEFINER (מ"ס `YYYY-NNN`, others `KIND-YYYY-NNN`; `orders.ms_number` backfilled), `import_orders.procurement_type/customer_order_id`, `purchase_receipts`+`purchase_receipt_lines`, `inventory_movements` ledger + `inventory_balance` view (security_invoker), `import_invoices.booked*`, `import_customer_deliveries.payment_due_date/paid*`. Code: מ"ס auto-assigned on quote sign (`usePricing`); one-click PO from a signed quote's cost input (`createPO` in `app/import/page.tsx`); receipts tab (`ReceiptsPanel` — draft from packing lines, confirm = numbered receipt + stock-IN movements + Miri booking task + discrepancy task); delivery certificate creation writes stock-OUT movements; invoice issue derives `payment_due_date` from quote payment terms (`lib/inventory.ts:paymentDueDate` — "שוטף+N"/"net N"); "התשלום התקבל" marking + "בגבייה" filter on `/deliveries`; `/inventory` page (balance + ledger + manual correction movement) + nav (inventory module); `InventoryWidget` + Roxy `search_inventory` read `inventory_balance`; cron rule 8 (payment overdue). Item identity = `itemKey()` spec `category|DN|PN|SN|L` — no manual catalog. **Open:** Zamir's site-unloading form (user will send the paper form to digitize).
- **שלב ד' (depth):** server-side signing + audit trail (one atomic `/api/quotes/sign`); split the 1,561-line project page into tabs; unify quote-status sources (3 lists diverge); migrate Iskoor off the non-existent `shipments`/`containers` to `import_*`.
- **Import module (`IMPORT_MODULE.md` §7):** suggestion engine learning from Nitzan's edits (base — `reviewed_by` — now collected); shipment-consolidation alert; `.msg` attachment extraction; inventory link.
- **Cosmetic:** close the now-empty `signed-quote-routing` PR on GitHub (its code is already in `main`).

(Full flow map + backlog: `SYSTEM_REVIEW_2026-07-02.md`. Session detail: `SESSION_HANDOFF_2026-07-05.md`.)

### Issues from Code Review (Fri 2026-06-12, branch `claude/read-claude-md-TBUdH`)

Verified findings from a high-effort multi-angle review of the branch. Ranked by severity — fix top-to-bottom.

> **✅ ALL 16 RESOLVED — Sun 2026-06-14, branch `claude/fervent-mayer-dn0diw`.** Each finding below was fixed and pushed:
> - #1 `801aed5` (detectCol normalizes keywords symmetrically) · #2 `68d76ec` (re-fetch cost items with real ids) · #3 `d55d18f` (diff client contacts instead of delete+insert) · #4 `ee5bcaf` (`removeStorageIfOrphan` — don't delete shared blobs) · #5 `bcc1982` (`replace_quote_items` RPC, atomic).
> - #6/#7/#9 `9aaf27d` (freeze `sent_at` + snapshot terms even w/o template + snapshot only the linked contact) · #10 `9aaf27d` (preserve manual ILS overrides on rate refresh) · #13 `9aaf27d`+migrations (propagate `length_m`).
> - #16 `7a9492d` (surface attachment upload failure) · #6/#8/#11 `279e390` (sent_at on both views, full contract terms on public page, effective-currency peg note) · #15 `e88b748` (date-only expiry compare) · #12 `a3f18ab` (drop-zone Files guard) · #14 `b52345d` (GRANT quote_drawings).
> - New migrations: `20260614_001` (quote_items pn/sn), `_002`+`_006` (replace_quote_items RPC), `_003` (quotes.sent_at), `_004` (quote_items.length_m), `_005` (quote_drawings GRANT). No RLS policies were changed.
> - **Deferred polish (not bugs):** the `useFileDrop` hook extraction (#12) and the full effective-currency dedup / dropping `cost_inputs.currency` (#11) were left as backlog — only the concrete bugs were fixed.

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
- Some team members still missing email addresses and auth accounts (a few of 9 — Nurit onboarded 2026-07-02).

> **Resolved 2026-07-02 (PR #9):** production `main` is no longer broken — it now runs full auth + the import module + all features (previously used the old pre-auth Supabase client and 403'd). The rebrand (§5 Design System) also merged to `main` on 2026-07-03.

### Important
- **System-wide process review (2026-07-02):** see `SYSTEM_REVIEW_2026-07-02.md` — full flow map + prioritized backlog (automation / control / connectivity / visibility). Phase A done 2026-07-02; **Phase B (control) done 2026-07-05; Phase C (connectivity) started** — see the "📍 Status — 2026-07-05" block above for detail; phases C-remaining / D open.
- `/import` module is built (see `IMPORT_MODULE.md`). A signed quote **conditionally** auto-seeds a draft import order (`/api/import/from-quote` — only for an external supplier in a foreign currency; internal/ILS pricing seeds nothing) + writes an in-app signature alert. Live vessel tracking on shipment cards via `/api/import/vessel-track` (needs `DATALASTIC_API_KEY`; degrades to VesselFinder/MarineTraffic links without it).
- `/marketing`, `/field`, `/inventory`, `/reports` — modules not built; their dead nav links were removed 2026-07-02 (re-add per module when built). `/settings` nav now points at `/settings/users`. `/forms` got an index page, and forms + Iskoor logistics were added to the nav — but form submissions still don't persist (submit = console.log, see review #5).
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
- ~~Linked drawings/specs on public `/quote/[token]`~~ ✅ done 2026-07-19 (migration `20260719_001` — see Drawings & Specs Module).
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
- **Code review דוח (יוני 2026)**: כל 16 הממצאים בסעיף 7 **תוקנו ונדחפו** ב-14.6.2026 (ענף `claude/fervent-mayer-dn0diw`) — ראו הבאנר בראש "Issues from Code Review" עם מיפוי commit לכל אחד. נשאר רק polish ל-backlog (חילוץ `useFileDrop`, נרמול `cost_inputs.currency`).
- **FileList async snapshot (קריטי — באג רקסי 15.6.2026)**: `<input onChange>` של העלאת קובץ קורא ל-handler אסינכרוני ואז מריץ `e.target.value = ''`. הניקוי **מרוקן את ה-FileList החי** שהועבר ל-handler — וכש-handler אסינכרוני מגיע ללולאות שלו, `fileList.length === 0`. חובה לצלם מיד בתחילת הפונקציה: `const srcFiles = Array.from(fileList)` (לפני כל `await`) ולעבוד על המערך. זה היה השורש של "רקסי ממציאה פריטים"/"לא ניתן לגשת לקובץ" — הקובץ בכלל לא הגיע לפענוח. ראו `hooks/usePricing.ts:parseCostFile` ו-`docs/roxy-extraction-investigation.md`.
- **Excel תמחור מפוענח בדפדפן (15.6.2026)**: קבצי אקסל של תמחור (.xlsx/.xls) מפוענחים **client-side** ב-`parseCostFile` דרך `lib/boq-parser.ts` (מודול משותף client+server) — לא נשלחים ל-`/api/ai`. הסיבה: קבצים כבדים (תמונות EMF מוטמעות → ~1MB base64) לא הגיעו נכון לשרת, ו-Gemini הזה. רק PDF/תמונות הולכים ל-Gemini. הזיהוי הוא לפי **תוכן הבייטים** (XLSX מזהה ZIP/OLE), לא לפי שם/MIME בלבד (Safari מדווח type ריק). הפרסר מזהה כותרות עבריות (קוטר/קשיחות/לחץ/מחיר מטר), מדלג שורות זבל, ולא מסיק מטבע כש-EUR+USD מופיעים יחד (טבלת שערים).
