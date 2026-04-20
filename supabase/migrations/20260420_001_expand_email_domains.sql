-- ============================================================================
-- Migration: expand allowed email domains for /request-access
-- Date: 2026-04-20
--
-- Context: Fibertech team members use emails from three organisational domains:
--   - @fibertech.co.il     (Fibertech)
--   - @maya-group.co.il    (Maya Group — owners + finance)
--   - @prizma-ind.co.il    (Prizma Industries — import team)
--
-- Change: expand the domain regex in can_submit_access_request() to accept
-- all three. Function body is otherwise identical to migration 004.
-- ============================================================================

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
  -- (0) Domain check: allow fibertech, maya-group, prizma-ind
  IF v_email_lower !~ '@(fibertech\.co\.il|maya-group\.co\.il|prizma-ind\.co\.il)$' THEN
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
