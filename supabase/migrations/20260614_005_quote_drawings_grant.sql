-- 20260614_005: explicit GRANT on quote_drawings (project convention).
-- 20260524_006 created quote_drawings with RLS but no GRANT. Supabase is removing
-- auto-exposure of new public tables to the Data API (enforced on existing-project
-- new tables from 2026-10-30), which would break the quote-card link checkboxes.
-- RLS still governs row access; this just keeps the table reachable via the API.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_drawings TO authenticated;
