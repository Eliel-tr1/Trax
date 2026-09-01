-- One generic test record for Sahar (post-cleanup): customer + sale +
-- 1 meeting + 2 tasks + 3 phone calls + 1 registration (with a second
-- passenger: ירדן עקיבא, age 30) linked to מונטנגרו.
do $$
declare
  v_owner uuid;
  v_customer_id uuid;
  v_sale_id uuid;
  v_registration_id uuid;
  v_journey_id uuid;
  v_passenger_id uuid;
begin
  select id into v_owner from app_users where full_name like '%סער%' limit 1;

  select id into v_journey_id from journeys
  where destination = 'מונטנגרו' and deleted_at is null
  order by departure_date limit 1;

  insert into customers (first_name, last_name, mobile_phone, email, business_unit, status, lead_source, owner_id, account_manager_id)
  values ('סער', 'וינברג', '0533435240', 'sahar@vitrue.co.il', 'TRAX', 'לקוח פעיל', 'אחר', v_owner, v_owner)
  returning id into v_customer_id;

  insert into sales (customer_id, business_unit, deal_name, stage, channel, lead_source, owner_id, journey_id, currency, expected_value, participants_count)
  values (v_customer_id, 'TRAX', 'סער וינברג - מונטנגרו, אוקטובר 2026', 'הצעה נשלחה', 'טלפון', 'אחר', v_owner, v_journey_id, 'EUR', 6129, 2)
  returning id into v_sale_id;

  insert into meetings (subject, related_type, related_id, start_at, duration_minutes, type, business_unit)
  values ('פגישת ייעוץ - סער וינברג', 'sale', v_sale_id, now() + interval '2 days', 45, 'פגישה פיזית', 'TRAX');

  insert into tasks (subject, status, priority, related_type, related_id, assignee_id, business_unit, due_at)
  values ('לשלוח הצעה מעודכנת לסער', 'פתוחה', 'גבוהה', 'sale', v_sale_id, v_owner, 'TRAX', now() + interval '1 day');
  insert into tasks (subject, status, priority, related_type, related_id, assignee_id, business_unit, due_at)
  values ('לתאם שיחת סגירה עם סער', 'פתוחה', 'רגילה', 'sale', v_sale_id, v_owner, 'TRAX', now() + interval '3 days');

  insert into phone_calls (related_type, related_id, direction, occurred_at, duration_seconds, result, assigned_user_id, business_unit)
  values ('customer', v_customer_id, 'יוצאת', now() - interval '2 days', 420, 'נענתה', v_owner, 'TRAX'),
         ('customer', v_customer_id, 'נכנסת', now() - interval '1 day', 180, 'נענתה', v_owner, 'TRAX'),
         ('customer', v_customer_id, 'יוצאת', now() - interval '3 hours', 0, 'לא נענתה', v_owner, 'TRAX');

  insert into registrations (registration_name, customer_id, journey_id, sale_id, status, currency)
  values ('הרשמת סער וינברג - מונטנגרו', v_customer_id, v_journey_id, v_sale_id, 'משוריין', 'EUR')
  returning id into v_registration_id;

  insert into registration_passengers (registration_id, full_name, age, is_primary)
  values (v_registration_id, 'ירדן עקיבא', 30, false)
  returning id into v_passenger_id;

  raise notice 'seeded: customer %, sale %, registration %, passenger %', v_customer_id, v_sale_id, v_registration_id, v_passenger_id;
end $$;