-- TRAX CRM — initial schema
-- Source of truth for field names/values: docs/domain-model.md
-- Both waves' tables are created now (schema is cheap, cascading ALTERs
-- later are not); Wave 2 UI simply isn't built until its data is ready.

create extension if not exists pgcrypto;

-- ============================================================
-- App users (role/display layer over auth.users)
-- ============================================================
create table app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'owner',
  avatar_url text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Core entity: customers (לקוח)
-- ============================================================
create table customers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  mobile_phone text,
  email text,
  business_unit text not null check (business_unit in ('TRAX','Xcon')),
  lead_source text check (lead_source in ('פייסבוק','אינסטגרם','גוגל','אתר TRAX','דף נחיתה','המלצה','אחר')),
  campaign text,
  status text not null default 'ליד חדש' check (status in ('ליד חדש','בטיפול','לקוח פעיל','לקוח עבר','לא רלוונטי')),
  notes text,
  lead_rating text check (lead_rating in ('חם','פושר','קר','לא רלוונטי')),
  club_member boolean not null default false,
  club_joined_at date,
  credit_balance numeric(10,2) not null default 0,
  extreme_experience_level text check (extreme_experience_level in ('מתחיל','בינוני','מנוסה','מקצועי')),
  preferred_language text check (preferred_language in ('עברית','אנגלית')),
  first_contact_at timestamptz not null default now(),
  -- Xcon-only fields
  company text,
  job_title text,
  work_email text,
  owner_id uuid references auth.users(id),
  custom jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Identity keys: mobile phone for TRAX, work email for Xcon (spec §domain-model).
-- Never match across business units even on identical phone/email.
create unique index customers_trax_phone_key
  on customers (mobile_phone)
  where business_unit = 'TRAX' and deleted_at is null and mobile_phone is not null;
create unique index customers_xcon_work_email_key
  on customers (work_email)
  where business_unit = 'Xcon' and deleted_at is null and work_email is not null;

create index customers_business_unit_idx on customers (business_unit) where deleted_at is null;

-- ============================================================
-- Core entity: journeys (מסע) — one row per dated departure
-- ============================================================
create table journeys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_unit text not null check (business_unit in ('TRAX','Xcon')),
  destination text check (destination in ('מונטנגרו','איחוד האמירויות','קוסטה ריקה','טנריף','מדיירה')),
  departure_date date not null,
  return_date date,
  seats_total int not null default 22,
  min_seats int not null default 18,
  -- seats_sold/seats_available are recomputed by trigger below, never
  -- hand-edited: "recount every event, not a cumulative counter" (spec).
  seats_sold int not null default 0,
  seats_available int not null default 22,
  status text not null default 'בתכנון' check (status in ('בתכנון','פתוח להרשמה','כמעט מלא','מלא','יצא לדרך','בוטל')),
  price_per_person numeric(10,2),
  currency text check (currency in ('EUR','ILS','USD')),
  includes_flights boolean not null default false,
  short_description text,
  page_url text,
  operations_notes text,
  custom jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index journeys_business_unit_idx on journeys (business_unit) where deleted_at is null;
create index journeys_status_idx on journeys (status) where deleted_at is null;

-- ============================================================
-- Core entity: sales (מכירה)
-- ============================================================
create table sales (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  business_unit text not null check (business_unit in ('TRAX','Xcon')),
  stage text not null default 'ליד חדש' check (stage in (
    'ליד חדש','נוצר קשר על ידי AI','שיחת מכירה עם נציג אנושי',
    'הצעה נשלחה','ממתין להחלטה','נסגר בהצלחה','נסגר באי הצלחה'
  )),
  channel text check (channel in ('וואטסאפ','טופס אתר','דף נחיתה','טלפון')),
  lead_source text check (lead_source in ('פייסבוק','אינסטגרם','גוגל','אתר TRAX','דף נחיתה','המלצה','אחר')),
  campaign text,
  owner_id uuid references auth.users(id),
  loss_reason text check (loss_reason in (
    'מחיר','תאריכים לא מתאימים','לא ענה','בחר מתחרה',
    'נסגר בחוסר מקום לחזור בעתיד','לא רלוונטי','אחר'
  )),
  journey_id uuid references journeys(id),
  participants_count int,
  expected_value numeric(10,2),
  currency text check (currency in ('EUR','ILS','USD')),
  qualification_rating text check (qualification_rating in ('עומד בקריטריונים','חלקי','לא עומד','ספאם')),
  qualification_summary text,
  next_call_at timestamptz,
  -- Xcon-only
  interest_area text check (interest_area in ('ייעוץ','פרויקטים','פתרונות','תובנות','ZAP','קריירה','שותפויות','אחר')),
  deal_name text,
  custom jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- "closing as unsuccessful without a reason is not allowed"
  constraint sales_loss_reason_required check (
    stage <> 'נסגר באי הצלחה' or loss_reason is not null
  )
);

