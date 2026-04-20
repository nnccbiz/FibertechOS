-- ============================================================================
-- Migration 002: Authentication linkage, permissions matrix, access requests
-- Date: 2026-04-19
-- Purpose: Set up all supporting tables and helper functions for RLS
-- ============================================================================

-- ============================================================================
-- 1) Link team_members to Supabase Auth users
-- ============================================================================

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid REFERENCES public.team_members(id);

-- ============================================================================
-- 2) Enums for modules and permission levels
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.app_module AS ENUM (
    'dashboard',   -- 🏠 בקרה
    'projects',    -- 📋 פרויקטים
    'marketing',   -- 📊 שיווק
    'import',      -- 🚢 יבוא
    'field',       -- 👷 שדה
    'inventory',   -- 📦 מלאי
    'reports',     -- 📈 דוחות
    'settings'     -- ⚙️ הגדרות
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.permission_level AS ENUM ('none', 'view', 'edit', 'full');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 3) User × Module permission matrix
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_module_permissions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  module     public.app_module NOT NULL,
  level      public.permission_level NOT NULL DEFAULT 'none',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.team_members(id),
  UNIQUE (user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_ump_user ON public.user_module_permissions(user_id);

ALTER TABLE public.user_module_permissions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4) Access requests (self-signup pending approval)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.access_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL,
  full_name      text NOT NULL,
  requested_role text NOT NULL,                 -- role string user typed, for reference
  phone          text,
  ip_address     inet,
  user_agent     text,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','declined_suspicious','declined_not_authorized','expired')),
  decision_notes text,
  decided_by     uuid REFERENCES public.team_members(id),
  decided_at     timestamptz,
  invite_sent_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Only one pending request per email at any time
CREATE UNIQUE INDEX IF NOT EXISTS unique_pending_email
  ON public.access_requests (email)
  WHERE status = 'pending';

-- Block re-requests within 30 days of decline (type "not_authorized")
-- Handled at application layer; index supports fast lookup:
CREATE INDEX IF NOT EXISTS idx_access_requests_email_status
  ON public.access_requests (email, status);

CREATE INDEX IF NOT EXISTS idx_access_requests_ip_created
  ON public.access_requests (ip_address, created_at DESC);

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5) Login attempts audit log
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.login_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text,
  success         boolean NOT NULL,
  ip_address      inet,
  user_agent      text,
  failure_reason  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON public.login_attempts(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip    ON public.login_attempts(ip_address, created_at DESC);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6) Password history (prevent reuse of last 3 passwords)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.password_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,  -- bcrypt hash from auth.users at time of change
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_history_user ON public.password_history(user_id, created_at DESC);

ALTER TABLE public.password_history ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 7) Helper functions (SECURITY DEFINER so they can see team_members.active)
-- ============================================================================

-- Returns the team_members.id of the currently logged-in user, or NULL
CREATE OR REPLACE FUNCTION public.current_team_member_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id FROM public.team_members
  WHERE auth_user_id = auth.uid() AND active = true
  LIMIT 1;
$$;

-- Returns true if the current user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE auth_user_id = auth.uid()
      AND active = true
      AND access_level = 'admin'
  );
$$;

-- Returns true if the current user has at least p_min_level access to p_module
-- Admins always return true.
CREATE OR REPLACE FUNCTION public.has_module_permission(
  p_module    public.app_module,
  p_min_level public.permission_level
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_module_permissions ump
      JOIN public.team_members tm ON tm.id = ump.user_id
      WHERE tm.auth_user_id = auth.uid()
        AND tm.active = true
        AND ump.module = p_module
        AND (
          (p_min_level = 'none' AND ump.level IN ('none','view','edit','full'))
          OR (p_min_level = 'view' AND ump.level IN ('view','edit','full'))
          OR (p_min_level = 'edit' AND ump.level IN ('edit','full'))
          OR (p_min_level = 'full' AND ump.level = 'full')
        )
    );
$$;

-- Convenience wrapper used by API layer
CREATE OR REPLACE FUNCTION public.current_user_permissions()
RETURNS TABLE (module public.app_module, level public.permission_level)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ump.module, ump.level
  FROM public.user_module_permissions ump
  JOIN public.team_members tm ON tm.id = ump.user_id
  WHERE tm.auth_user_id = auth.uid() AND tm.active = true;
$$;

GRANT EXECUTE ON FUNCTION public.current_team_member_id()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_module_permission(public.app_module, public.permission_level) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_permissions()       TO authenticated;

-- ============================================================================
-- 8) Trigger: when an admin approves an access_request and an auth.users record
--    is created for that email, link them into team_members.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Find an approved access_request matching this email; link team_member row
  UPDATE public.team_members tm
  SET auth_user_id = NEW.id
  WHERE tm.email = NEW.email
    AND tm.auth_user_id IS NULL;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================================
