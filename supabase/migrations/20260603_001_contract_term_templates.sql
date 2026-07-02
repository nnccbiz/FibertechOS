-- Contract term templates library + per-quote selection + override.
-- Phase 1: schema. Templates are managed under /settings/contract-templates.
-- Drafts use template content; sent/signed quotes snapshot the rendered terms.

CREATE TABLE IF NOT EXISTS contract_term_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_default boolean DEFAULT false,
  content jsonb NOT NULL,  -- [{title, clauses:[{num,text}]}]
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE contract_term_templates ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON contract_term_templates TO authenticated;

CREATE POLICY contract_templates_select ON contract_term_templates FOR SELECT TO authenticated
  USING (has_module_permission('projects'::app_module, 'view'::permission_level));
CREATE POLICY contract_templates_write ON contract_term_templates FOR ALL TO authenticated
  USING (has_module_permission('settings'::app_module, 'edit'::permission_level))
  WITH CHECK (has_module_permission('settings'::app_module, 'edit'::permission_level));

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS contract_template_id uuid REFERENCES contract_term_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contract_overrides jsonb;

-- The seed insert with the existing lib/contract-terms.ts content is in the
-- applied migration (large jsonb literal). Recreating it here would duplicate
-- the seed on re-apply, so keep this file as the schema reference only — the
-- seed is owned by the applied migration log.