create index sales_customer_idx on sales (customer_id);
create index sales_business_unit_idx on sales (business_unit) where deleted_at is null;
create index sales_stage_idx on sales (stage) where deleted_at is null;
create index sales_owner_idx on sales (owner_id);

-- deal_name auto-composition: customer name + journey name, with a
-- fallback for Wave 1 (no journey linked yet).
create or replace function sales_set_deal_name() returns trigger as $$
declare
  cust_name text;
  journey_name text;
begin
  select first_name || ' ' || last_name into cust_name from customers where id = new.customer_id;
  if new.journey_id is not null then
    select name into journey_name from journeys where id = new.journey_id;
  end if;
  new.deal_name := coalesce(cust_name, 'לקוח') || ' - ' || coalesce(journey_name, 'ליד חדש');
  return new;
end;
$$ language plpgsql;

create trigger sales_deal_name_trigger
  before insert or update of customer_id, journey_id on sales
  for each row execute function sales_set_deal_name();

-- ============================================================
-- Core entity: registrations (הרשמה למסע) — occupies a seat
-- ============================================================
create table registrations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  journey_id uuid not null references journeys(id),
  sale_id uuid references sales(id),
  status text not null default 'משוריין' check (status in ('משוריין','שולמה מקדמה','שולם במלואו','בוטל')),
  amount_paid numeric(10,2) not null default 0,
  currency text check (currency in ('EUR','ILS','USD')),
  last_payment_date date,
  payment_method text check (payment_method in ('אשראי','העברה בנקאית','אחר')),
  invoice_number text,
  passport_valid boolean not null default false,
  travel_insurance boolean not null default false,
  medical_dietary_notes text,
  emergency_contact text,
  includes_flight_for_participant boolean not null default false,
  registration_name text,
  registered_at timestamptz not null default now(),
  custom jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index registrations_journey_idx on registrations (journey_id) where deleted_at is null;
create index registrations_customer_idx on registrations (customer_id);
create index registrations_sale_idx on registrations (sale_id);
create index registrations_status_idx on registrations (status) where deleted_at is null;

create or replace function registrations_set_name() returns trigger as $$
declare
  cust_name text;
  journey_name text;
begin
  select first_name || ' ' || last_name into cust_name from customers where id = new.customer_id;
  select name into journey_name from journeys where id = new.journey_id;
  new.registration_name := coalesce(cust_name, 'משתתף') || ' - ' || coalesce(journey_name, 'מסע');
  return new;
end;
$$ language plpgsql;

create trigger registrations_name_trigger
  before insert or update of customer_id, journey_id on registrations
  for each row execute function registrations_set_name();

-- ============================================================
-- Seat counting + journey status automation
-- "active" registration = משוריין / שולמה מקדמה / שולם במלואו, not deleted.
-- Recounted from scratch on every change, per spec — never a running counter.
-- Manual statuses (בתכנון / יצא לדרך / בוטל) are immune: automation only
-- moves a journey between פתוח להרשמה ⇄ כמעט מלא ⇄ מלא.
-- ============================================================
create or replace function journeys_recount_seats(p_journey_id uuid) returns void as $$
declare
  v_sold int;
  v_total int;
  v_status text;
begin
  select count(*) into v_sold
    from registrations
    where journey_id = p_journey_id
      and status in ('משוריין','שולמה מקדמה','שולם במלואו')
      and deleted_at is null;

  select seats_total, status into v_total, v_status from journeys where id = p_journey_id;

  update journeys
    set seats_sold = v_sold,
        seats_available = v_total - v_sold,
        status = case
          when status not in ('פתוח להרשמה','כמעט מלא','מלא') then status
          when (v_total - v_sold) <= 0 then 'מלא'
          when (v_total - v_sold) <= 2 then 'כמעט מלא'
          else 'פתוח להרשמה'
        end,
        updated_at = now()
    where id = p_journey_id;
end;
$$ language plpgsql;

create or replace function registrations_after_change() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    perform journeys_recount_seats(old.journey_id);
    return old;
  end if;

  perform journeys_recount_seats(new.journey_id);
  if tg_op = 'UPDATE' and old.journey_id is distinct from new.journey_id then
    perform journeys_recount_seats(old.journey_id);
  end if;
  return new;
end;
$$ language plpgsql;

