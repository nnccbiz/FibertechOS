-- 20260707_001: the app_module enum never had 'production'!
-- The code (APP_MODULES) defines 9 modules incl. production, but the DB enum
-- had only 8 — so nobody could be granted production permissions in the
-- matrix, and only admins could see /production. Discovered 2026-07-06.
-- (Separate migration: an added enum value can't be used in the same
-- transaction that adds it.)
ALTER TYPE app_module ADD VALUE IF NOT EXISTS 'production';
