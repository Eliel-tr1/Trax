-- Two additions for the "generic system fields tab" + "dedicated views" work:
--
-- 1. status_changed_at on every entity that has a lifecycle status/stage
--    column (customers.status, sales.stage, journeys.status,
--    registrations.status, tasks.status) — meetings/phone_calls/contacts
--    have no such column, so they're skipped per the brief. Stamped by a
--    trigger, not the app, so it stays correct regardless of which surface
--    (UI, n8n, API key) wrote the status change.
--
-- 2. saved_views gains an `is_preset` flag for shared, cross-user starter
--    views ("תצוגות ייעודיות") — saved_views.user_id was already nullable
--    but the RLS select policy only ever matched `user_id = auth.uid()`,
--    which silently hid null-user_id rows from everyone. Presets are
--    seeded here with user_id null + is_preset true; insert/update/delete
--    stay scoped to the owning user so nobody can edit/delete a preset from
--    the UI (SavedViews.jsx's own insert always sets user_id, never null).

alter table customers add column if not exists status_changed_at timestamptz;
alter table sales add column if not exists status_changed_at timestamptz;
alter table journeys add column if not exists status_changed_at timestamptz;
alter table registrations add column if not exists status_changed_at timestamptz;
alter table tasks add column if not exists status_changed_at timestamptz;

update customers set status_changed_at = coalesce(status_changed_at, updated_at, created_at);
update sales set status_changed_at = coalesce(status_changed_at, updated_at, created_at);
update journeys set status_changed_at = coalesce(status_changed_at, updated_at, created_at);
update registrations set status_changed_at = coalesce(status_changed_at, updated_at, created_at);
update tasks set status_changed_at = coalesce(status_changed_at, updated_at, created_at);

create or replace function stamp_status_changed_at() returns trigger as $$
begin
  if new.status_changed_at is null or new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function stamp_stage_changed_at() returns trigger as $$
begin
  if new.status_changed_at is null or new.stage is distinct from old.stage then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists customers_status_changed on customers;
create trigger customers_status_changed before update on customers
  for each row execute function stamp_status_changed_at();

drop trigger if exists journeys_status_changed on journeys;
create trigger journeys_status_changed before update on journeys
  for each row execute function stamp_status_changed_at();

drop trigger if exists registrations_status_changed on registrations;
create trigger registrations_status_changed before update on registrations
  for each row execute function stamp_status_changed_at();

drop trigger if exists tasks_status_changed on tasks;
create trigger tasks_status_changed before update on tasks
  for each row execute function stamp_status_changed_at();

drop trigger if exists sales_stage_changed on sales;
create trigger sales_stage_changed before update on sales
  for each row execute function stamp_stage_changed_at();

-- Also stamp on insert so a freshly created row isn't left with a null
-- status_changed_at until its first update.
create or replace function stamp_status_changed_at_insert() returns trigger as $$
begin
  if new.status_changed_at is null then new.status_changed_at := now(); end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists customers_status_changed_ins on customers;
create trigger customers_status_changed_ins before insert on customers
  for each row execute function stamp_status_changed_at_insert();
drop trigger if exists journeys_status_changed_ins on journeys;
create trigger journeys_status_changed_ins before insert on journeys
  for each row execute function stamp_status_changed_at_insert();
drop trigger if exists registrations_status_changed_ins on registrations;
create trigger registrations_status_changed_ins before insert on registrations
  for each row execute function stamp_status_changed_at_insert();
drop trigger if exists tasks_status_changed_ins on tasks;
create trigger tasks_status_changed_ins before insert on tasks
  for each row execute function stamp_status_changed_at_insert();
drop trigger if exists sales_stage_changed_ins on sales;
create trigger sales_stage_changed_ins before insert on sales
  for each row execute function stamp_status_changed_at_insert();

-- ---- saved_views: shared preset rows ----

alter table saved_views add column if not exists is_preset boolean not null default false;

drop policy if exists saved_views_select on saved_views;
create policy saved_views_select on saved_views for select
  using (user_id = auth.uid() or is_preset);

-- Presets are seeded idempotently (delete+reinsert by name+resource) so
-- re-running this file after tweaking a filter doesn't duplicate rows.
delete from saved_views where is_preset;

insert into saved_views (resource, name, filters, is_preset, user_id) values
  ('customers', 'לידים חדשים', '{"status":"ליד חדש"}'::jsonb, true, null),
  ('customers', 'לקוחות פעילים', '{"status":"לקוח פעיל"}'::jsonb, true, null),
  ('sales', 'עסקאות פתוחות', '{"stage@in":["ליד חדש","נוצר קשר על ידי AI","שיחת מכירה עם נציג אנושי","הצעה נשלחה","ממתין להחלטה"]}'::jsonb, true, null),
  ('sales', 'ממתינות להחלטה', '{"stage":"ממתין להחלטה"}'::jsonb, true, null),
  ('journeys', 'פתוחות להרשמה', '{"status@in":["פתוח להרשמה","כמעט מלא"]}'::jsonb, true, null),
  ('journeys', 'מסעות בסיכון (מתחת למינימום)', '{"seats_sold@lt":18}'::jsonb, true, null),
  ('registrations', 'ממתינות לתשלום', '{"status@in":["משוריין","שולמה מקדמה"]}'::jsonb, true, null),
  ('registrations', 'שולם במלואו', '{"status":"שולם במלואו"}'::jsonb, true, null);
