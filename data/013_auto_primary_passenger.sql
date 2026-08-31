-- Guarantees every registration has a primary passenger (the linked
-- customer) no matter how the registration row was created: the manual
-- "הרשמה חדשה" UI form, the api-v1 REST endpoint, or the Max AI chat agent.
-- Previously this was only done client-side in RecordFormModal.jsx, which
-- only covered the manual-UI path. Moving it into an AFTER INSERT trigger
-- on registrations makes it apply everywhere, and RecordFormModal.jsx's
-- manual createPrimaryPassenger() call was removed to avoid double-inserting.
--
-- Applied live via Supabase MCP execute_sql/apply_migration on 31.08.2026;
-- this file documents it for the repo history, matching the numbered
-- migration convention in this directory.
create or replace function public.create_primary_passenger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cust record;
  full_name text;
begin
  if new.customer_id is null then
    return new;
  end if;

  if exists (
    select 1 from registration_passengers
    where registration_id = new.id and is_primary = true
  ) then
    return new;
  end if;

  select first_name, last_name, mobile_phone, email
    into cust
    from customers where id = new.customer_id;

  if not found then
    return new;
  end if;

  full_name := nullif(trim(coalesce(cust.first_name, '') || ' ' || coalesce(cust.last_name, '')), '');

  insert into registration_passengers (registration_id, full_name, phone, email, is_primary)
  values (new.id, coalesce(full_name, 'לקוח'), cust.mobile_phone, cust.email, true);

  return new;
end;
$$;

drop trigger if exists registrations_auto_primary_passenger on registrations;
create trigger registrations_auto_primary_passenger
after insert on registrations
for each row
execute function public.create_primary_passenger();

-- One-time backfill: give every pre-existing registration with zero
-- passengers a primary passenger from its linked customer. Idempotent —
-- the NOT EXISTS guard means re-running this file is a no-op for rows that
-- already have one.
insert into registration_passengers (registration_id, full_name, phone, email, is_primary)
select r.id,
  coalesce(nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''), 'לקוח'),
  c.mobile_phone, c.email, true
from registrations r
join customers c on c.id = r.customer_id
where not exists (
  select 1 from registration_passengers p where p.registration_id = r.id and p.is_primary = true
);
