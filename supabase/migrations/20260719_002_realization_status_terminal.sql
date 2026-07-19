-- Allow terminal statuses on projects (archive support).
-- The original CHECK from 004_projects_list_fields.sql only allowed the 4 active
-- statuses, so marking a project הסתיים/בוטל was silently rejected by Postgres.
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_realization_status_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_realization_status_check
  CHECK (realization_status IN ('הזמנה', 'גבוהה', 'בינוני', 'נמוך', 'הסתיים', 'בוטל'));
