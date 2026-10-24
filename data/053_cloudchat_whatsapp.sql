-- 053: WhatsApp AI agent (CloudChat) integration, CRM side.
-- Sahar 24/10/2026. See docs/decisions/0010-cloudchat-whatsapp-agent.md.
--
-- 1. pg_net, for the outbound "sale created" webhook.
-- 2. Customer fields: CloudChat subscriber id (user_ns) + live chat link,
--    the create-form choice "send a new-lead WhatsApp" (copied to the
--    auto-created sale), and a do-not-contact flag.
-- 3. Sale fields: the per-sale send choice and the AI conversation status.
-- 4. outbound_webhooks + webhook_deliveries, and the AFTER INSERT trigger on
--    sales that posts to every active 'sale.created' webhook.
-- 5. Hand-off: a sale moved to 'שיחת מכירה עם נציג אנושי' after an AI
--    conversation gets a call task + a notification for its owner.
-- 6. system_settings rows for the WhatsApp template and the test mode.
-- Idempotent: safe to run twice.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------- columns
alter table customers
  add column if not exists cloudchat_user_ns text,
  add column if not exists cloudchat_chat_url text,
  add column if not exists send_lead_whatsapp boolean not null default true,
  add column if not exists whatsapp_opt_out boolean not null default false,
  add column if not exists whatsapp_opt_out_at timestamptz;

alter table sales
  add column if not exists send_lead_whatsapp boolean not null default true,
  add column if not exists ai_chat_status text,
  add column if not exists ai_chat_status_at timestamptz,
  add column if not exists ai_message_sent_at timestamptz,
  add column if not exists ai_first_reply_at timestamptz,
  add column if not exists ai_send_error text,
  add column if not exists ai_noreply_task_at timestamptz,
  add column if not exists ai_handoff_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sales_ai_chat_status_check') then
    alter table sales add constraint sales_ai_chat_status_check
      check (ai_chat_status is null or ai_chat_status in ('נשלחה הודעה', 'ענה לסוכן', 'השליחה נכשלה'));
  end if;
end $$;

create index if not exists sales_ai_chat_status_idx on sales (ai_chat_status) where deleted_at is null;
create index if not exists customers_cloudchat_user_ns_idx on customers (cloudchat_user_ns);

-- Stamp ai_chat_status_at whenever the status changes (any writer: n8n,
-- the bridge function, the UI).
create or replace function stamp_ai_chat_status_at()
returns trigger language plpgsql as $$
begin
  if new.ai_chat_status is distinct from old.ai_chat_status then
    new.ai_chat_status_at := now();
  end if;
  return new;
end $$;
drop trigger if exists sales_ai_chat_status_at on sales;
create trigger sales_ai_chat_status_at before update of ai_chat_status on sales
  for each row execute function stamp_ai_chat_status_at();

-- Opt-out timestamp.
create or replace function stamp_whatsapp_opt_out_at()
returns trigger language plpgsql as $$
begin
  if new.whatsapp_opt_out and not coalesce(old.whatsapp_opt_out, false) then
    new.whatsapp_opt_out_at := now();
  elsif not new.whatsapp_opt_out then
    new.whatsapp_opt_out_at := null;
  end if;
  return new;
end $$;
drop trigger if exists customers_whatsapp_opt_out_at on customers;
create trigger customers_whatsapp_opt_out_at before update of whatsapp_opt_out on customers
  for each row execute function stamp_whatsapp_opt_out_at();

-- The auto-created sale inherits the customer's create-form choice.
-- Only change vs. the live version: send_lead_whatsapp in the insert.
create or replace function public.customer_auto_create_sale()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  insert into sales (customer_id, business_unit, journey_id, owner_id, next_call_at, send_lead_whatsapp)
  values (new.id, new.business_unit, v_journey_id, new.account_manager_id, now(), coalesce(new.send_lead_whatsapp, true));
  return new;
end;
$function$;

