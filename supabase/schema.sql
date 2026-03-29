-- ============================================================
-- Fibertech OS — Supabase Schema
-- Generated from PRD spec (March 2026)
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "postgis";  -- for field GPS coordinates

-- ============================================================
-- 1. ENUMS
-- ============================================================

create type user_role as enum (
  'manager',        -- נתנאל (מנהל + שיווק)
  'owner',          -- אשר (בעלים)
  'engineering',    -- הלל (הנדסה + שדה)
  'field_service',  -- זמיר (שירות שדה)
  'office',         -- ניצן (משרד + תפ״י)
  'import',         -- נורית (יבוא)
  'finance',        -- יגאל (כספים)
  'factory'         -- עאמר (ייצור מפעל)
);

create type project_stage as enum (
  'stage_1_meeting',          -- א׳ פגישה עם יזם
  'stage_2_pre_tender',       -- ב׳ קדם מכרז
  'stage_3_quote',            -- ג׳ הצעת מחיר
  'stage_4_proforma',         -- ד׳ פרפורמה / הזמנה
  'stage_5_production',       -- ה׳ ייצור ואספקה
  'stage_6_logistics',        -- ו׳ לוגיסטיקה ומכולות
  'stage_7_field_work',       -- ז׳ עבודת שדה
  'stage_8_completion',       -- ח׳ דוח גמר
  'stage_9_warranty',         -- ט׳ אחריות
  'stage_10_marketing'        -- י׳ סיכום שיווקי
);

create type lead_status as enum (
  'introduction',   -- הכרות
  'documents',      -- מסמכים
  'tender',         -- מכרז
  'negotiation',    -- מו״מ
  'won',
  'lost'
);

create type quote_status as enum (
  'draft',
  'sent',
  'under_review',
  'signed',
  'rejected',
  'expired'
);

create type signature_status as enum (
  'pending',
  'signed',
  'rejected'
);

create type container_routing as enum (
  'direct_to_site',  -- ישירות לאתר
  'to_factory'       -- למפעל
);

create type incident_type as enum (
  'partial_report',       -- דיווח חלקי
  'investigation',        -- ברור
  'defect',               -- תקלה
  'repair_report',        -- דו״ח תיקון
  'interim_report',       -- דו״ח ביניים
  'summary_report'        -- דו״ח מסכם
);

create type alert_severity as enum ('info', 'warning', 'critical');

-- ============================================================
-- 2. USERS / PROFILES
-- ============================================================

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  role          user_role not null,
  phone         text,
  email         text,
  is_active     boolean default true,
  created_at    timestamptz default now()
);

-- ============================================================
-- 3. CONTACTS — Triangle: Developer × Planner × Contractor
-- ============================================================

create type contact_type as enum ('developer', 'planner', 'contractor', 'supplier', 'other');

