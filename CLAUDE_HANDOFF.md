# FibertechOS - Session Handoff for Claude Code

**Last session:** 2026-04-19 → 2026-04-20
**Last commit on `dev`:** `a8fb165`
**Status:** RLS hardening + auth layer deployed to dev. Production (main branch) is currently broken (runs old code that relies on permissive RLS).

---

## 1) Context (read this first)

**FibertechOS** is an internal management system for פיברטק תשתיות, an Israeli distributor of GRP piping for water/sewage/drainage infrastructure. The company imports pipes from Amiblu (via Mohammed) and Subor, then sells and supports installation across public-sector projects.

**Stack:**
- Frontend: Next.js 15.5 (App Router), React 18, Tailwind CSS, TypeScript strict
- Database/Auth: Supabase (project `qiccyigkqunxhvqzncol`, region `eu-west-3`, Postgres 17.6)
- Hosting: Vercel (project `prj_l18dJ53qySwc7RcPHA9Ux9dIMtiX`, team `nnccbiz-4044's projects`)
- Repo: GitHub `nnccbiz/FibertechOS` (public) with `main` (prod) and `dev` (staging) branches
- RTL Hebrew throughout

**Team roles (9 people):**

| User | DB role | Auth account | Password-set |
|---|---|---|---|
| נתנאל (owner + marketing) | admin | ✅ created | ✅ (temp) |
| אשר (owner) | admin | ❌ missing email | — |
| הלל (engineering + field) | member | ❌ no email yet | — |
| יגאל (finance) | member | ❌ no email yet | — |
| נורית (import) | member | ❌ no email yet | — |
| ניצן (office + תפ"י) | member | ❌ no email yet | — |
| מירי (office) | member | ✅ on file (miri@fibertech.co.il) | — |
| זמיר (field service) | member | ❌ no email yet | — |
| עאמר (factory) | viewer | ❌ no email yet | — |

---

## 2) What was done in the last session

### 2.1 Full DB backup
Location: `/Fibertech os/backups/2026-04-19_pre-rls-cleanup/`
Contents: `00_README.md`, `01_schema.sql`, `02_current_policies.sql`, `03_indexes_and_constraints.sql`, `04_git_snapshot.txt`, `manifest.json`, `data/*.json` (127 rows across 21 tables).
This is the rollback copy if anything blows up.

### 2.2 Four SQL migrations applied to Supabase
All in `supabase/migrations/`:

1. **`20260419_001_cleanup_open_rls.sql`** - dropped all 26 `USING (true)` policies, re-asserted RLS on all tables.
2. **`20260419_002_auth_and_permissions.sql`** - added:
   - Columns on `team_members`: `auth_user_id` (FK to `auth.users`), `active`, `password_changed_at`, `deactivated_at`, `deactivated_by`
   - Enums: `app_module` (8 values), `permission_level` (none/view/edit/full)
   - Tables: `user_module_permissions`, `access_requests`, `login_attempts`, `password_history`
   - Functions: `current_team_member_id()`, `is_admin()`, `has_module_permission(module, level)`, `current_user_permissions()`, `handle_new_auth_user()` (trigger)
   - Trigger: `on_auth_user_created` - auto-links `team_members.auth_user_id` when a new `auth.users` row is inserted with a matching email
   - Migrated the existing 5-tier `access_level` (admin/manager/standard/field/viewer) to 3-tier (admin/member/viewer)
   - Seeded the per-module permission matrix for all 9 team members
3. **`20260419_003_secure_rls_policies.sql`** - 42 new RLS policies mapping every table to a module × level check. Admins bypass via `is_admin()`.
4. **`20260419_004_rate_limit_functions.sql`** - `can_submit_access_request(email, ip)` (handles domain check + pending check + 30-day cooldown + 3/IP/hr + 20/hr global), `failed_logins_last_15min(ip)`, view `v_pending_access_requests`.

**Supabase advisor result:** 26 security findings → **0 findings** after migrations.

### 2.3 Next.js auth layer
Files added in `dev` branch:
- `middleware.ts` - Session gate. All routes require auth except `/login`, `/request-access`, `/auth/callback`, `/set-password`, `/forgot-password`, `/api/access-requests`.
- `lib/supabase/client.ts` + `server.ts` - Browser + SSR Supabase clients. `createAdminClient()` uses `SUPABASE_SERVICE_ROLE_KEY`.
- `lib/auth/permissions.ts` - Constants: `APP_MODULES`, `MODULE_LABELS_HE`, `MODULE_ICONS`, `PERMISSION_LEVELS`, `LEVEL_LABELS_HE`, `hasAtLeast()`, `validatePassword()` (12 chars + upper + lower + digit + special).
- `app/login/{page.tsx,LoginForm.tsx}` - Password login with Suspense boundary.
- `app/request-access/page.tsx` - Self-signup form, client-side `@fibertech.co.il` enforcement.
- `app/set-password/page.tsx` - Password setup after invite, enforces the 12-char policy.
- `app/auth/callback/route.ts` - Exchanges magic-link/invite code for a session.
- `app/api/access-requests/route.ts` - Public POST endpoint; calls `can_submit_access_request()` before insert.
- `app/api/approve-request/route.ts` - Admin-only; calls `supabase.auth.admin.inviteUserByEmail`, upserts permissions, marks request approved.
- `app/api/auth/log-attempt/route.ts` - Records login attempts for audit.
- `app/(admin)/settings/requests/page.tsx` + `components/admin/PendingRequestsList.tsx` - Admin approval queue with presets (admin/member/viewer) and per-module overrides. Two decline types: "suspicious" (no cooldown) vs "not_authorized" (30-day cooldown).
- `app/(admin)/settings/users/page.tsx` + `components/admin/UserPermissionsEditor.tsx` - Per-user matrix editor, activate/deactivate toggle.
- `.env.example` - Documents required env vars.
- `RLS_MIGRATION_GUIDE.md` - User-facing setup guide (Hebrew).

### 2.4 Admin account for Nathaniel
Inserted directly into `auth.users` via SQL with bcrypt-hashed temp password:
- Email: `nc@fibertech.co.il`
- Temp password: `FibertechTemp-2026!@Change` (must change on first login)
- Linked via trigger to `team_members.auth_user_id` = `b675c183-911d-4c26-b2c4-2386d6d41d03`

### 2.5 Vercel deployments
- Commit `757cb7f` failed (TS strict: implicit `any` on `setAll`)
- Commit `ec6804d` failed (`useSearchParams` needs Suspense)
- Commit `a8fb165` **succeeded** - current live build on `fibertech-os-git-dev-nnccbiz-4044s-projects.vercel.app`

---

## 3) What is still OPEN (prioritized)

### 3.1 🔴 Urgent (this week)

1. **Add Asher's auth account.** Same pattern as Nathaniel:
   ```sql
   INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
     email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
     is_super_admin, confirmation_token, email_change, email_change_token_new, recovery_token)
   VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
     'authenticated', 'authenticated', '<asher-email>@fibertech.co.il',
     crypt('<temp-password>', gen_salt('bf', 10)),
     now(), '{"provider":"email","providers":["email"]}',
     '{"full_name":"אשר","must_change_password":true}',
     now(), now(), false, '', '', '', '');
   ```
   Before running, also update `team_members.email` for אשר so the trigger links correctly.

2. **Set Vercel env vars.** In Vercel Dashboard → Settings → Environment Variables:
   - `SUPABASE_SERVICE_ROLE_KEY` (pull from Supabase Dashboard → Settings → API → `service_role`). REQUIRED by `/api/access-requests`, `/api/approve-request`, `/api/auth/log-attempt`.
   - `NEXT_PUBLIC_SITE_URL=https://fibertech-os-git-dev-nnccbiz-4044s-projects.vercel.app` (for invite-email redirects).
   Verify that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are already set (they should be).

3. **Configure Supabase Auth dashboard:**
   - Authentication → Providers → Email → enable "Confirm email".
   - Authentication → Providers → Email → set minimum password length to 12.
   - Authentication → URL Configuration → Redirect URLs: add
     `https://fibertech-os-git-dev-nnccbiz-4044s-projects.vercel.app/auth/callback`
     `https://fibertech-os-git-dev-nnccbiz-4044s-projects.vercel.app/set-password`

4. **Production (`main`) is broken.** The `main` branch still uses the old Supabase client without auth, so all queries from prod now fail with 403. Either:
   - Merge `dev → main` (requires verifying all pre-existing pages still work after RLS). OR
   - Tell all users to use the dev URL only until we decide prod strategy.

### 3.2 🟡 Important (next two weeks)

5. **Collect + add missing emails for the 7 team members** (Asher, הלל, יגאל, נורית, ניצן, זמיר, עאמר). Easiest path: add to `team_members.email` via SQL, then let them each go to `/request-access` so an admin approves them.

6. **Fix the `/field` and `/import` 404s.** Either add stub pages with "בקרוב" text, or hide them from `components/ui/Sidebar.tsx` based on `user_module_permissions` (i.e., hide any module that the current user has `level = 'none'` for).

7. **Dynamic sidebar visibility.** Right now `Sidebar.tsx` shows all 8 modules regardless of permissions. Read the current user's permissions via `supabase.rpc('current_user_permissions')` in a context provider, then gate each nav item.

8. **Enforce password rotation.** Middleware currently does not check `password_changed_at < now() - 90 days`. Add a check that redirects to `/change-password` when expired.

9. **Password history enforcement.** When user sets a new password, compare against last 3 hashes in `password_history` and reject duplicates. Currently unimplemented.

10. **Admin email notification for new access requests.** `/api/access-requests` currently inserts the row but does not send an email to admins. Wire up Resend (or Supabase Edge Function + SMTP) to notify on `INSERT INTO access_requests`.

### 3.3 🟢 Nice-to-have (next month)

11. **Cloudflare Turnstile** on the `/request-access` form. Add env vars `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`, validate token in the API route.

12. **2FA (TOTP) for admin accounts.** Supabase supports this natively; add enrollment in `/settings/security`.

13. **Build the still-missing business modules** per the original gap analysis:
    - `/field` module: `field_visits`, `checklist_templates`, `checklist_submissions`, signature + photo upload to Supabase Storage.
    - `/import` module: `purchase_orders` (to Amiblu), `shipments`, `containers`, `container_items`, `port_clearance_events`.
    - NCR / incident-tracking module: `incidents`, `incident_reports`, `corrective_actions`. (Highway 10 case shows this is essential.)
    - 3-tier quote model: add `quotes.tier` enum (`planner_estimate` / `contractor_pre_tender` / `contractor_final`) to track the three price points.
    - Project stage history: `project_stage_transitions` with timestamps + actor, so you can rebuild pipeline velocity.

14. **Normalize `clients`.** Currently `projects` has both FK (`client_developer_id`, etc.) AND plaintext (`developer_name`, `planning_office`, `winning_contractor`). Migrate to pure FK so reports by client work.

15. **Codify `database/` folder.** The `database/schema.sql`, `database/pricing_schema.sql`, `database/rls_policies.sql` files in the repo are stale (pre-migration). They should be regenerated from the current live DB or deleted.

---

## 4) Key architectural decisions to preserve

- **Role model is 3 tiers** (admin/member/viewer) at the coarse level, but the actual access is a **matrix** of (user × module × level) stored in `user_module_permissions`. Admins bypass the matrix entirely via `is_admin()`.
- **The `access_level` column on `team_members` is the coarse role**, checked by `is_admin()`. The matrix gives fine-grained overrides for non-admins.
- **Eight modules:** `dashboard`, `projects`, `marketing`, `import`, `field`, `inventory`, `reports`, `settings` - matches the sidebar exactly.
- **Four permission levels per module:** `none`, `view`, `edit`, `full`. The helper `has_module_permission(module, min_level)` checks hierarchically (full > edit > view > none).
- **Password policy:** 12 chars minimum + uppercase + lowercase + digit + special + rotation every 90 days + cannot reuse last 3 passwords (see `lib/auth/permissions.ts` for the client-side validator; application-level enforcement of rotation and history is still TODO).
- **Rate limiting on `/request-access`:**
  - Domain check: must end `@fibertech.co.il`
  - 1 pending request per email (DB unique index)
  - 30-day cooldown on `declined_not_authorized`
  - 3 req/hour per IP
  - 20 req/hour globally
- **Decline semantics:** "decline suspicious" (default - no email ban) vs "decline not authorized" (explicit 30-day ban). Prevents an attacker from locking out a real employee's email by submitting fake requests.

---

## 5) How to continue from here in Claude Code

When you open the repo:

```bash
cd /path/to/FibertechOS
git checkout dev
cat CLAUDE_HANDOFF.md    # this file
cat RLS_MIGRATION_GUIDE.md    # user-facing Hebrew version
```

Then to pick any open item, ask Claude something like:

> "Continue from CLAUDE_HANDOFF.md section 3.1 item 2 - add the Vercel env vars SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SITE_URL via the Vercel MCP."

or

> "Work on section 3.2 item 7 - make the sidebar dynamically hide modules the current user has no permission for. Read `components/ui/Sidebar.tsx`, add a permissions context, and gate each nav link."

Claude has MCP access to Supabase and Vercel - it can run migrations and check deployments directly.

---

## 6) Test credentials (change immediately after verifying)

- URL: https://fibertech-os-git-dev-nnccbiz-4044s-projects.vercel.app/login
- Email: `nc@fibertech.co.il`
- Temp password: `FibertechTemp-2026!@Change`

---

## 7) Important file map

| Purpose | Path |
|---|---|
| RLS migrations | `supabase/migrations/20260419_00{1,2,3,4}_*.sql` |
| Permission constants | `lib/auth/permissions.ts` |
| Supabase clients | `lib/supabase/{client,server}.ts` |
| Route guard | `middleware.ts` |
| Auth UI | `app/{login,request-access,set-password,auth/callback}/` |
| Public API | `app/api/access-requests/route.ts` |
| Admin API | `app/api/approve-request/route.ts` |
| Admin UI | `app/(admin)/settings/{requests,users}/page.tsx` |
| Admin UI components | `components/admin/{PendingRequestsList,UserPermissionsEditor}.tsx` |
| Existing sidebar (to refactor) | `components/ui/Sidebar.tsx` |
| DB backup (rollback copy) | `backups/2026-04-19_pre-rls-cleanup/` (outside the repo - in the workspace folder) |

---

## 8) Open questions for the user that haven't been answered yet

1. **Asher's email address** (needed to create his admin account).
2. **Do you use the production URL (main branch)?** If yes, need to decide when to merge dev→main.
3. **What should happen when a session expires?** Currently middleware redirects to `/login?from=<prev-url>` and on success returns. Is that sufficient, or do you want an idle-timeout warning?
4. **Email provider for admin notifications on new access requests** (Resend / SendGrid / Supabase built-in SMTP)?

---

*End of handoff. When in doubt, read this file again. Ask clarifying questions before making irreversible changes.*
