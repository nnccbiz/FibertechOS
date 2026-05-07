-- 020: Order documents table for tracking status-related uploads
CREATE TABLE IF NOT EXISTS order_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL, -- signed_order | signed_drawing | delivery_certificate
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_documents_order ON order_documents(order_id);

-- RLS
ALTER TABLE order_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_order_docs" ON order_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_order_docs" ON order_documents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_delete_order_docs" ON order_documents FOR DELETE TO authenticated USING (true);
