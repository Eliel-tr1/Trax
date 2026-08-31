-- Max (מקס) — floating AI assistant. Sessions + messages, scoped to the
-- signed-in user, same "own rows only" RLS shape as saved_views/notifications
-- (auth.uid() = user_id) rather than can_access() — this is personal chat
-- history, not a shared business object like customers/sales.

create table max_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  title text not null default 'שיחה חדשה',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table max_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references max_sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  -- Transient "thinking"/search-trail lines shown above the answer while it
  -- was generated (e.g. ["בודק את יישות הלידים…", "סופר…"]) — kept alongside
  -- the message so re-opening a session still shows what Max checked.
  trail jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index max_sessions_user_id_idx on max_sessions(user_id);
create index max_messages_session_id_idx on max_messages(session_id, created_at);

alter table max_sessions enable row level security;
alter table max_messages enable row level security;

create policy max_sessions_select on max_sessions for select to authenticated
  using (user_id = auth.uid());
create policy max_sessions_insert on max_sessions for insert to authenticated
  with check (user_id = auth.uid());
create policy max_sessions_update on max_sessions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy max_sessions_delete on max_sessions for delete to authenticated
  using (user_id = auth.uid());

-- Messages are reached only through their session, so the check simply
-- verifies the parent session belongs to the caller.
create policy max_messages_select on max_messages for select to authenticated
  using (exists (select 1 from max_sessions s where s.id = session_id and s.user_id = auth.uid()));
create policy max_messages_insert on max_messages for insert to authenticated
  with check (exists (select 1 from max_sessions s where s.id = session_id and s.user_id = auth.uid()));
create policy max_messages_delete on max_messages for delete to authenticated
  using (exists (select 1 from max_sessions s where s.id = session_id and s.user_id = auth.uid()));
