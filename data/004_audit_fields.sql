-- Audit trail on every entity table, no exceptions: created_by/updated_by
-- (null = system/API, a uuid = the rep), plus execution_url for rows
-- written by external automation (e.g. an n8n execution link).
-- created_at/updated_at already existed on customers/sales/journeys/
-- registrations/tasks; added where missing (contacts/meetings/phone_calls/
-- notes/documents only had created_at or a domain-specific timestamp).

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'customers','sales','journeys','registrations','tasks',
    'contacts','meetings','phone_calls','notes','documents'
  ])
  loop
    execute format('alter table %I add column if not exists created_by uuid references auth.users(id)', t);
    execute format('alter table %I add column if not exists updated_by uuid references auth.users(id)', t);
    execute format('alter table %I add column if not exists execution_url text', t);
    execute format('alter table %I add column if not exists created_at timestamptz not null default now()', t);
    execute format('alter table %I add column if not exists updated_at timestamptz not null default now()', t);
  end loop;
end $$;

create or replace function stamp_created_by() returns trigger as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function stamp_updated_by() returns trigger as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$ language plpgsql;

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'customers','sales','journeys','registrations','tasks',
    'contacts','meetings','phone_calls','notes','documents'
  ])
  loop
    execute format('drop trigger if exists %I_created_by on %I', t, t);
    execute format('create trigger %I_created_by before insert on %I for each row execute function stamp_created_by()', t, t);
    execute format('drop trigger if exists %I_updated_by on %I', t, t);
    execute format('create trigger %I_updated_by before update on %I for each row execute function stamp_updated_by()', t, t);
  end loop;
end $$;

-- stamp_updated_by() now covers updated_at too — the narrower set_updated_at
-- triggers from 001_init_schema.sql on these 5 tables are redundant.
drop trigger if exists customers_updated_at on customers;
drop trigger if exists sales_updated_at on sales;
drop trigger if exists journeys_updated_at on journeys;
drop trigger if exists registrations_updated_at on registrations;
drop trigger if exists tasks_updated_at on tasks;
