-- ============================================================
-- Migration 007: Add delivery months selection to project_details
-- Run this in Supabase SQL Editor
-- ============================================================

ALTER TABLE project_details
ADD COLUMN IF NOT EXISTS delivery_months_list TEXT;

-- Stores comma-separated month numbers, e.g. "1,3,6,9"
-- Representing: ינואר, מרץ, יוני, ספטמבר
