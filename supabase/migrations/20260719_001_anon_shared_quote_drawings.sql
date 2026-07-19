-- Public shared-quote page: let anon read the drawings/specs a quote links
-- via quote_drawings. Strictly scoped to quotes with a valid (non-expired)
-- share token. Cost-input attachments are never referenced by quote_drawings,
-- so they stay invisible to anon.

-- anon may read quote_drawings rows for a quote with a valid share token
CREATE POLICY anon_read_shared_quote_drawings ON public.quote_drawings
  FOR SELECT TO anon
  USING (
    quote_id IN (SELECT quote_id FROM quote_share_tokens WHERE expires_at > now())
  );

-- broaden anon attachments read: quote-level attachments (as before) OR
-- project drawings/specs linked to a valid shared quote via quote_drawings
DROP POLICY IF EXISTS anon_read_shared_attachments ON public.attachments;
CREATE POLICY anon_read_shared_attachments ON public.attachments
  FOR SELECT TO anon
  USING (
    (entity_type = 'quote' AND entity_id IN (
      SELECT quote_id FROM quote_share_tokens WHERE expires_at > now()))
    OR
    (id IN (
      SELECT qd.attachment_id FROM quote_drawings qd
      WHERE qd.quote_id IN (
        SELECT quote_id FROM quote_share_tokens WHERE expires_at > now())))
  );
