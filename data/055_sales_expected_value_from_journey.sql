-- 055: a sale's שווי צפוי and מטבע fill themselves from the requested journey
-- (Sahar 24/10/2026): expected_value = journeys.price_per_person x
-- sales.participants_count, currency = journeys.currency.
--
-- Fires on INSERT and when journey_id or participants_count CHANGES, from
-- any source (CRM screen, api-v1, Max, lead-intake). Editing expected_value
-- by hand afterwards is kept: the trigger does not fire on that column, so a
-- manual value only gets replaced when the journey or the head count changes.
-- No participants_count yet: only the currency is set (value left as is).
-- Journey without a price: nothing is touched except the currency.

create or replace function public.sales_expected_value_from_journey()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  j record;
begin
  if tg_op = 'UPDATE'
     and new.journey_id is not distinct from old.journey_id
     and new.participants_count is not distinct from old.participants_count then
    return new;
  end if;
  if new.journey_id is null then
    return new;
  end if;
  select price_per_person, currency into j from journeys where id = new.journey_id;
  if not found then
    return new;
  end if;
  if j.currency is not null then
    new.currency := j.currency;
  end if;
  if j.price_per_person is not null and coalesce(new.participants_count, 0) > 0 then
    new.expected_value := j.price_per_person * new.participants_count;
  end if;
  return new;
end;
$$;

drop trigger if exists sales_expected_value on public.sales;
create trigger sales_expected_value
  before insert or update of journey_id, participants_count on public.sales
  for each row execute function public.sales_expected_value_from_journey();