-- ---------------------------------------------------------------- webhooks
create table if not exists outbound_webhooks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event text not null check (event in ('sale.created')),
  url text not null check (url ~ '^https://'),
  secret text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table if not exists webhook_deliveries (
  id bigserial primary key,
  webhook_id uuid references outbound_webhooks(id) on delete cascade,
  event text not null,
  record_id uuid,
  request_id bigint,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists webhook_deliveries_created_idx on webhook_deliveries (created_at desc);

alter table outbound_webhooks enable row level security;
alter table webhook_deliveries enable row level security;

drop policy if exists outbound_webhooks_select on outbound_webhooks;
drop policy if exists outbound_webhooks_insert on outbound_webhooks;
drop policy if exists outbound_webhooks_update on outbound_webhooks;
drop policy if exists outbound_webhooks_delete on outbound_webhooks;
create policy outbound_webhooks_select on outbound_webhooks for select
  using (can_access('settings'::text, 'view'::text, null::uuid, null::uuid));
create policy outbound_webhooks_insert on outbound_webhooks for insert
  with check (can_access('settings'::text, 'create'::text, null::uuid, null::uuid));
create policy outbound_webhooks_update on outbound_webhooks for update
  using (can_access('settings'::text, 'edit'::text, null::uuid, null::uuid))
  with check (can_access('settings'::text, 'edit'::text, null::uuid, null::uuid));
create policy outbound_webhooks_delete on outbound_webhooks for delete
  using (can_access('settings'::text, 'delete'::text, null::uuid, null::uuid));

drop policy if exists webhook_deliveries_select on webhook_deliveries;
create policy webhook_deliveries_select on webhook_deliveries for select
  using (can_access('settings'::text, 'view'::text, null::uuid, null::uuid));

grant select, insert, update, delete on outbound_webhooks to authenticated;
grant select on webhook_deliveries to authenticated;

-- Payload for one sale: the sale, its customer and its journey. The
-- consumer should still re-read the sale through api-v1 after a short wait:
-- lead intake PATCHes the auto-created sale (journey, source, UTM) in a
-- later request than the INSERT that fires this.
create or replace function sale_webhook_payload(p_sale_id uuid, p_event text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'event', p_event,
    'sent_at', now(),
    'sale', jsonb_build_object(
      'id', s.id, 'deal_name', s.deal_name, 'stage', s.stage,
      'business_unit', s.business_unit, 'lead_source', s.lead_source,
      'channel', s.channel, 'campaign', s.campaign,
      'owner_id', s.owner_id, 'owner_name', u.full_name,
      'send_lead_whatsapp', s.send_lead_whatsapp,
      'ai_chat_status', s.ai_chat_status, 'created_at', s.created_at,
      'url', b.base || '/#/sales/' || s.id),
    'customer', jsonb_build_object(
      'id', c.id, 'first_name', c.first_name, 'last_name', c.last_name,
      'full_name', trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')),
      'mobile_phone', c.mobile_phone,
      'phone_digits', nullif(regexp_replace(coalesce(c.mobile_phone, ''), '\D', '', 'g'), ''),
      'email', c.email, 'status', c.status,
      'cloudchat_user_ns', c.cloudchat_user_ns,
      'whatsapp_opt_out', c.whatsapp_opt_out,
      'url', b.base || '/#/customers/' || c.id),
    'journey', case when j.id is null then null else jsonb_build_object(
      'id', j.id, 'name', j.name, 'destination', j.destination,
      'departure_date', j.departure_date, 'page_url', j.page_url) end,
    'send_whatsapp', coalesce(s.send_lead_whatsapp, true) and not coalesce(c.whatsapp_opt_out, false)
  )
  from sales s
  left join customers c on c.id = s.customer_id
  left join journeys j on j.id = s.journey_id
  left join app_users u on u.id = s.owner_id
  cross join (select coalesce((select nullif(value, '') from system_settings where key = 'crm_public_url'), 'https://app.trax-club.com') as base) b
  where s.id = p_sale_id
$$;
revoke all on function sale_webhook_payload(uuid, text) from public, anon, authenticated;

create or replace function post_webhook(p_hook outbound_webhooks, p_body jsonb, p_record uuid)
returns bigint language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare
  v_req bigint;
begin
  v_req := net.http_post(
    url := p_hook.url,
    body := p_body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Trax-Event', p_body ->> 'event',
      'X-Trax-Webhook-Secret', coalesce(p_hook.secret, '')),
    timeout_milliseconds := 10000);
  insert into webhook_deliveries (webhook_id, event, record_id, request_id)
    values (p_hook.id, p_body ->> 'event', p_record, v_req);
  return v_req;
exception when others then
  insert into webhook_deliveries (webhook_id, event, record_id, error)
    values (p_hook.id, p_body ->> 'event', p_record, sqlerrm);
  return null;
end $$;
revoke all on function post_webhook(outbound_webhooks, jsonb, uuid) from public, anon, authenticated;

