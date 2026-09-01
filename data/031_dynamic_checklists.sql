-- Dynamic checklist templates (Goldi 01.09 #7): the checklist CONTENT is
-- configurable from Settings — per scope (registration / journey) — and the
-- seeded items render on every new registration / journey. Replaces the
-- hard-coded template table from 029 (kept for the data; both are read).
create table if not exists checklist_templates (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('registration','journey')),
  label text not null,
  position int not null default 0,
  needs_file boolean not null default false,
  created_at timestamptz not null default now()
);

alter table checklist_templates enable row level security;

create policy checklist_templates_select on checklist_templates for select
  using (auth.role() = 'authenticated');
create policy checklist_templates_write on checklist_templates for all
  using (auth.role() = 'authenticated');

-- Migrate the 029 hard-coded items into the new dynamic table as the
-- registration scope's starting set.
insert into checklist_templates (scope, label, position, needs_file)
select 'registration', label, position, false
from registration_checklist_templates t
where not exists (select 1 from checklist_templates c where c.scope = 'registration' and c.label = t.label);

-- A sensible journey-organizing starting set (editable in Settings).
insert into checklist_templates (scope, label, position, needs_file) values
  ('journey', 'רשימת משתתפים סופית אושרה', 1, false),
  ('journey', 'לוח זמנים יומי נשלח למשתתפים', 2, false),
  ('journey', 'ביטוח קבוצתי למסע', 3, true),
  ('journey', 'הזמנות מלון/אוכל מאושרות', 4, false),
  ('journey', 'ציוד מיוחד הוזמן', 5, false)
on conflict do nothing;

-- Journey checklist: per-journey items table + auto-seed on new journeys.
create table if not exists journey_checklist_items (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references journeys(id) on delete cascade,
  label text not null,
  done boolean not null default false,
  done_at timestamptz,
  file_url text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table journey_checklist_items enable row level security;
create policy journey_checklist_select on journey_checklist_items for select
  using (auth.role() = 'authenticated' and exists (
    select 1 from journeys j where j.id = journey_id and can_access('journeys', 'view')));
create policy journey_checklist_write on journey_checklist_items for all
  using (auth.role() = 'authenticated' and exists (
    select 1 from journeys j where j.id = journey_id and can_access('journeys', 'edit')));

create or replace function seed_journey_checklist() returns trigger
language plpgsql security definer as $$
begin
  insert into journey_checklist_items (journey_id, label, position)
  select new.id, t.label, t.position
  from checklist_templates t
  where t.scope = 'journey'
  order by t.position;
  return new;
end;
$$;

drop trigger if exists trg_seed_journey_checklist on journeys;
create trigger trg_seed_journey_checklist
  after insert on journeys
  for each row execute function seed_journey_checklist();

-- Registration checklist seeding switches to the dynamic template table
-- (029's trigger read the hard-coded table).
create or replace function seed_registration_checklist() returns trigger
language plpgsql security definer as $$
begin
  insert into registration_checklist_items (registration_id, label, position)
  select new.id, t.label, t.position
  from checklist_templates t
  where t.scope = 'registration'
  order by t.position;
  return new;
end;
$$;