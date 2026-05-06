-- 014: Change unit_length_m from NUMERIC to TEXT for multi-select support
-- Stores comma-separated values like "5.7,11.7" or "5.7,11.7,4.5"
ALTER TABLE pipe_specs ALTER COLUMN unit_length_m TYPE TEXT USING unit_length_m::TEXT;
