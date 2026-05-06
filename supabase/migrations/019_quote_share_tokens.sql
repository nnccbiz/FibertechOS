-- 019: Public quote sharing with expiration + view tracking

CREATE TABLE IF NOT EXISTS quote_share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '3 days',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_tokens_token ON quote_share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_share_tokens_quote ON quote_share_tokens(quote_id);

CREATE TABLE IF NOT EXISTS quote_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID NOT NULL REFERENCES quote_share_tokens(id) ON DELETE CASCADE,
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  country TEXT,
  city TEXT
);

CREATE INDEX IF NOT EXISTS idx_quote_views_quote ON quote_views(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_views_token ON quote_views(token_id);

-- RLS
ALTER TABLE quote_share_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_views ENABLE ROW LEVEL SECURITY;

-- Authenticated users can manage tokens
CREATE POLICY "auth_manage_share_tokens" ON quote_share_tokens FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_quote_views" ON quote_views FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anonymous users can read valid (non-expired) tokens
CREATE POLICY "anon_read_valid_tokens" ON quote_share_tokens FOR SELECT TO anon USING (expires_at > now());
-- Anonymous users can insert views
CREATE POLICY "anon_insert_views" ON quote_views FOR INSERT TO anon WITH CHECK (true);

-- Anonymous read access for quotes/items/projects/attachments that have a valid share token
CREATE POLICY "anon_read_shared_quotes" ON public.quotes FOR SELECT TO anon
USING (id IN (SELECT quote_id FROM quote_share_tokens WHERE expires_at > now()));

CREATE POLICY "anon_read_shared_quote_items" ON public.quote_items FOR SELECT TO anon
USING (quote_id IN (SELECT quote_id FROM quote_share_tokens WHERE expires_at > now()));

CREATE POLICY "anon_read_shared_projects" ON public.projects FOR SELECT TO anon
USING (id IN (SELECT project_id FROM quotes WHERE id IN (SELECT quote_id FROM quote_share_tokens WHERE expires_at > now())));

CREATE POLICY "anon_read_shared_attachments" ON public.attachments FOR SELECT TO anon
USING (entity_type = 'quote' AND entity_id IN (SELECT quote_id FROM quote_share_tokens WHERE expires_at > now()));

-- Anonymous can download from storage for shared quotes
CREATE POLICY "anon_read_shared_files" ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'project-files');