create trigger registrations_seat_count_trigger
  after insert or update of status, journey_id, deleted_at or delete on registrations
  for each row execute function registrations_after_change();

-- ============================================================
-- Standard entities (polymorphic: related_type + related_id)
-- ============================================================
create table tasks (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  related_type text not null check (related_type in ('customer','sale','registration')),
  related_id uuid not null,
  assignee_id uuid references auth.users(id),
  due_at timestamptz,
  status text not null default 'פתוחה' check (status in ('פתוחה','בוצעה','בוטלה')),
  priority text not null default 'רגילה' check (priority in ('רגילה','גבוהה','דחופה')),
  description text,
  business_unit text check (business_unit in ('TRAX','Xcon')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index tasks_related_idx on tasks (related_type, related_id);
create index tasks_assignee_idx on tasks (assignee_id) where status = 'פתוחה';

create table meetings (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  related_type text not null check (related_type in ('customer','sale')),
  related_id uuid not null,
  start_at timestamptz not null,
  duration_minutes int,
  type text check (type in ('שיחת טלפון','זום','פגישה פיזית')),
  participants uuid[] not null default '{}',
  summary text,
  google_event_id text,
  business_unit text check (business_unit in ('TRAX','Xcon')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index meetings_related_idx on meetings (related_type, related_id);

create table phone_calls (
  id uuid primary key default gen_random_uuid(),
  related_type text not null default 'customer' check (related_type in ('customer')),
  related_id uuid not null,
  direction text not null check (direction in ('נכנסת','יוצאת')),
  occurred_at timestamptz not null default now(),
  duration_seconds int,
  result text check (result in ('נענתה','לא נענתה','תפוס','השאיר הודעה')),
  recording_url text,
  transcript text,
  business_unit text check (business_unit in ('TRAX','Xcon')),
  created_at timestamptz not null default now()
);
create index phone_calls_related_idx on phone_calls (related_type, related_id);

create table notes (
  id uuid primary key default gen_random_uuid(),
  related_type text not null check (related_type in ('customer','sale','journey','registration')),
  related_id uuid not null,
  content text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index notes_related_idx on notes (related_type, related_id);

create table documents (
  id uuid primary key default gen_random_uuid(),
  related_type text not null check (related_type in ('customer','sale','registration')),
  related_id uuid not null,
  file_name text not null,
  file_type text,
  storage_key text not null,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now()
);
create index documents_related_idx on documents (related_type, related_id);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  role text,
  created_at timestamptz not null default now()
);
create index contacts_customer_idx on contacts (customer_id);

-- ============================================================
-- Audit log (core 4 entities only, for now)
-- ============================================================
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);
create index audit_log_record_idx on audit_log (table_name, record_id);

create or replace function audit_log_trigger() returns trigger as $$
begin
  insert into audit_log (table_name, record_id, action, changed_by, old_data, new_data)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

create trigger customers_audit after insert or update or delete on customers
  for each row execute function audit_log_trigger();
create trigger sales_audit after insert or update or delete on sales
  for each row execute function audit_log_trigger();
create trigger journeys_audit after insert or update or delete on journeys
  for each row execute function audit_log_trigger();
create trigger registrations_audit after insert or update or delete on registrations
  for each row execute function audit_log_trigger();

-- ============================================================
-- updated_at maintenance
-- ============================================================
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger customers_updated_at before update on customers for each row execute function set_updated_at();
create trigger sales_updated_at before update on sales for each row execute function set_updated_at();
create trigger journeys_updated_at before update on journeys for each row execute function set_updated_at();
create trigger registrations_updated_at before update on registrations for each row execute function set_updated_at();
create trigger tasks_updated_at before update on tasks for each row execute function set_updated_at();

-- ============================================================
-- RLS — split by operation from day one (bina-crm lesson: a single
-- FOR ALL using(true) policy also silently governs SELECT).
-- Today: all authenticated users have equal full access (spec §org:
-- "2 users, both owners, no data separation between people yet" —
-- the only real separation is business_unit, enforced in the app layer
-- and by every view/dashboard filter, not by RLS row policy).
-- ============================================================
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'app_users','customers','sales','journeys','registrations',
    'tasks','meetings','phone_calls','notes','documents','contacts','audit_log'
  ])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I_select on %I for select to authenticated using (true)', t, t);
    execute format('create policy %I_insert on %I for insert to authenticated with check (true)', t, t);
    execute format('create policy %I_update on %I for update to authenticated using (true) with check (true)', t, t);
    execute format('create policy %I_delete on %I for delete to authenticated using (true)', t, t);
  end loop;
end $$;