-- 9) Migrate existing access_level values to the new 3-tier model + matrix
--    Existing: admin/manager/standard/field/viewer
--    New:      admin / member / viewer (+ per-module matrix)
-- ============================================================================

-- Keep existing access_level column but collapse values:
UPDATE public.team_members
SET access_level = CASE
  WHEN access_level = 'admin'                                  THEN 'admin'
  WHEN access_level IN ('manager','standard','field')          THEN 'member'
  WHEN access_level = 'viewer'                                 THEN 'viewer'
  ELSE 'viewer'
END;

-- Tighten the check constraint
ALTER TABLE public.team_members
  DROP CONSTRAINT IF EXISTS team_members_access_level_check;
ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_access_level_check
  CHECK (access_level IN ('admin','member','viewer'));

-- Seed per-module permissions per the matrix approved by Nathaniel (2026-04-19)
-- Admins get 'full' on everything automatically via is_admin(), but we store
-- explicit rows so the matrix UI is not empty for them.
INSERT INTO public.user_module_permissions (user_id, module, level)
SELECT tm.id, m.module, m.level
FROM public.team_members tm
CROSS JOIN LATERAL (
  VALUES
    -- Defaults per role; admins overridden to 'full' below
    ('dashboard'::public.app_module,  CASE tm.name
        WHEN 'עאמר' THEN 'none'::public.permission_level
        ELSE              'view'::public.permission_level END),
    ('projects'::public.app_module,  CASE tm.name
        WHEN 'עאמר' THEN 'none'::public.permission_level
        WHEN 'הלל'  THEN 'edit'::public.permission_level
        WHEN 'ניצן' THEN 'edit'::public.permission_level
        ELSE              'view'::public.permission_level END),
    ('marketing'::public.app_module, CASE tm.name
        WHEN 'מירי'  THEN 'view'::public.permission_level
        WHEN 'ניצן' THEN 'view'::public.permission_level
        ELSE              'none'::public.permission_level END),
    ('import'::public.app_module,    CASE tm.name
        WHEN 'נורית' THEN 'full'::public.permission_level
        WHEN 'ניצן'  THEN 'edit'::public.permission_level
        WHEN 'יגאל'  THEN 'view'::public.permission_level
        WHEN 'הלל'   THEN 'view'::public.permission_level
        WHEN 'מירי'  THEN 'view'::public.permission_level
        ELSE               'none'::public.permission_level END),
    ('field'::public.app_module,     CASE tm.name
        WHEN 'הלל'  THEN 'full'::public.permission_level
        WHEN 'זמיר' THEN 'full'::public.permission_level
        WHEN 'ניצן' THEN 'view'::public.permission_level
        WHEN 'נורית' THEN 'view'::public.permission_level
        ELSE              'none'::public.permission_level END),
    ('inventory'::public.app_module, CASE tm.name
        WHEN 'נורית' THEN 'edit'::public.permission_level
        WHEN 'הלל'   THEN 'edit'::public.permission_level
        WHEN 'עאמר'  THEN 'view'::public.permission_level
        ELSE               'view'::public.permission_level END),
    ('reports'::public.app_module,   CASE tm.name
        WHEN 'יגאל'  THEN 'full'::public.permission_level
        WHEN 'עאמר'  THEN 'none'::public.permission_level
        WHEN 'זמיר'  THEN 'none'::public.permission_level
        ELSE               'view'::public.permission_level END),
    ('settings'::public.app_module,  'none'::public.permission_level)
) AS m(module, level)
WHERE tm.access_level = 'member'
ON CONFLICT (user_id, module) DO NOTHING;

-- Admins: give them 'full' on every module for matrix visibility
INSERT INTO public.user_module_permissions (user_id, module, level)
SELECT tm.id, m::public.app_module, 'full'::public.permission_level
FROM public.team_members tm
CROSS JOIN UNNEST(ARRAY['dashboard','projects','marketing','import','field','inventory','reports','settings']) AS m
WHERE tm.access_level = 'admin'
ON CONFLICT (user_id, module) DO UPDATE SET level = 'full';

-- Viewer role (עאמר): view inventory only, nothing else
INSERT INTO public.user_module_permissions (user_id, module, level)
SELECT tm.id, m::public.app_module,
  CASE WHEN m = 'inventory' THEN 'view'::public.permission_level
       ELSE 'none'::public.permission_level END
FROM public.team_members tm
CROSS JOIN UNNEST(ARRAY['dashboard','projects','marketing','import','field','inventory','reports','settings']) AS m
WHERE tm.access_level = 'viewer'
ON CONFLICT (user_id, module) DO NOTHING;
