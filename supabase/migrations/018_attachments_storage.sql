-- 018: Create attachments table and storage bucket for drawings/specs
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT DEFAULT 'drawing',
  file_size_bytes BIGINT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_attachments_project ON attachments(project_id);

-- Storage bucket for project files
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('project-files', 'project-files', false, 52428800)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for storage
CREATE POLICY "auth_upload_project_files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'project-files');

CREATE POLICY "auth_read_project_files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'project-files');

CREATE POLICY "auth_delete_project_files" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'project-files');

-- RLS for attachments table
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_attachments" ON attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_attachments" ON attachments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_delete_attachments" ON attachments FOR DELETE TO authenticated USING (true);
