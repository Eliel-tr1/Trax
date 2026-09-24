-- 047: push notification preferences per user (Sahar 16.09, OneSignal).
-- One row per app_user; boolean toggle per notification category so the
-- settings screen (עדכן OneSignal-Settings.jsx) can list them. Categories
-- are a fixed, small set matched to what edge functions actually trigger
-- on -- add a column here whenever a new trigger type ships, not a
-- separate table (this stays a single-row-per-user preference sheet).
create table notification_preferences (
  user_id uuid primary key references app_users(id) on delete cascade,
  task_assigned boolean not null default true,
  task_due_soon boolean not null default true,
  meeting_reminder boolean not null default true,
  new_lead boolean not null default true,
  sale_stage_changed boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table notification_preferences enable row level security;

-- Everyone can read/write only their own preference row.
create policy notification_preferences_self on notification_preferences
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Service role (edge functions) bypasses RLS by default, no extra policy needed.