-- Never blocks the sale insert: any failure is logged in webhook_deliveries.
create or replace function sales_fire_created_webhooks()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  h outbound_webhooks;
  v_body jsonb;
begin
  for h in select * from outbound_webhooks where event = 'sale.created' and is_active loop
    begin
      v_body := sale_webhook_payload(new.id, 'sale.created');
      perform post_webhook(h, v_body, new.id);
    exception when others then
      insert into webhook_deliveries (webhook_id, event, record_id, error)
        values (h.id, 'sale.created', new.id, sqlerrm);
    end;
  end loop;
  return new;
end $$;
drop trigger if exists sales_created_webhook on sales;
create trigger sales_created_webhook after insert on sales
  for each row execute function sales_fire_created_webhooks();

-- Settings > "וואטסאפ וסוכן AI": test button. Sends a 'test' event with the
-- newest sale as sample data, so nothing is created.
create or replace function send_test_webhook(p_webhook_id uuid)
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare
  h outbound_webhooks;
  v_sale uuid;
begin
  if not can_access('settings'::text, 'edit'::text, null::uuid, null::uuid) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select * into h from outbound_webhooks where id = p_webhook_id;
  if h.id is null then raise exception 'webhook not found'; end if;
  select id into v_sale from sales where deleted_at is null order by created_at desc limit 1;
  return post_webhook(h, sale_webhook_payload(v_sale, 'test'), v_sale);
end $$;
revoke all on function send_test_webhook(uuid) from public, anon;
grant execute on function send_test_webhook(uuid) to authenticated;

-- Delivery log with the HTTP result from pg_net (kept about 6 hours by pg_net).
create or replace function webhook_delivery_log(p_limit int default 30)
returns table (id bigint, webhook_id uuid, event text, record_id uuid, created_at timestamptz,
               status_code int, error text)
language plpgsql stable security definer set search_path to 'public', 'extensions' as $$
begin
  if not can_access('settings'::text, 'view'::text, null::uuid, null::uuid) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return query
    select d.id, d.webhook_id, d.event, d.record_id, d.created_at,
           r.status_code, coalesce(d.error, r.error_msg)
    from webhook_deliveries d
    left join net._http_response r on r.id = d.request_id
    order by d.created_at desc
    limit least(greatest(p_limit, 1), 200);
end $$;
revoke all on function webhook_delivery_log(int) from public, anon;
grant execute on function webhook_delivery_log(int) to authenticated;

-- ---------------------------------------------------------------- hand-off
-- Max (the WhatsApp agent) hands a qualified lead to a person by PATCHing the
-- sale through api-v1: stage 'שיחת מכירה עם נציג אנושי' plus
-- qualification_rating / qualification_summary. The sales owner gets a call
-- task and a notification, once per sale.
create or replace function sales_ai_handoff()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.stage = 'שיחת מכירה עם נציג אנושי'
     and old.stage is distinct from new.stage
     and new.ai_chat_status is not null
     and new.ai_handoff_at is null then
    new.ai_handoff_at := now();
    insert into tasks (subject, related_type, related_id, assignee_id, due_at, status, priority, description, business_unit)
    values ('מקס העביר ליד לנציג: להתקשר', 'sale', new.id, new.owner_id, now(), 'פתוחה', 'גבוהה',
            nullif(concat_ws(E'\n',
              case when new.qualification_rating is not null then 'דירוג הסמכה: ' || new.qualification_rating end,
              new.qualification_summary), ''),
            new.business_unit);
    if new.owner_id is not null then
      insert into notifications (user_id, text, type, related_type, related_id)
      values (new.owner_id, 'מקס סיים שיחה עם ליד והעביר אותו אליך', 'automation', 'sales', new.id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists sales_ai_handoff on sales;
create trigger sales_ai_handoff before update of stage on sales
  for each row execute function sales_ai_handoff();

-- ---------------------------------------------------------------- settings
insert into system_settings (key, value) values
  ('whatsapp_lead_template_name', ''),
  ('whatsapp_lead_template_lang', 'he'),
  ('whatsapp_lead_template_params', '{}'),
  ('whatsapp_test_mode', 'true'),
  ('whatsapp_test_phones', '+972533435240'),
  ('whatsapp_dedupe_days', '7'),
  ('whatsapp_noreply_hours', '24'),
  ('crm_public_url', 'https://staging.trax-crm.pages.dev')
on conflict (key) do nothing;
