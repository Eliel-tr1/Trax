-- 050: "הקמת ליד" asks for details first (Sahar 11/10/2026). The one-click
-- version created a nameless lead ("ליד טלפוני <number>"). Now the call screen
-- opens a form: full name REQUIRED, email / lead source / note optional, and
-- the RPC refuses to create without a name. Replaces the 1-arg function
-- (dropped so the new defaults cannot make calls ambiguous).

drop function if exists create_lead_from_call(uuid);

create or replace function create_lead_from_call(
  p_call_id uuid,
  p_full_name text,
  p_email text default null,
  p_lead_source text default 'לא מוכר',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_call phone_calls%rowtype;
  v_local text;
  v_name text := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
  v_first text;
  v_last text;
  v_customer uuid;
  v_created boolean := false;
  v_sale uuid;
  v_linked int;
  v_note text;
begin
  -- can_access has 3- and 4-arg overloads; 2 args is ambiguous (42725)
  if not can_access('customers'::text, 'create'::text, null::uuid, null::uuid) then
    raise exception 'אין הרשאה ליצור לקוחות';
  end if;
  if v_name = '' then raise exception 'יש להזין שם מלא'; end if;

  select * into v_call from phone_calls where id = p_call_id;
  if not found then raise exception 'השיחה לא נמצאה'; end if;
  if v_call.related_id is not null then raise exception 'השיחה כבר משויכת ללקוח'; end if;
  if coalesce(v_call.customer_phone, '') = '' then raise exception 'אין מספר טלפון בשיחה'; end if;

  v_local := case when v_call.customer_phone like '+972%' then '0' || substr(v_call.customer_phone, 5) else v_call.customer_phone end;
  v_first := split_part(v_name, ' ', 1);
  v_last := btrim(substr(v_name, length(v_first) + 1));

  -- A customer with this number may have been created since the call came in.
  select id into v_customer from customers
   where business_unit = coalesce(v_call.business_unit, 'TRAX') and deleted_at is null
     and mobile_phone in (v_call.customer_phone, v_local, ltrim(v_call.customer_phone, '+'))
   order by created_at desc limit 1;

  if v_customer is null then
    insert into customers (first_name, last_name, mobile_phone, email, business_unit, lead_source, owner_id, account_manager_id, notes)
    values (v_first, v_last, v_call.customer_phone, nullif(btrim(coalesce(p_email, '')), ''),
            coalesce(v_call.business_unit, 'TRAX'), coalesce(nullif(p_lead_source, ''), 'לא מוכר'),
            auth.uid(), auth.uid(), nullif(btrim(coalesce(p_note, '')), ''))
    returning id into v_customer;
    v_created := true;
  end if;

  select id into v_sale from sales
   where customer_id = v_customer and deleted_at is null
   order by (stage in ('נסגר בהצלחה','עסקה הופסדה')) asc, created_at desc limit 1;

  -- sales mirror their customer's lead_source (043); the auto-sale trigger leaves it null
  if v_created and v_sale is not null then
    update sales set lead_source = coalesce(nullif(p_lead_source, ''), 'לא מוכר') where id = v_sale and lead_source is null;
  end if;

  update phone_calls
     set related_type = 'customer', related_id = v_customer, sale_id = v_sale
   where related_id is null and customer_phone = v_call.customer_phone;
  get diagnostics v_linked = row_count;

  v_note := case when v_created
    then format('הליד נפתח מתוך שיחת טלפון (Voicenter) עם המספר %s, שלא היה במערכת בעת השיחה. שויכו %s שיחות.', v_local, v_linked)
    else format('שויכו %s שיחות טלפון (Voicenter) מהמספר %s.', v_linked, v_local) end;
  if nullif(btrim(coalesce(p_note, '')), '') is not null then
    v_note := v_note || E'\n' || 'הערה: ' || btrim(p_note);
  end if;
  insert into notes (related_type, related_id, content, created_by) values ('customer', v_customer, v_note, auth.uid());
  if v_sale is not null then
    insert into notes (related_type, related_id, content, created_by) values ('sale', v_sale, v_note, auth.uid());
  end if;

  return jsonb_build_object('customer_id', v_customer, 'sale_id', v_sale, 'created', v_created, 'linked_calls', v_linked);
end;
$$;

revoke all on function create_lead_from_call(uuid, text, text, text, text) from public, anon;
grant execute on function create_lead_from_call(uuid, text, text, text, text) to authenticated;
