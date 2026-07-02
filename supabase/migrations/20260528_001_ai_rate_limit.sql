-- ============================================================================
-- Migration: AI request rate limiting for /api/ai (Roxy)
-- Date: 2026-05-28
-- Purpose: Per-user + global rate limiting to protect the shared Gemini API
--          key / quota from abuse. Mirrors the DB-backed counting pattern used
--          by can_submit_access_request / failed_logins_last_15min.
-- Run this in the Supabase SQL Editor (same workflow as the other migrations).
-- ============================================================================

-- One row per /api/ai request. Used only for rate-limit counting.
CREATE TABLE IF NOT EXISTS public.ai_request_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid,                              -- the authenticated caller
  route      text DEFAULT 'ai',
  created_at timestamptz DEFAULT now()
);

-- Index to keep the time-window counts fast.
CREATE INDEX IF NOT EXISTS idx_ai_request_log_user_time
  ON public.ai_request_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_request_log_time
  ON public.ai_request_log (created_at DESC);

-- RLS: clients never touch this table directly — only the server (service_role)
-- inserts/reads via the function below. Enable RLS with no policies so the
-- anon/authenticated roles have no access; service_role bypasses RLS.
ALTER TABLE public.ai_request_log ENABLE ROW LEVEL SECURITY;

-- Returns an empty string when the request is allowed, otherwise a code:
--   'user_rate_limit_minute' | 'user_rate_limit_hour' | 'global_rate_limit_minute'
-- Limits: 15/min and 200/hour per user; 60/min globally.
CREATE OR REPLACE FUNCTION public.can_make_ai_request(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_last_minute  integer;
  v_user_last_hour    integer;
  v_global_last_minute integer;
BEGIN
  -- (1) Per-user: max 15 per minute
  SELECT count(*) FROM public.ai_request_log
  WHERE user_id = p_user_id
    AND created_at > now() - interval '1 minute'
  INTO v_user_last_minute;
  IF v_user_last_minute >= 15 THEN RETURN 'user_rate_limit_minute'; END IF;

  -- (2) Per-user: max 200 per hour
  SELECT count(*) FROM public.ai_request_log
  WHERE user_id = p_user_id
    AND created_at > now() - interval '1 hour'
  INTO v_user_last_hour;
  IF v_user_last_hour >= 200 THEN RETURN 'user_rate_limit_hour'; END IF;

  -- (3) Global: max 60 per minute across all users (protects the shared key)
  SELECT count(*) FROM public.ai_request_log
  WHERE created_at > now() - interval '1 minute'
  INTO v_global_last_minute;
  IF v_global_last_minute >= 60 THEN RETURN 'global_rate_limit_minute'; END IF;

  RETURN '';  -- allowed
END $$;

GRANT EXECUTE ON FUNCTION public.can_make_ai_request(uuid) TO service_role;

-- Optional housekeeping: drop rows older than 2 hours (the longest window is
-- 1 hour). Call manually or from a scheduled job; not required for correctness.
-- DELETE FROM public.ai_request_log WHERE created_at < now() - interval '2 hours';
