-- Two bespoke automations, built as Postgres triggers rather than through
-- the generic automation_rules engine (data/002_automation_engine.sql),
-- because that engine only supports simple field-equality conditions on
-- the SAME row plus create_record/notify actions — it can't write a
-- literal note, touch a *different* table's row (a sale, from a meeting
-- update), or pick "nearest upcoming journey" as a default. Both follow
-- the create_primary_passenger (data/013) pattern: SECURITY DEFINER so
-- they don't hit the exact automation_dispatch RLS bug fixed in
-- data/019 (writes on behalf of the system must not depend on the
-- calling user's own INSERT/UPDATE permissions).
--
-- Applied live via Supabase MCP apply_migration on 01.09.2026; this file
-- mirrors it in the repo per the numbered-migration convention.

-- ---------------------------------------------------------------------
-- 1. meetings gets an "occurred" signal. Nothing on the table captures
--    this today (no status/occurred column) — added following the same
--    enum-column convention as tasks.status / journeys.status.
-- ---------------------------------------------------------------------
alter table meetings add column if not exists status text not null default 'מתוכננה'
  check (status in ('מתוכננה','התקיימה','לא התקיימה','בוטלה'));

-- ---------------------------------------------------------------------
-- 2. No-show meeting on a sale -> auto follow-up.
--    Fires only on the transition INTO 'לא התקיימה' (the WHEN clause),
--    so re-saving an already-no-show meeting doesn't re-fire it. Skips
--    sales already closed (won/lost) — a no-show shouldn't reopen a
--    deal that's already resolved.
-- ---------------------------------------------------------------------
create or replace function public.meeting_noshow_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_sale record;
begin
  select id, stage, owner_id, business_unit
    into v_sale
    from sales
    where id = new.related_id and deleted_at is null;

  if not found then
    return new;
  end if;

  if v_sale.stage in ('נסגר בהצלחה','עסקה הופסדה') then
    return new;
  end if;

  update sales set stage = 'פולואפ' where id = v_sale.id;

  insert into notes (related_type, related_id, content, created_by)
  values (
    'sale', v_sale.id,
    $txt$סטטוס תהליך המכירה השתנה אוטומטית ל'פולואפ' כי הפגישה לא התקיימה ולכן הסטטוס שלה כבר לא נכון$txt$,
    auth.uid()
  );

  insert into tasks (subject, related_type, related_id, assignee_id, due_at, business_unit)
  values ('לתאם מחדש', 'sale', v_sale.id, v_sale.owner_id, now(), v_sale.business_unit);

  return new;
end;
$func$;

drop trigger if exists meetings_noshow_dispatch on meetings;
create trigger meetings_noshow_dispatch
after update on meetings
for each row
when (new.related_type = 'sale' and new.status = 'לא התקיימה' and old.status is distinct from new.status)
execute function public.meeting_noshow_dispatch();

-- ---------------------------------------------------------------------
-- 3. New customer (any insert path — manual UI form, api-v1, Max AI
--    agent, WF05a) with no open sale yet gets one auto-created, mirroring
--    wf05a-crm-sync's own create-branch defaults (nearest upcoming
--    journey by departure_date, next_call_at = now). The "no open sale
--    yet" guard is what keeps this from double-creating for WF05a: that
--    function inserts the customer first and the sale a moment later —
--    by the time it searches for an open sale, this trigger has already
--    created one (same transaction as the customer insert), so WF05a's
--    own follow-up call updates that sale instead of inserting a second
--    one. Same principle as create_primary_passenger's "already exists"
--    guard (data/013), just checked against a sibling table instead of
--    the same row.
-- ---------------------------------------------------------------------
create or replace function public.customer_auto_create_sale()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_open_sale_id uuid;
  v_journey_id uuid;
begin
  select id into v_open_sale_id
    from sales
    where customer_id = new.id
      and deleted_at is null
      and stage not in ('נסגר בהצלחה','עסקה הופסדה')
    limit 1;

  if v_open_sale_id is not null then
    return new;
  end if;

  select id into v_journey_id
    from journeys
    where business_unit = new.business_unit
      and departure_date >= current_date
      and deleted_at is null
    order by departure_date asc
    limit 1;

  insert into sales (customer_id, business_unit, journey_id, owner_id, next_call_at)
  values (new.id, new.business_unit, v_journey_id, new.account_manager_id, now());

  return new;
end;
$func$;

drop trigger if exists customers_auto_create_sale on customers;
create trigger customers_auto_create_sale
after insert on customers
for each row
execute function public.customer_auto_create_sale();
