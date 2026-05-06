-- 013: Split diameter into three: nominal (DN), outer (OD), inner (ID)
ALTER TABLE pipe_specs RENAME COLUMN diameter_mm TO dn_mm;
ALTER TABLE pipe_specs ADD COLUMN IF NOT EXISTS od_mm INTEGER;
ALTER TABLE pipe_specs ADD COLUMN IF NOT EXISTS id_mm INTEGER;

COMMENT ON COLUMN pipe_specs.dn_mm IS 'קוטר נומינלי (DN) במ"מ';
COMMENT ON COLUMN pipe_specs.od_mm IS 'קוטר חיצוני (OD) במ"מ';
COMMENT ON COLUMN pipe_specs.id_mm IS 'קוטר פנימי (ID) במ"מ';
