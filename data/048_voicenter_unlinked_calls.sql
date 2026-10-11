-- 048: Voicenter calls with numbers not in the CRM (Sahar 11/10/2026).
-- Rule: the sync NEVER creates a lead. A call whose number matches no
-- customer is stored UNLINKED (related_id null) with the other side's number
-- in customer_phone. From the call screen a rep clicks "הקמת ליד", which runs
-- create_lead_from_call(): opens a lead for that number (or reuses a customer
-- that already has it) and links EVERY unlinked call with that number.

-- 1. Unlinked calls
alter table phone_calls alter column related_id drop not null;
alter table phone_calls add column if not exists customer_phone text; -- E.164, the non-TRAX side
create index if not exists phone_calls_customer_phone_idx on phone_calls (customer_phone) where related_id is null;

-- 2. Lead source for leads opened from a call
alter table customers drop constraint if exists customers_lead_source_check;
alter table customers add constraint customers_lead_source_check
  check (lead_source in ('פייסבוק','אינסטגרם','גוגל','אתר TRAX','דף נחיתה','המלצה','אחר','לא מוכר'));
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'sales_lead_source_check') then
    alter table sales drop constraint sales_lead_source_check;
    alter table sales add constraint sales_lead_source_check
      check (lead_source in ('פייסבוק','אינסטגרם','גוגל','אתר TRAX','דף נחיתה','המלצה','אחר','לא מוכר'));
  end if;
end $$;

-- 3. Quick lead from a call. SECURITY DEFINER so linking calls owned by other
-- reps works, but gated on the caller's own customers:create permission.
create or replace function create_lead_from_call(p_call_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_call phone_calls%rowtype;
  v_local text;
  v_customer uuid;
  v_created boolean := false;
  v_sale uuid;
  v_linked int;
  v_note text;
begin
  if not can_access('customers', 'create') then
    raise exception 'אין הרשאה ליצור לקוחות';
  end if;

  select * into v_call from phone_calls where id = p_call_id;
  if not found then raise exception 'השיחה לא נמצאה'; end if;
  if v_call.related_id is not null then raise exception 'השיחה כבר משויכת ללקוח'; end if;
  if coalesce(v_call.customer_phone, '') = '' then raise exception 'אין מספר טלפון בשיחה'; end if;

  v_local := case when v_call.customer_phone like '+972%' then '0' || substr(v_call.customer_phone, 5) else v_call.customer_phone end;

  -- A customer with this number may have been created since the call came in.
  select id into v_customer from customers
   where business_unit = coalesce(v_call.business_unit, 'TRAX') and deleted_at is null
     and mobile_phone in (v_call.customer_phone, v_local, ltrim(v_call.customer_phone, '+'))
   order by created_at desc limit 1;

  if v_customer is null then
    insert into customers (first_name, last_name, mobile_phone, business_unit, lead_source, owner_id, account_manager_id, notes)
    values ('ליד טלפוני', v_local, v_call.customer_phone, coalesce(v_call.business_unit, 'TRAX'), 'לא מוכר',
            auth.uid(), auth.uid(), 'נפתח מתוך שיחת טלפון (Voicenter), המספר לא היה במערכת בעת השיחה.')
    returning id into v_customer;
    v_created := true;
  end if;

  -- OPEN sale else latest (same rule as voicenter-call-sync); the
  -- customers_auto_create_sale trigger already opened one for a new lead.
  select id into v_sale from sales
   where customer_id = v_customer and deleted_at is null
   order by (stage in ('נסגר בהצלחה','עסקה הופסדה')) asc, created_at desc limit 1;

  update phone_calls
     set related_type = 'customer', related_id = v_customer, sale_id = v_sale
   where related_id is null and customer_phone = v_call.customer_phone;
  get diagnostics v_linked = row_count;

  v_note := case when v_created
    then format('הליד נפתח מתוך שיחת טלפון (Voicenter) עם המספר %s, שלא היה במערכת בעת השיחה. שויכו %s שיחות.', v_local, v_linked)
    else format('שויכו %s שיחות טלפון (Voicenter) מהמספר %s.', v_linked, v_local) end;
  insert into notes (related_type, related_id, content, created_by) values ('customer', v_customer, v_note, auth.uid());
  if v_sale is not null then
    insert into notes (related_type, related_id, content, created_by) values ('sale', v_sale, v_note, auth.uid());
  end if;

  return jsonb_build_object('customer_id', v_customer, 'sale_id', v_sale, 'created', v_created, 'linked_calls', v_linked);
end;
$$;

revoke all on function create_lead_from_call(uuid) from public, anon;
grant execute on function create_lead_from_call(uuid) to authenticated;
