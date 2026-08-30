-- Generic automation-rules engine + notifications + settings-as-data.
-- See docs/decisions/0003-generic-automation-and-api-layer.md for why.

create table system_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);
insert into system_settings (key, value) values
  ('system_name', 'TRAX CRM'),
  ('system_logo_url', '');

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  text text not null,
  type text,
  related_type text,
  related_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_unread_idx on notifications (user_id) where is_read = false;

create table automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  object_name text not null check (object_name in ('customers','sales','journeys','registrations')),
  is_active boolean not null default true,
  trigger_event text not null check (trigger_event in ('create','update','schedule')),
  trigger_fields text[],
  schedule_cron text,
  conditions jsonb not null default '{"match":"all","rules":[]}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table automation_logs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references automation_rules(id),
  record_id uuid,
  status text not null check (status in ('success','failed','skipped')),
  message text,
  executed_at timestamptz not null default now()
);
create index automation_logs_rule_idx on automation_logs (rule_id, executed_at desc);

-- Generic dispatch: evaluates active rules for (object_name, trigger_event)
-- against NEW/OLD, with a depth guard against rule-triggered-rule loops.
create or replace function automation_dispatch() returns trigger as $$
declare
  v_object text := tg_table_name;
  v_event text := case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'update' end;
  -- current_setting(..., true) returns '' (not NULL) on a pooled connection
  -- that already used this custom GUC once this session — nullif first.
  v_depth int := coalesce(nullif(current_setting('trax.automation_depth', true), '')::int, 0);
  r record;
  rule_cond record;
  passes boolean;
  field_val text;
  act jsonb;
  v_notify_user uuid;
begin
  if v_depth >= 3 then
    insert into automation_logs (rule_id, record_id, status, message)
      values (null, new.id, 'skipped', 'max automation depth reached');
    return new;
  end if;

  for r in
    select * from automation_rules
    where object_name = v_object and trigger_event = v_event and is_active = true
  loop
    if v_event = 'update' and r.trigger_fields is not null and array_length(r.trigger_fields, 1) > 0 then
      passes := false;
      for i in 1..array_length(r.trigger_fields, 1) loop
        if to_jsonb(old) ->> r.trigger_fields[i] is distinct from to_jsonb(new) ->> r.trigger_fields[i] then
          passes := true;
        end if;
      end loop;
      if not passes then continue; end if;
    end if;

    passes := true;
    if r.conditions -> 'rules' is not null then
      for rule_cond in select * from jsonb_to_recordset(r.conditions -> 'rules') as x(field text, op text, value text)
      loop
        field_val := to_jsonb(new) ->> rule_cond.field;
        case rule_cond.op
          when 'eq' then if field_val is distinct from rule_cond.value then passes := false; end if;
          when 'neq' then if field_val is not distinct from rule_cond.value then passes := false; end if;
          when 'is_empty' then if field_val is not null and field_val <> '' then passes := false; end if;
          when 'is_not_empty' then if field_val is null or field_val = '' then passes := false; end if;
          else null;
        end case;
      end loop;
    end if;

    if not passes then
      insert into automation_logs (rule_id, record_id, status, message) values (r.id, new.id, 'skipped', 'conditions not met');
      continue;
    end if;

    begin
      perform set_config('trax.automation_depth', (v_depth + 1)::text, true);
      for act in select * from jsonb_array_elements(r.actions)
      loop
        if act ->> 'type' = 'create_record' and act ->> 'object' = 'tasks' then
          insert into tasks (subject, related_type, related_id, due_at, business_unit)
          values (
            coalesce(act -> 'values' ->> 'subject', r.name),
            v_object::text,
            new.id,
            case when act -> 'values' ->> 'due_at' = '{{tomorrow}}' then (now() + interval '1 day') else now() end,
            to_jsonb(new) ->> 'business_unit'
          );
        elsif act ->> 'type' = 'notify' then
          -- field-safe: owner_id/assignee_id may or may not exist on this table's row type
          v_notify_user := nullif(coalesce(to_jsonb(new) ->> 'owner_id', to_jsonb(new) ->> 'assignee_id'), '')::uuid;
          if v_notify_user is not null then
            insert into notifications (user_id, text, type, related_type, related_id)
            values (v_notify_user, coalesce(act ->> 'message', r.name), 'automation', v_object, new.id);
          end if;
        end if;
      end loop;
      insert into automation_logs (rule_id, record_id, status) values (r.id, new.id, 'success');
    exception when others then
      insert into automation_logs (rule_id, record_id, status, message) values (r.id, new.id, 'failed', sqlerrm);
    end;
  end loop;

  perform set_config('trax.automation_depth', v_depth::text, true);
  return new;
end;
$$ language plpgsql;

create trigger customers_automation after insert or update on customers
  for each row execute function automation_dispatch();
create trigger sales_automation after insert or update on sales
  for each row execute function automation_dispatch();

alter table system_settings enable row level security;
create policy system_settings_select on system_settings for select to authenticated using (true);
create policy system_settings_update on system_settings for update to authenticated using (true) with check (true);

alter table notifications enable row level security;
create policy notifications_select on notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_insert on notifications for insert to authenticated with check (true);

alter table automation_rules enable row level security;
create policy automation_rules_select on automation_rules for select to authenticated using (true);
create policy automation_rules_insert on automation_rules for insert to authenticated with check (true);
create policy automation_rules_update on automation_rules for update to authenticated using (true) with check (true);
create policy automation_rules_delete on automation_rules for delete to authenticated using (true);

alter table automation_logs enable row level security;
create policy automation_logs_select on automation_logs for select to authenticated using (true);

-- Seed the three documented Wave-2 follow-up-task rules (dormant until sales/customers get real traffic)
insert into automation_rules (name, object_name, trigger_event, trigger_fields, conditions, actions) values
(
  'משימת מעקב לתאריך שיחה הבאה',
  'sales', 'update', array['stage'],
  '{"match":"all","rules":[{"field":"stage","op":"eq","value":"ממתין להחלטה"}]}'::jsonb,
  '[{"type":"create_record","object":"tasks","values":{"subject":"מעקב: תאריך שיחה הבאה"}}]'::jsonb
),
(
  'התראה בסגירה מוצלחת',
  'sales', 'update', array['stage'],
  '{"match":"all","rules":[{"field":"stage","op":"eq","value":"נסגר בהצלחה"}]}'::jsonb,
  '[{"type":"notify","message":"עסקה נסגרה בהצלחה"}]'::jsonb
),
(
  'התראה על ליד חדש',
  'customers', 'create', null,
  '{"match":"all","rules":[]}'::jsonb,
  '[{"type":"notify","message":"התקבל ליד חדש"}]'::jsonb
);
