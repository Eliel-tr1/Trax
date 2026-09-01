-- Registration pre-trip checklist (Goldi, 01.09: "one place to see the rep
-- is collecting everything — passport, insurance, forms — checklist style,
-- with file attach on the items that need one").

create table if not exists registration_checklist_items (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references registrations(id) on delete cascade,
  label text not null,
  done boolean not null default false,
  done_at timestamptz,
  file_url text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table registration_checklist_items enable row level security;

-- Same access shape as registrations themselves: any authenticated user of
-- the org can read; write gated by can_access on the parent registration's
-- owning sale (mirrors data/027's ownership path).
create policy checklist_select on registration_checklist_items for select
  using (auth.role() = 'authenticated' and exists (
    select 1 from registrations r
    where r.id = registration_id
      and can_access('registrations', 'view', (select s.owner_id from sales s where s.id = r.sale_id))));

create policy checklist_write on registration_checklist_items for all
  using (auth.role() = 'authenticated' and exists (
    select 1 from registrations r
    where r.id = registration_id
      and can_access('registrations', 'edit', (select s.owner_id from sales s where s.id = r.sale_id))));

-- Default template: what Goldi described as the documentalistic rep's list.
-- Seeded automatically for every NEW registration by the trigger below.
create table if not exists registration_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  position int not null default 0,
  needs_file boolean not null default false
);

insert into registration_checklist_templates (label, position, needs_file) values
  ('דרכון בתוקף', 1, true),
  ('ביטוח נסיעות', 2, true),
  ('טופס הצהרת בריאות', 3, true),
  ('חתימה על תנאי ההצטרפות', 4, false),
  ('אישור תשלום מקדמה', 5, false),
  ('טיסות והעברות אושרו', 6, false)
on conflict (label) do nothing;

-- Seed a fresh checklist for every new registration.
create or replace function seed_registration_checklist() returns trigger
language plpgsql security definer as $$
begin
  insert into registration_checklist_items (registration_id, label, position, file_url)
  select new.id, t.label, t.position, null
  from registration_checklist_templates t
  order by t.position;
  return new;
end;
$$;

drop trigger if exists trg_seed_registration_checklist on registrations;
create trigger trg_seed_registration_checklist
  after insert on registrations
  for each row execute function seed_registration_checklist();

-- Backfill existing registrations that have no checklist yet.
insert into registration_checklist_items (registration_id, label, position, file_url)
select r.id, t.label, t.position, null
from registrations r
cross join registration_checklist_templates t
where r.deleted_at is null
  and not exists (select 1 from registration_checklist_items c where c.registration_id = r.id)
order by r.id, t.position;