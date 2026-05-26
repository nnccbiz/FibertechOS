-- Guarantee that any project contact with a company always appears in the
-- customers list (clients) with the contact under it. A SECURITY DEFINER
-- trigger does this server-side regardless of client code / RLS / timing.
CREATE OR REPLACE FUNCTION public.sync_project_contact_to_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company text := nullif(trim(NEW.company), '');
  v_name    text := nullif(trim(NEW.name), '');
  v_client_id uuid;
BEGIN
  IF v_company IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_client_id FROM clients WHERE name = v_company LIMIT 1;
  IF v_client_id IS NULL THEN
    INSERT INTO clients (name, type) VALUES (v_company, 'לקוח') RETURNING id INTO v_client_id;
  END IF;

  IF v_name IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM client_contacts WHERE client_id = v_client_id AND name = v_name) THEN
      UPDATE client_contacts SET role = NEW.role, phone = NEW.phone, email = NEW.email
        WHERE client_id = v_client_id AND name = v_name;
    ELSE
      INSERT INTO client_contacts (client_id, name, role, phone, email)
        VALUES (v_client_id, v_name, NEW.role, NEW.phone, NEW.email);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_project_contact_to_customer ON public.project_contacts;
CREATE TRIGGER trg_sync_project_contact_to_customer
AFTER INSERT OR UPDATE ON public.project_contacts
FOR EACH ROW EXECUTE FUNCTION public.sync_project_contact_to_customer();

-- Backfill existing project contacts that have a company.
INSERT INTO clients (name, type)
SELECT DISTINCT trim(pc.company), 'לקוח'
FROM project_contacts pc
WHERE nullif(trim(pc.company), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.name = trim(pc.company));

INSERT INTO client_contacts (client_id, name, role, phone, email)
SELECT c.id, trim(pc.name), pc.role, pc.phone, pc.email
FROM project_contacts pc
JOIN clients c ON c.name = trim(pc.company)
WHERE nullif(trim(pc.company), '') IS NOT NULL
  AND nullif(trim(pc.name), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM client_contacts cc WHERE cc.client_id = c.id AND cc.name = trim(pc.name));
