-- 010: Quote tiers — planner_estimate / contractor_pre_tender / contractor_final

CREATE TYPE IF NOT EXISTS quote_tier AS ENUM (
  'planner_estimate',
  'contractor_pre_tender',
  'contractor_final'
);

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS tier quote_tier DEFAULT 'contractor_pre_tender';

COMMENT ON COLUMN quotes.tier IS 'planner_estimate=הערכת מתכנן, contractor_pre_tender=טרום מכרז, contractor_final=הצעה סופית';
