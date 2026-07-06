-- ============================================================
-- 20260705_002: Roxy conversation history
-- ============================================================
-- Full chat history per user. Privacy: owner-only — not even admins can read
-- another user's conversations (unlike ai_activity_log, which records the
-- actions themselves and IS admin-visible).

CREATE TABLE IF NOT EXISTS public.roxy_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.roxy_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.roxy_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL DEFAULT '',
  -- pending_action proposals / tool traces attached to an assistant message
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roxy_conversations_user
  ON public.roxy_conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_roxy_messages_conv
  ON public.roxy_messages (conversation_id, created_at);

ALTER TABLE public.roxy_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roxy_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY roxy_conversations_owner ON public.roxy_conversations
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY roxy_messages_owner ON public.roxy_messages
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.roxy_conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.roxy_conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()
  ));

-- Explicit grants (per project convention — new tables are not auto-exposed).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roxy_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roxy_messages TO authenticated;