create table contacts (
  id            uuid primary key default uuid_generate_v4(),
  contact_type  contact_type not null,
  company_name  text not null,
  contact_name  text,
  phone         text,
  email         text,
  address       text,
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ============================================================
-- 4. PROJECTS — The core "Project Card"
-- ============================================================

create table projects (
  id                  uuid primary key default uuid_generate_v4(),
  project_number      text unique not null,    -- מספר פרויקט
  project_name        text not null,           -- שם הפרויקט / אתר
  description         text,

  -- Triangle relationships
  developer_id        uuid references contacts(id),  -- יזם
  planner_id          uuid references contacts(id),  -- מתכנן
  contractor_id       uuid references contacts(id),  -- קבלן מבצע

  -- Stage tracking (10-stage pipeline)
  current_stage       project_stage default 'stage_1_meeting',
  stage_progress_pct  integer default 0 check (stage_progress_pct between 0 and 100),
  urgency_level       integer default 1 check (urgency_level between 1 and 5),

  -- Field assignment
  field_assignee_id   uuid references profiles(id),  -- אחראי שדה (e.g. Zamir)
  engineering_lead_id uuid references profiles(id),  -- אחראי הנדסה (e.g. Hillel)

  -- Financial
  order_value         numeric(12,2),           -- ערך הזמנה
  estimated_cost      numeric(12,2),
  overheads_pct       numeric(5,2) default 15, -- אחוז תקורות
  profit_pct          numeric(5,2) default 25, -- אחוז רווח
  gross_margin_price  numeric(12,2),           -- computed: (cost+overheads)/(1-profit%)

  -- Dates
  start_date          date,
  expected_end_date   date,
  actual_end_date     date,

  -- Location
  site_address        text,
  site_location       geography(point, 4326),

  -- Status
  is_active           boolean default true,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ============================================================
-- 5. ORDERS — One-to-Many from Projects
-- ============================================================

create table orders (
  id                uuid primary key default uuid_generate_v4(),
  project_id        uuid not null references projects(id) on delete cascade,
  order_number      text unique not null,
  supplier_id       uuid references contacts(id),  -- e.g. Amiblu

  -- Pricing (dual: estimate vs. real)
  estimate_price    numeric(12,2),         -- אומדן מנופח (40%)
  real_price        numeric(12,2),         -- מחיר ריאלי
  contractor_price  numeric(12,2),         -- מחיר קבלן

  -- Proforma comparison
  proforma_number   text,
  proforma_value    numeric(12,2),
  proforma_match    boolean,               -- auto-check: quote vs proforma

  -- Signatures traffic light (רמזור חתימות)
  advance_signed    signature_status default 'pending',   -- מקדמה
  spec_signed       signature_status default 'pending',   -- מפרט
  proforma_signed   signature_status default 'pending',   -- פרפורמה

  currency          text default 'EUR',
  notes             text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ============================================================
-- 6. QUOTES — הצעות מחיר
-- ============================================================

create table quotes (
  id                uuid primary key default uuid_generate_v4(),
  project_id        uuid not null references projects(id) on delete cascade,
  order_id          uuid references orders(id),
  quote_number      text unique not null,
  status            quote_status default 'draft',

  -- Pricing engine fields
  base_cost         numeric(12,2),
  overheads_pct     numeric(5,2) default 15,
  profit_pct        numeric(5,2) default 25,
  calculated_price  numeric(12,2),          -- (base_cost*(1+overheads_pct/100)) / (1-profit_pct/100)

  total_amount      numeric(12,2),
  currency          text default 'ILS',

  valid_until       date,
  signed_at         timestamptz,            -- triggers finance email when set
  signed_by         text,

  pdf_url           text,
  notes             text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ============================================================
-- 7. QUOTE LINE ITEMS — פריטי הצעת מחיר
-- ============================================================

create table quote_items (
  id              uuid primary key default uuid_generate_v4(),
  quote_id        uuid not null references quotes(id) on delete cascade,
  product_name    text not null,
  dn_size         text,                    -- e.g. DN900, DN1280
  pipe_type       text,                    -- standard / w_nozzles / first_pipes
  quantity        numeric(10,2),
  unit            text default 'meter',
  unit_price      numeric(12,2),
  total_price     numeric(12,2),
  notes           text,
  sort_order      integer default 0
);

-- ============================================================
-- 8. PRICE HISTORY — Smart price alerts
-- ============================================================

create table price_history (
  id              uuid primary key default uuid_generate_v4(),
  contact_id      uuid references contacts(id),  -- customer
  product_name    text not null,
  dn_size         text,
  quoted_price    numeric(12,2) not null,
  quote_id        uuid references quotes(id),
  quoted_at       timestamptz default now()
);

-- ============================================================
-- 9. MARKETING PIPELINE — Leads funnel (10-15 concurrent)
-- ============================================================

create table leads (
  id              uuid primary key default uuid_generate_v4(),
  company_name    text not null,
  contact_name    text,
  phone           text,
  email           text,
  source          text,
  status          lead_status default 'introduction',
  project_id      uuid references projects(id),  -- linked when converted
  estimated_value numeric(12,2),
  notes           text,
  assigned_to     uuid references profiles(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- 10. CONTAINERS / LOGISTICS — ISKOOR format
-- ============================================================

create table shipments (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid references projects(id),
  lot_number      text not null,           -- LOT1, LOT2, etc.
  bl_number       text,                    -- Bill of Lading
  release_date    date,                    -- תאריך שחרור
  eta             date,                    -- ETA
  delivery_date   date,                    -- תאריך אספקה ללקוח
  status          text default 'in_transit',
  notes           text,
  created_at      timestamptz default now()
);

create table containers (
  id                uuid primary key default uuid_generate_v4(),
  shipment_id       uuid not null references shipments(id) on delete cascade,
  container_number  text not null,         -- e.g. TCNU 1724048
  invoice_date      date,                  -- Date of INV
  dn_number         text,                  -- DN (delivery note)
  invoice_number    text,                  -- Invoice no.
  invoice_value     numeric(12,2),         -- Invoice value (EUR)
  routing           container_routing,

  -- Pipe quantities by specification (ISKOOR columns)
  dn900_qty         numeric(8,3) default 0,
  dn500_qty         numeric(8,3) default 0,
  dn1280_standard   numeric(8,3) default 0,
  dn1280_nozzles    numeric(8,3) default 0,
  dn1280_first      numeric(8,3) default 0,
  dn1000_standard   numeric(8,3) default 0,
  dn1000_nozzles    numeric(8,3) default 0,
  dn1000_first      numeric(8,3) default 0,
  dn750_standard    numeric(8,3) default 0,
  dn750_nozzles     numeric(8,3) default 0,
  dn750_first       numeric(8,3) default 0,

  -- Purchase order & COA tracking
  purchase_order    text,                  -- ת.מ רכש
  coa_1             text,
  coa_2             text,
  coa_3             text,
  coa_4             text,
  coa_5             text,
  coa_6             text,

  weight_kg         numeric(10,2),
  volume_cbm        numeric(10,3),
  unloading_notes   text,                  -- דגשי פריקה בטוחה
  created_at        timestamptz default now()
);

-- ============================================================
-- 11. FIELD FORMS — B-116 (Supervision Report)
-- ============================================================

create table field_reports_b116 (
  id                    uuid primary key default uuid_generate_v4(),
  project_id            uuid not null references projects(id),
  report_number         text not null,
  inspection_date       date not null,
  inspector_id          uuid references profiles(id),

  -- Pipe specs (ממצאי הפקוח)
  pit_dimensions_m      numeric(8,2),        -- מידות פיר דחיקה
  segment_length_m      numeric(8,2),        -- אורך סגמנט צינור
  outer_diameter_mm     numeric(8,2),        -- קוטר חיצוני
  inner_diameter_mm     numeric(8,2),        -- קוטר פנימי
  max_jacking_force_kn  numeric(10,2),       -- כוח דחיקה מותר KN
  max_jacking_force_ton numeric(10,2),       -- כוח דחיקה מותר טון
  connector_type        text,                -- סוג מחבר (GRP / נירוסטה)
  max_machine_force_kn  numeric(10,2),       -- כוח מקסימלי מכונה
  max_pressure_bar      numeric(8,2),        -- לחץ מקסימלי
  pressure_to_force     numeric(8,2),        -- KN = _ x Bar
  sleeve_width          numeric(8,2),        -- רוחב שרוול
  calibration_width     numeric(8,2),        -- רוחב קליברציה
  plate_outer_dia       numeric(8,2),        -- קוטר חוץ פלטת דחיקה
  plate_inner_dia       numeric(8,2),        -- קוטר פנים פלטת דחיקה
  plate_surface_ok      boolean,             -- פני שטח ישרים וחלקים
  push_base_width       numeric(8,2),        -- רוחב כן דחיקה

  -- Jacking data (3-stage measurements)
  current_pipe_number   integer,
  total_jacked_length_m numeric(10,2),       -- אורך הקו שנדחק
  stage1_pressure_bar   numeric(8,2),
  stage1_force_kn       numeric(10,2),
  stage1_speed_mm_min   numeric(8,2),
  stage2_pressure_bar   numeric(8,2),
  stage2_force_kn       numeric(10,2),
  stage2_speed_mm_min   numeric(8,2),
  stage3_pressure_bar   numeric(8,2),
  stage3_force_kn       numeric(10,2),
  stage3_speed_mm_min   numeric(8,2),
  bentonite_flow_m3h    numeric(8,2),        -- סחרור בנטונייד
  inlet_flow_m3h        numeric(8,2),        -- ספיקה בכניסה
  outlet_flow_m3h       numeric(8,2),        -- ספיקה ביציאה

  -- Intermediate stations
  station1_length_m     numeric(8,2),
  station1_pressure_bar numeric(8,2),
  station1_force_kn     numeric(10,2),
  station1_speed_mm_min numeric(8,2),
  station2_length_m     numeric(8,2),
  station2_pressure_bar numeric(8,2),
  station2_force_kn     numeric(10,2),
  station2_speed_mm_min numeric(8,2),

  -- Observations
  jacking_speed_ok      boolean,
  defects_during_push   text,
  special_requirements  text,
  general_notes         text,
  contractor_notes      text,

  -- Sign-off
  inspector_signature   text,               -- URL to signature image
  site_manager_name     text,
  visit_date            date,

  -- Photos
  screen_photo_url      text,               -- צילום מסך תצוגה
  pressure_gauge_url    text,               -- צילום שעוני לחץ

  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- ============================================================
-- 12. FIELD FORMS — B-244 (Training & Kickoff)
-- ============================================================

create table field_reports_b244 (
  id                  uuid primary key default uuid_generate_v4(),
  project_id          uuid not null references projects(id),
  report_number       text not null,
  report_date         date not null,
  inspector_id        uuid references profiles(id),

  -- Training/kickoff details
  contractor_name     text,
  training_type       text,                -- הנעה / הדרכה
  pipe_type           text,                -- סוג צנרת (דחיקה)
  dn_size             text,

  -- Attendees
  attendees           jsonb,               -- [{name, role, phone}]

  -- Checklist items
  safety_briefing_done    boolean default false,
  handling_demo_done      boolean default false,
  connection_demo_done    boolean default false,
  sealing_demo_done       boolean default false,
  labeling_done           boolean default false,

  -- Sign-offs
  contractor_signature    text,            -- URL
  fibertech_signature     text,            -- URL
  notes                   text,

  created_at              timestamptz default now()
);

-- ============================================================
-- 13. FIELD FORMS — B-165 (Pilot Execution)
-- ============================================================

create table field_reports_b165 (
  id                  uuid primary key default uuid_generate_v4(),
  project_id          uuid not null references projects(id),
  report_number       text not null,
  report_date         date not null,
  inspector_id        uuid references profiles(id),

  -- Pilot details
  contractor_name     text,
  pipe_type           text,
  dn_size             text,
  pilot_length_m      numeric(8,2),

  -- Execution checklist
  trench_prep_ok          boolean default false,
  bedding_ok              boolean default false,
  pipe_lowering_ok        boolean default false,
  connection_method_ok    boolean default false,
  backfill_ok             boolean default false,
  alignment_ok            boolean default false,

  -- Measurements
  trench_depth_m          numeric(8,2),
  trench_width_m          numeric(8,2),
  bedding_material        text,
  backfill_material       text,

  -- Results
  pilot_passed            boolean,
  defects_found           text,
  corrective_actions      text,

  -- Sign-offs
  contractor_signature    text,
  fibertech_signature     text,
  notes                   text,

  created_at              timestamptz default now()
);

-- ============================================================
-- 14. FIELD FORMS — B-12-2 (Incident / Defect Report)
-- ============================================================

create table field_reports_b12_2 (
  id                    uuid primary key default uuid_generate_v4(),
  project_id            uuid not null references projects(id),
  report_number         text not null,
  report_date           date not null,
  reporter_id           uuid references profiles(id),

  incident_type         incident_type not null,

  -- Contact who reported
  reporter_name         text,
  reporter_phone        text,
  related_field_report  text,              -- מס' דוח שרות שדה

  -- Defect details
  defect_description    text not null,     -- תיאור התקלה
  defect_location       geography(point, 4326),
  defect_location_text  text,

  -- Investigation
  cause_assessment      text,              -- חקירת סיבת התקלה
  repair_responsible    text,              -- אחריות לביצוע התיקון
  repair_executor       text,              -- הגורם המבצע בפועל
  repair_actions        text,              -- פעולות שבוצעו
  factory_actions       text,              -- פעולות במפעל
  field_service_report  text,              -- דיווח מש״ש

  -- History & warranty
  previous_incidents    text,              -- היסטוריית תקלות
  warranty_period       text,              -- תקופת אחריות
  repair_warranty       text,              -- אחריות למבצע התיקון
  preventive_actions    text,              -- המלצות למניעה

  -- Timeline
  target_repair_date    date,
  actual_repair_date    date,
  approved_by           text,
  approved_at           timestamptz,

  -- Distribution
  sent_to_complainant   boolean default false,
  sent_to_planner       boolean default false,
  sent_to_developer     boolean default false,
  sent_to_inspector     boolean default false,
  sent_to_contractor    boolean default false,
  sent_to_marketing     boolean default false,

  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- ============================================================
-- 15. FIELD REPORT STOP LOG — B-116 jacking stops
-- ============================================================

create table jacking_stops (
  id                  uuid primary key default uuid_generate_v4(),
  report_id           uuid not null references field_reports_b116(id) on delete cascade,
  stop_number         integer not null,
  stop_date           date,
  duration_hours      numeric(6,2),
  reason              text,
  section_reference   text,             -- המקטע שבו חלה העצירה
  force_before_kn     numeric(10,2),
  force_after_kn      numeric(10,2),
  high_force_hours    numeric(6,2),     -- משך דחיקה בכח מוגבר
  notes               text
);

-- ============================================================
-- 16. FILE ATTACHMENTS — Photos, documents, signatures
-- ============================================================

create table attachments (
  id              uuid primary key default uuid_generate_v4(),
  entity_type     text not null,           -- 'project', 'field_report_b116', etc.
  entity_id       uuid not null,
  file_name       text not null,
  file_url        text not null,           -- Supabase Storage URL
  file_type       text,                    -- 'photo', 'signature', 'document', 'drawing'
  file_size_bytes bigint,
  uploaded_by     uuid references profiles(id),
  geo_location    geography(point, 4326),  -- GPS from mobile
  created_at      timestamptz default now()
);

create index idx_attachments_entity on attachments(entity_type, entity_id);

-- ============================================================
-- 17. SIGNATURES — Digital signature pad captures
-- ============================================================

create table signatures (
  id              uuid primary key default uuid_generate_v4(),
  entity_type     text not null,
  entity_id       uuid not null,
  signer_name     text not null,
  signer_role     text,                    -- e.g. 'contractor', 'inspector'
  signature_url   text not null,           -- Supabase Storage URL
  signed_at       timestamptz default now(),
  ip_address      text,
  device_info     text
);

create index idx_signatures_entity on signatures(entity_type, entity_id);

-- ============================================================
-- 18. INTERNAL MEETINGS — Digital meeting management
-- ============================================================

create table meetings (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid references projects(id),
  title           text not null,
  meeting_date    timestamptz not null,
  departments     text[],                 -- ['engineering', 'import', 'field', 'office']
  attendee_ids    uuid[],
  agenda          text,
  minutes         text,
  action_items    jsonb,                  -- [{task, assignee_id, due_date, done}]
  created_at      timestamptz default now()
);

-- ============================================================
-- 19. ALERTS / NOTIFICATIONS
-- ============================================================

create table alerts (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references profiles(id),
  project_id      uuid references projects(id),
  severity        alert_severity default 'info',
  title           text not null,
  message         text,
  category        text,                   -- 'payment', 'container', 'signature', 'report'
  is_read         boolean default false,
  link_to         text,                   -- deep-link in app
  created_at      timestamptz default now()
);

create index idx_alerts_user on alerts(user_id, is_read);

-- ============================================================
-- 20. FINANCE — Payments & checks tracking (Yigal)
-- ============================================================

create table payments (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references projects(id),
  order_id        uuid references orders(id),
  payment_type    text,                   -- 'check', 'transfer', 'credit'
  amount          numeric(12,2) not null,
  currency        text default 'ILS',
  due_date        date,
  paid_date       date,
  check_number    text,
  status          text default 'pending', -- 'pending', 'paid', 'overdue', 'bounced'
  invoice_number  text,
  notes           text,
  created_at      timestamptz default now()
);

-- ============================================================
-- 21. FACTORY ORDERS — Aamer's production tracking
-- ============================================================

create table factory_orders (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid references projects(id),
  order_id        uuid references orders(id),
  product_name    text not null,
  dn_size         text,
  quantity        numeric(10,2),
  unit            text default 'unit',
  status          text default 'pending', -- 'pending', 'in_production', 'completed', 'shipped'
  target_date     date,
  completion_date date,
  notes           text,
  created_at      timestamptz default now()
);

-- ============================================================
-- 22. PROJECT STAGE LOG — Track stage transitions
-- ============================================================

create table project_stage_log (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references projects(id),
  from_stage      project_stage,
  to_stage        project_stage not null,
  changed_by      uuid references profiles(id),
  notes           text,
  changed_at      timestamptz default now()
);

-- ============================================================
-- 23. VIEWS
-- ============================================================

-- ISKOOR-style logistics tracking view
create or replace view v_iskoor_tracking as
select
  s.lot_number,
  s.bl_number,
  s.release_date,
  s.eta,
  s.delivery_date,
  s.status           as shipment_status,
  c.container_number,
  c.invoice_date,
  c.dn_number,
  c.invoice_number,
  c.invoice_value,
  c.dn900_qty,
  c.dn500_qty,
  c.dn1280_standard,
  c.dn1280_nozzles,
  c.dn1280_first,
  c.dn1000_standard,
  c.dn1000_nozzles,
  c.dn1000_first,
  c.dn750_standard,
  c.dn750_nozzles,
  c.dn750_first,
  c.purchase_order,
  c.coa_1,
  c.coa_2,
  c.coa_3,
  c.coa_4,
  c.coa_5,
  c.coa_6,
  p.project_name
from shipments s
join containers c on c.shipment_id = s.id
left join projects p on s.project_id = p.id
order by s.eta desc, s.lot_number, c.container_number;

-- Dashboard KPI view
create or replace view v_dashboard_kpi as
select
  (select count(*) from projects where is_active and current_stage not in ('stage_9_warranty', 'stage_10_marketing')) as active_projects,
  (select count(*) from shipments where status = 'in_transit') as containers_in_transit,
  (select count(*) from quotes where status in ('draft', 'sent', 'under_review')) as open_quotes,
  (select count(*) from projects where is_active = false or current_stage = 'stage_10_marketing') as completed_projects;

-- Signature traffic light view
create or replace view v_signature_status as
select
  o.id as order_id,
  p.project_name,
  o.order_number,
  o.advance_signed,
  o.spec_signed,
  o.proforma_signed,
  case
    when o.advance_signed = 'signed' and o.spec_signed = 'signed' and o.proforma_signed = 'signed'
    then 'green'
    when o.advance_signed = 'pending' or o.spec_signed = 'pending' or o.proforma_signed = 'pending'
    then 'red'
    else 'yellow'
  end as traffic_light
from orders o
join projects p on o.project_id = p.id
where p.is_active;

-- ============================================================
-- 24. ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table profiles enable row level security;
alter table projects enable row level security;
alter table orders enable row level security;
alter table quotes enable row level security;
alter table leads enable row level security;
alter table shipments enable row level security;
alter table containers enable row level security;
alter table field_reports_b116 enable row level security;
alter table field_reports_b244 enable row level security;
alter table field_reports_b165 enable row level security;
alter table field_reports_b12_2 enable row level security;
alter table attachments enable row level security;
alter table signatures enable row level security;
alter table alerts enable row level security;
alter table payments enable row level security;
alter table factory_orders enable row level security;

-- All authenticated users can read (filtered per-role in app layer)
create policy "Authenticated read" on profiles for select to authenticated using (true);
create policy "Authenticated read" on projects for select to authenticated using (true);
create policy "Authenticated read" on orders for select to authenticated using (true);
create policy "Authenticated read" on quotes for select to authenticated using (true);
create policy "Authenticated read" on leads for select to authenticated using (true);
create policy "Authenticated read" on shipments for select to authenticated using (true);
create policy "Authenticated read" on containers for select to authenticated using (true);
create policy "Authenticated read" on field_reports_b116 for select to authenticated using (true);
create policy "Authenticated read" on field_reports_b244 for select to authenticated using (true);
create policy "Authenticated read" on field_reports_b165 for select to authenticated using (true);
create policy "Authenticated read" on field_reports_b12_2 for select to authenticated using (true);
create policy "Authenticated read" on attachments for select to authenticated using (true);
create policy "Authenticated read" on signatures for select to authenticated using (true);
create policy "Authenticated read" on alerts for select to authenticated
  using (user_id = auth.uid());
create policy "Authenticated read" on payments for select to authenticated using (true);
create policy "Authenticated read" on factory_orders for select to authenticated using (true);

-- Insert/update for authenticated users (fine-grained per role in app)
create policy "Authenticated insert" on projects for insert to authenticated with check (true);
create policy "Authenticated update" on projects for update to authenticated using (true);
create policy "Authenticated insert" on orders for insert to authenticated with check (true);
create policy "Authenticated update" on orders for update to authenticated using (true);
create policy "Authenticated insert" on quotes for insert to authenticated with check (true);
create policy "Authenticated update" on quotes for update to authenticated using (true);
create policy "Authenticated insert" on field_reports_b116 for insert to authenticated with check (true);
create policy "Authenticated insert" on field_reports_b244 for insert to authenticated with check (true);
create policy "Authenticated insert" on field_reports_b165 for insert to authenticated with check (true);
create policy "Authenticated insert" on field_reports_b12_2 for insert to authenticated with check (true);
create policy "Authenticated insert" on attachments for insert to authenticated with check (true);
create policy "Authenticated insert" on signatures for insert to authenticated with check (true);
create policy "Authenticated insert" on alerts for insert to authenticated with check (true);
create policy "Authenticated insert" on payments for insert to authenticated with check (true);
create policy "Authenticated update" on payments for update to authenticated using (true);
create policy "Authenticated insert" on factory_orders for insert to authenticated with check (true);
create policy "Authenticated update" on factory_orders for update to authenticated using (true);
create policy "Authenticated insert" on shipments for insert to authenticated with check (true);
create policy "Authenticated update" on shipments for update to authenticated using (true);
create policy "Authenticated insert" on containers for insert to authenticated with check (true);
create policy "Authenticated update" on containers for update to authenticated using (true);
create policy "Authenticated insert" on leads for insert to authenticated with check (true);
create policy "Authenticated update" on leads for update to authenticated using (true);

-- ============================================================
-- 25. TRIGGERS — Auto-update timestamps
-- ============================================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_projects_updated before update on projects
  for each row execute function update_updated_at();
create trigger trg_orders_updated before update on orders
  for each row execute function update_updated_at();
create trigger trg_quotes_updated before update on quotes
  for each row execute function update_updated_at();
create trigger trg_leads_updated before update on leads
  for each row execute function update_updated_at();
create trigger trg_b116_updated before update on field_reports_b116
  for each row execute function update_updated_at();
create trigger trg_b12_2_updated before update on field_reports_b12_2
  for each row execute function update_updated_at();

-- ============================================================
-- 26. TRIGGER — Finance email on quote signed
-- ============================================================

create or replace function notify_quote_signed()
returns trigger as $$
begin
  if new.status = 'signed' and (old.status is null or old.status <> 'signed') then
    -- Insert alert for finance user (Yigal)
    insert into alerts (user_id, project_id, severity, title, message, category)
    select
      p.id,
      new.project_id,
      'critical',
      'הצעת מחיר נחתמה — ' || new.quote_number,
      'הצעת מחיר ' || new.quote_number || ' נחתמה. נדרש עדכון לכספים.',
      'payment'
    from profiles p
    where p.role = 'finance';

    -- Also call the webhook via pg_net (Make.com integration)
    -- perform net.http_post(
    --   url := current_setting('app.make_webhook_url', true),
    --   body := jsonb_build_object(
    --     'event', 'quote_signed',
    --     'quote_id', new.id,
    --     'quote_number', new.quote_number,
    --     'project_id', new.project_id,
    --     'total_amount', new.total_amount,
    --     'signed_at', new.signed_at
    --   )
    -- );
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_quote_signed after update on quotes
  for each row execute function notify_quote_signed();

-- ============================================================
-- 27. FUNCTION — Gross Margin Pricing Engine
-- ============================================================

create or replace function calc_gross_margin_price(
  p_cost numeric,
  p_overheads_pct numeric default 15,
  p_profit_pct numeric default 25
)
returns numeric as $$
begin
  -- Formula: (Cost + Overheads) / (1 - Profit%)
  -- = Cost * (1 + overheads_pct/100) / (1 - profit_pct/100)
  return round(
    (p_cost * (1 + p_overheads_pct / 100.0)) / (1 - p_profit_pct / 100.0),
    2
  );
end;
$$ language plpgsql immutable;

-- Auto-compute gross_margin_price on project insert/update
create or replace function compute_project_margin()
returns trigger as $$
begin
  if new.estimated_cost is not null then
    new.gross_margin_price := calc_gross_margin_price(
      new.estimated_cost,
      coalesce(new.overheads_pct, 15),
      coalesce(new.profit_pct, 25)
    );
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_project_margin before insert or update on projects
  for each row execute function compute_project_margin();

-- Auto-compute quote calculated_price
create or replace function compute_quote_price()
returns trigger as $$
begin
  if new.base_cost is not null then
    new.calculated_price := calc_gross_margin_price(
      new.base_cost,
      coalesce(new.overheads_pct, 15),
      coalesce(new.profit_pct, 25)
    );
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_quote_price before insert or update on quotes
  for each row execute function compute_quote_price();

-- ============================================================
-- 28. STORAGE BUCKETS (run via Supabase dashboard or API)
-- ============================================================

-- These need to be created via Supabase Storage API:
-- insert into storage.buckets (id, name, public)
-- values
--   ('project-files', 'project-files', false),
--   ('field-photos', 'field-photos', false),
--   ('signatures', 'signatures', false),
--   ('documents', 'documents', false);
