-- 054: "ברוך הבא למסע" (welcome aboard), CRM side. Sahar 24/10/2026.
-- See docs/decisions/0011-journey-welcome-messages.md.
--
-- A registration that reaches 'משוריין' gets the seat-reserved template; one
-- that reaches 'שולמה מקדמה' or 'שולם במלואו' gets the welcome template. Sent
-- to the customer AND to every passenger on the registration who has a phone.
-- Each (registration, kind, phone) is sent at most once, ever: flipping the
-- status back and forth, or deposit -> paid in full, never re-sends.
--
-- 1. journey_messages: one row per (registration, kind, phone), the dedupe key
--    and the audit trail (sent / failed / skipped + reason). Only 'sent' is
--    final; skipped (test mode, sale not won yet, missing trip data, no
--    template) and failed are retried by the next event.
-- 2. webhook event 'registration.changed', fired on: registration INSERT or
--    status change into one of the three statuses; a passenger added or given
--    a phone; the linked sale moving to 'נסגר בהצלחה' (the send waits for the
--    sale to be won when whatsapp_journey_require_sale_won = 'true').
-- 3. settings for the two templates.
-- Idempotent.

create table if not exists journey_messages (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references registrations(id) on delete cascade,
  passenger_id uuid references registration_passengers(id) on delete set null,
  kind text not null check (kind in ('seat_reserved', 'welcome')),
  phone text not null,
  recipient_name text,
  -- pending = claimed by a running send (stops a parallel duplicate);
  -- only 'sent' is final. failed / skipped are retried by the next event.
  status text not null check (status in ('pending', 'sent', 'failed', 'skipped')),
  reason text,
  template text,
  user_ns text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registration_id, kind, phone)
);
create index if not exists journey_messages_registration_idx on journey_messages (registration_id);

alter table journey_messages enable row level security;
drop policy if exists journey_messages_select on journey_messages;
create policy journey_messages_select on journey_messages for select
  using (exists (select 1 from registrations r where r.id = journey_messages.registration_id));
grant select on journey_messages to authenticated;

-- Allow the new event on outbound_webhooks.
alter table outbound_webhooks drop constraint if exists outbound_webhooks_event_check;
alter table outbound_webhooks add constraint outbound_webhooks_event_check
  check (event in ('sale.created', 'registration.changed'));

create or replace function fire_registration_webhooks(p_registration_id uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  h outbound_webhooks;
  v_body jsonb;
begin
  select jsonb_build_object(
    'event', 'registration.changed',
    'reason', p_reason,
    'sent_at', now(),
    'registration', jsonb_build_object(
      'id', r.id, 'status', r.status, 'sale_id', r.sale_id,
      'customer_id', r.customer_id, 'journey_id', r.journey_id))
  into v_body
  from registrations r where r.id = p_registration_id;
  if v_body is null then return; end if;
  for h in select * from outbound_webhooks where event = 'registration.changed' and is_active loop
    begin
      perform post_webhook(h, v_body, p_registration_id);
    exception when others then
      insert into webhook_deliveries (webhook_id, event, record_id, error)
        values (h.id, 'registration.changed', p_registration_id, sqlerrm);
    end;
  end loop;
end $$;
revoke all on function fire_registration_webhooks(uuid, text) from public, anon, authenticated;

-- Atomic claim used by cloudchat-bridge before sending: returns the row id
-- only to the one caller allowed to send (no row yet, or a retryable row).
-- A 'pending' row older than 5 minutes counts as abandoned.
create or replace function claim_journey_message(p_registration_id uuid, p_kind text, p_phone text,
  p_passenger_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_id uuid;
begin
  insert into journey_messages (registration_id, kind, phone, passenger_id, recipient_name, status)
  values (p_registration_id, p_kind, p_phone, p_passenger_id, p_name, 'pending')
  on conflict (registration_id, kind, phone) do nothing
  returning id into v_id;
  if v_id is not null then return v_id; end if;
  update journey_messages set status = 'pending', updated_at = now(),
         passenger_id = coalesce(p_passenger_id, passenger_id), recipient_name = coalesce(p_name, recipient_name)
   where registration_id = p_registration_id and kind = p_kind and phone = p_phone
     and (status in ('failed', 'skipped') or (status = 'pending' and updated_at < now() - interval '5 minutes'))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function claim_journey_message(uuid, text, text, uuid, text) from public, anon, authenticated;

create or replace function registrations_fire_journey_webhook()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.deleted_at is null
     and new.status in ('משוריין', 'שולמה מקדמה', 'שולם במלואו')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform fire_registration_webhooks(new.id, 'status:' || new.status);
  end if;
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists registrations_journey_webhook on registrations;
create trigger registrations_journey_webhook after insert or update of status on registrations
  for each row execute function registrations_fire_journey_webhook();

-- A passenger added later (or given a phone later) gets the message of the
-- registration's current status; the dedupe table stops everyone else.
create or replace function passengers_fire_journey_webhook()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  -- The primary passenger is inserted by create_primary_passenger() inside the
  -- registration INSERT, which already fired its own event.
  if tg_op = 'INSERT' and new.is_primary then
    return new;
  end if;
  if nullif(trim(coalesce(new.phone, '')), '') is not null
     and (tg_op = 'INSERT' or old.phone is distinct from new.phone)
     and exists (select 1 from registrations r where r.id = new.registration_id and r.deleted_at is null
                 and r.status in ('משוריין', 'שולמה מקדמה', 'שולם במלואו')) then
    perform fire_registration_webhooks(new.registration_id, 'passenger');
  end if;
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists passengers_journey_webhook on registration_passengers;
create trigger passengers_journey_webhook after insert or update of phone on registration_passengers
  for each row execute function passengers_fire_journey_webhook();

-- Sale won: re-evaluate its registrations (they may have been waiting for it).
create or replace function sales_fire_journey_webhook()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  r record;
begin
  if new.stage = 'נסגר בהצלחה' and old.stage is distinct from new.stage then
    for r in select id from registrations where sale_id = new.id and deleted_at is null
             and status in ('משוריין', 'שולמה מקדמה', 'שולם במלואו') loop
      perform fire_registration_webhooks(r.id, 'sale_won');
    end loop;
  end if;
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists sales_journey_webhook on sales;
create trigger sales_journey_webhook after update of stage on sales
  for each row execute function sales_fire_journey_webhook();

insert into system_settings (key, value) values
  ('whatsapp_welcome_template_name', ''),
  ('whatsapp_welcome_template_lang', 'he'),
  ('whatsapp_welcome_template_params', '{}'),
  ('whatsapp_reserved_template_name', ''),
  ('whatsapp_reserved_template_lang', 'he'),
  ('whatsapp_reserved_template_params', '{}'),
  ('whatsapp_journey_require_sale_won', 'true')
on conflict (key) do nothing;
