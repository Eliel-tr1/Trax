-- Nearest OPEN journey default (client rule, Sahar 05.09): the customer_auto_
-- create_sale trigger and any future defaulting must pick the nearest journey
-- whose status is 'פתוח להרשמה', not merely the nearest upcoming date —
-- planning-stage journeys aren't open for registration (that's how Montenegro
-- kept being picked over Madeira).
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
      and status = 'פתוח להרשמה'
      and departure_date >= current_date
      and deleted_at is null
    order by departure_date asc
    limit 1;

  insert into sales (customer_id, business_unit, journey_id, owner_id, next_call_at)
  values (new.id, new.business_unit, v_journey_id, new.account_manager_id, now());
  return new;
end;
$func$;