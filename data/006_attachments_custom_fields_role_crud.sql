-- File attachments on notes, admin-defined custom fields + picklists, and
-- making roles/permissions genuinely editable (create/edit/delete role,
-- not just a read-only matrix) — see docs/bina-crm-feature-audit.md.

alter table notes add column if not exists file_url text;
alter table notes add column if not exists file_name text;
alter table notes add column if not exists file_type text;
alter table notes add column if not exists file_size int;

insert into storage.buckets (id, name, public) values ('attachments', 'attachments', true)
on conflict (id) do nothing;

create policy "attachments_public_read" on storage.objects for select
  using (bucket_id = 'attachments');
create policy "attachments_authenticated_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments');
create policy "attachments_authenticated_update" on storage.objects for update to authenticated
  using (bucket_id = 'attachments');
create policy "attachments_authenticated_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments');

create table custom_fields (
  id uuid primary key default gen_random_uuid(),
  object_type text not null,
  key text not null,
  label text not null,
  type text not null check (type in ('text','number','date','select','checkbox')),
  options text[] default '{}',
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (object_type, key)
);

create table picklists (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text,
  options text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table custom_fields enable row level security;
create policy custom_fields_select on custom_fields for select to authenticated using (true);
create policy custom_fields_insert on custom_fields for insert to authenticated with check (can_access('settings','create'));
create policy custom_fields_update on custom_fields for update to authenticated using (can_access('settings','edit'));
create policy custom_fields_delete on custom_fields for delete to authenticated using (can_access('settings','delete'));

alter table picklists enable row level security;
create policy picklists_select on picklists for select to authenticated using (true);
create policy picklists_update on picklists for update to authenticated using (can_access('settings','edit'));

create policy roles_insert on roles for insert to authenticated with check (can_access('users','create'));
create policy roles_update on roles for update to authenticated using (can_access('users','edit'));
create policy roles_delete on roles for delete to authenticated using (can_access('users','delete'));

create policy permissions_insert on permissions for insert to authenticated with check (can_access('users','edit'));
create policy permissions_update on permissions for update to authenticated using (can_access('users','edit'));
create policy permissions_delete on permissions for delete to authenticated using (can_access('users','edit'));

-- Profile richness: sidebar nav customization + phone field.
alter table app_users add column if not exists prefs jsonb not null default '{}'::jsonb;
alter table app_users add column if not exists phone text;
