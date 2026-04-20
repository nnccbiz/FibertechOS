-- ============================================================================
-- Migration 004: Rate limiting helper function + access request helpers
-- Date: 2026-04-19
-- Purpose: Enforce the rate limits described to the user (IP + email)
-- ============================================================================

-- Called by the server API route before inserting a new access_request.
-- Returns a text code describing the outcome; empty string means "ok to insert".
CREATE OR REPLACE FUNCTION public.can_submit_access_request(
  p_email      text,
  p_ip_address inet
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email_lower           text := lower(p_email);
  v_pending_exists        boolean;
  v_recent_declined       boolean;
  v_ip_count_last_hour    integer;
  v_global_count_last_hour integer;
BEGIN
  -- (0) Basic domain check: must end with @fibertech.co.il
  IF v_email_lower !~ '@fibertech\.co\.il$' THEN
    RETURN 'invalid_domain';
  END IF;

  -- (1) Exactly one pending per email
  SELECT EXISTS (
    SELECT 1 FROM public.access_requests
    WHERE lower(email) = v_email_lower AND status = 'pending'
  ) INTO v_pending_exists;
  IF v_pending_exists THEN RETURN 'already_pending'; END IF;

  -- (2) 30-day cooldown after "declined_not_authorized"
  SELECT EXISTS (
    SELECT 1 FROM public.access_requests
    WHERE lower(email) = v_email_lower
      AND status = 'declined_not_authorized'
      AND decided_at > now() - interval '30 days'
  ) INTO v_recent_declined;
  IF v_recent_declined THEN RETURN 'cooldown_active'; END IF;

  -- (3) Max 3 requests per IP per hour
  SELECT count(*) FROM public.access_requests
  WHERE ip_address = p_ip_address
    AND created_at > now() - interval '1 hour'
  INTO v_ip_count_last_hour;
  IF v_ip_count_last_hour >= 3 THEN RETURN 'ip_rate_limit'; END IF;

  -- (4) Max 20 requests globally per hour
  SELECT count(*) FROM public.access_requests
  WHERE created_at > now() - interval '1 hour'
  INTO v_global_count_last_hour;
  IF v_global_count_last_hour >= 20 THEN RETURN 'global_rate_limit'; END IF;

  RETURN '';  -- all checks passed
END $$;

GRANT EXECUTE ON FUNCTION public.can_submit_access_request(text, inet) TO service_role;

-- Count failed login attempts from an IP in the last 15 minutes
-- (for lockout after 5 failures)
CREATE OR REPLACE FUNCTION public.failed_logins_last_15min(p_ip inet)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*)::int FROM public.login_attempts
  WHERE ip_address = p_ip
    AND success = false
    AND created_at > now() - interval '15 minutes';
$$;

GRANT EXECUTE ON FUNCTION public.failed_logins_last_15min(inet) TO service_role;

-- View for the admin "pending requests" page
CREATE OR REPLACE VIEW public.v_pending_access_requests AS
SELECT
  ar.id,
  ar.email,
  ar.full_name,
  ar.requested_role,
  ar.phone,
  ar.ip_address,
  ar.user_agent,
  ar.created_at,
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE lower(tm.email) = lower(ar.email)
  ) AS email_already_on_team
FROM public.access_requests ar
WHERE ar.status = 'pending'
ORDER BY ar.created_at DESC;

GRANT SELECT ON public.v_pending_access_requests TO authenticated;
