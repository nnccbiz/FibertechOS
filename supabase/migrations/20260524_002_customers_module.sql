-- Customers module: reuse `clients` as the customer master.
-- Adds a per-customer contact list, links quotes/projects to a customer,
-- and opens clients access to the marketing module (in addition to settings).

CREATE TABLE IF NOT EXISTS client_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  role TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_contacts_select ON public.client_contacts FOR SELECT TO authenticated
  USING (public.has_module_permission('marketing','view') OR public.has_module_permission('projects','view'));
CREATE POLICY client_contacts_write ON public.client_contacts FOR ALL TO authenticated
  USING (public.has_module_permission('marketing','edit'))
  WITH CHECK (public.has_module_permission('marketing','edit'));

ALTER TABLE quotes   ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES clients(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS clients_select ON public.clients;
CREATE POLICY clients_select ON public.clients FOR SELECT TO authenticated
  USING (public.has_module_permission('projects','view') OR public.has_module_permission('marketing','view'));

DROP POLICY IF EXISTS clients_write ON public.clients;
CREATE POLICY clients_write ON public.clients FOR ALL TO authenticated
  USING (public.has_module_permission('settings','edit') OR public.has_module_permission('marketing','edit'))
  WITH CHECK (public.has_module_permission('settings','edit') OR public.has_module_permission('marketing','edit'));
