-- Freeze a quote's contact once it goes out, and keep project/customer
-- contacts in sync both ways via a stable client_contact_id link.

-- Part A: frozen contact details for an issued quote.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS contact_snapshot jsonb;

-- Part B: stable link between a project contact and the customer contact it represents.
ALTER TABLE project_contacts ADD COLUMN IF NOT EXISTS client_contact_id uuid REFERENCES client_contacts(id) ON DELETE SET NULL;

-- Forward sync (project_contacts -> client_contacts), link-aware.
CREATE OR REPLACE FUNCTION public.sync_project_contact_to_customer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company text := nullif(trim(NEW.company), '');
  v_name    text := nullif(trim(NEW.name), '');
  v_client_id uuid;
  v_cc_id uuid := NEW.client_contact_id;
BEGIN
  IF v_cc_id IS NOT NULL THEN
    UPDATE client_contacts
       SET name = COALESCE(v_name, name), role = NEW.role, phone = NEW.phone, email = NEW.email
     WHERE id = v_cc_id
       AND (phone IS DISTINCT FROM NEW.phone OR email IS DISTINCT FROM NEW.email
            OR role IS DISTINCT FROM NEW.role OR name IS DISTINCT FROM COALESCE(v_name, name));
    RETURN NEW;
  END IF;

  IF v_company IS NULL OR v_name IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_client_id FROM clients WHERE name = v_company LIMIT 1;
  IF v_client_id IS NULL THEN
    INSERT INTO clients (name, type) VALUES (v_company, 'לקוח') RETURNING id INTO v_client_id;
  END IF;

  SELECT id INTO v_cc_id FROM client_contacts WHERE client_id = v_client_id AND trim(name) = v_name LIMIT 1;
  IF v_cc_id IS NULL THEN
    INSERT INTO client_contacts (client_id, name, role, phone, email)
      VALUES (v_client_id, v_name, NEW.role, NEW.phone, NEW.email) RETURNING id INTO v_cc_id;
  ELSE
    UPDATE client_contacts SET role = NEW.role, phone = NEW.phone, email = NEW.email WHERE id = v_cc_id;
  END IF;

  UPDATE project_contacts SET client_contact_id = v_cc_id WHERE id = NEW.id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_project_contact_to_customer ON public.project_contacts;
CREATE TRIGGER trg_sync_project_contact_to_customer
AFTER INSERT OR UPDATE ON public.project_contacts
FOR EACH ROW WHEN (pg_trigger_depth() = 0)
EXECUTE FUNCTION public.sync_project_contact_to_customer();

-- Reverse sync (client_contacts -> linked project_contacts).
CREATE OR REPLACE FUNCTION public.sync_customer_contact_to_projects()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE project_contacts
     SET name = NEW.name, role = COALESCE(NEW.role, role), phone = NEW.phone, email = NEW.email
   WHERE client_contact_id = NEW.id
     AND (phone IS DISTINCT FROM NEW.phone OR email IS DISTINCT FROM NEW.email
          OR name IS DISTINCT FROM NEW.name OR role IS DISTINCT FROM COALESCE(NEW.role, role));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_customer_contact_to_projects ON public.client_contacts;
CREATE TRIGGER trg_sync_customer_contact_to_projects
AFTER INSERT OR UPDATE ON public.client_contacts
FOR EACH ROW WHEN (pg_trigger_depth() = 0)
EXECUTE FUNCTION public.sync_customer_contact_to_projects();

-- Backfill links for existing project contacts (by current name within the customer).
UPDATE project_contacts pc
   SET client_contact_id = cc.id
  FROM projects p
  JOIN client_contacts cc ON cc.client_id = p.customer_id
 WHERE pc.project_id = p.id
   AND pc.client_contact_id IS NULL
   AND nullif(trim(pc.name), '') IS NOT NULL
   AND trim(pc.name) = trim(cc.name);

UPDATE project_contacts pc
   SET client_contact_id = cc.id
  FROM clients c
  JOIN client_contacts cc ON cc.client_id = c.id
 WHERE pc.client_contact_id IS NULL
   AND nullif(trim(pc.company), '') IS NOT NULL
   AND c.name = trim(pc.company)
   AND nullif(trim(pc.name), '') IS NOT NULL
   AND trim(pc.name) = trim(cc.name);

-- One-time backfill: add the leading 0 to 9-digit Israeli numbers stored without it.
UPDATE project_contacts SET phone = '0' || phone WHERE phone ~ '^[1-9][0-9]{8}$';
