-- Managed role labels (תפקיד) and departments (מחלקה): previously hard-coded
-- const arrays in Settings.jsx. Now DB tables so admins can add/edit/delete
-- from the UI, with a live count of users per value (app_users still stores
-- the free-text label for backward compatibility).
create table if not exists role_labels (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Seed from the hard-coded lists so existing users' values stay valid.
insert into role_labels (label, sort_order) values
  ('מנהל מערכת', 0), ('מנהל צוות', 1), ('נציג', 2)
on conflict (label) do nothing;

insert into departments (label, sort_order) values
  ('ניהול', 0), ('מכירות', 1), ('שירות לקוחות', 2)
on conflict (label) do nothing;

alter table role_labels enable row level security;
alter table departments enable row level security;

-- Readable by any signed-in user (dropdowns across the app need it);
-- writable by admins only (permissions 'users' edit — same gate the UI uses).
create policy role_labels_select on role_labels for select using (auth.uid() is not null);
create policy role_labels_write on role_labels for all using (
  exists (select 1 from app_users u where u.id = auth.uid() and u.permission_profile = 'מנהל מערכת')
) with check (
  exists (select 1 from app_users u where u.id = auth.uid() and u.permission_profile = 'מנהל מערכת')
);

create policy departments_select on departments for select using (auth.uid() is not null);
create policy departments_write on departments for all using (
  exists (select 1 from app_users u where u.id = auth.uid() and u.permission_profile = 'מנהל מערכת')
) with check (
  exists (select 1 from app_users u where u.id = auth.uid() and u.permission_profile = 'מנהל מערכת')
);
