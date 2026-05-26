-- Link project drawings (attachments) to specific quotes so they render in the quote PDF.
CREATE TABLE IF NOT EXISTS quote_drawings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (quote_id, attachment_id)
);

ALTER TABLE quote_drawings ENABLE ROW LEVEL SECURITY;

CREATE POLICY quote_drawings_select ON public.quote_drawings FOR SELECT TO authenticated
  USING (public.has_module_permission('projects','view'));
CREATE POLICY quote_drawings_write ON public.quote_drawings FOR ALL TO authenticated
  USING (public.has_module_permission('projects','edit'))
  WITH CHECK (public.has_module_permission('projects','edit'));
