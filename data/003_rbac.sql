-- Real RBAC: roles + per-resource permissions (view/create/edit/delete,
-- scope all|mine), replacing the "everyone is owner" stub. Existing users
-- (Goldi, Zarkosh) are backfilled as 'owner' — unaffected by this migration.

create table roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text,
  created_at timestamptz not null default now()
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references roles(id) on delete cascade,
  resource text not null,
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  scope text not null default 'mine' check (scope in ('all','mine')),
  unique (role_id, resource)
);

alter table app_users add column role_id uuid references roles(id);
alter table app_users add column is_active boolean not null default true;

insert into roles (key, label, description) values
  ('owner', 'בעלים', 'גישה מלאה לכל המערכת — גולדי וזרקוש'),
  ('sales_rep', 'נציג מכירות', 'רק עסקאות ולקוחות שהוא הבעלים שלהם, בלי לוחות בקרה כספיים'),
  ('trip_escort', 'מלווה מסע', 'צפייה במסעות והרשמות בלבד, כולל הערות רפואיות ואיש קשר לחירום'),
  ('viewer', 'צפייה בלבד', 'דוחות בלבד, בלי עריכה');

insert into permissions (role_id, resource, can_view, can_create, can_edit, can_delete, scope)
select r.id, res, true, true, true, true, 'all'
from roles r, unnest(array['customers','sales','journeys','registrations','tasks','contacts','meetings','phone_calls','settings','users','dashboard']) res
where r.key = 'owner';

insert into permissions (role_id, resource, can_view, can_create, can_edit, can_delete, scope)
select r.id, res, true, true, true, false, 'mine'
from roles r, unnest(array['customers','sales','tasks']) res
where r.key = 'sales_rep';
insert into permissions (role_id, resource, can_view, can_create, can_edit, can_delete, scope)
select r.id, 'contacts', true, true, true, false, 'mine' from roles r where r.key = 'sales_rep';

insert into permissions (role_id, resource, can_view, can_create, can_edit, can_delete, scope)
select r.id, res, true, false, false, false, 'all'
from roles r, unnest(array['journeys','registrations']) res
where r.key = 'trip_escort';

insert into permissions (role_id, resource, can_view, can_create, can_edit, can_delete, scope)
select r.id, res, true, false, false, false, 'all'
from roles r, unnest(array['customers','sales','journeys','registrations','tasks','dashboard']) res
where r.key = 'viewer';

update app_users set role_id = (select id from roles where key = 'owner') where role_id is null;
alter table app_users alter column role_id set not null;

-- Permission check helper, usable from RLS policies and app code (RPC).
-- p_owner_id: the row's owner_id/assignee_id, for scope='mine' checks.
create or replace function can_access(p_resource text, p_action text, p_owner_id uuid default null)
returns boolean as $$
declare
  v_role_id uuid;
  v_perm record;
begin
  select role_id into v_role_id from app_users where id = auth.uid() and is_active = true;
  if v_role_id is null then return false; end if;

  select * into v_perm from permissions where role_id = v_role_id and resource = p_resource;
  if not found then return false; end if;

  -- 'view' is gated purely on can_view: row-level scoping for 'mine' is
  -- enforced by each table's own RLS policy, not by this gate (see
  -- permissionStore.js). Falling through to the owner-match check below for
  -- 'view' would make every 'mine'-scoped view permission evaluate to false,
  -- since callers rarely have a specific row's owner_id to pass at that point.
  if p_action = 'view' then
    return v_perm.can_view;
  end if;

  case p_action
    when 'create' then if not v_perm.can_create then return false; end if;
    when 'edit' then if not v_perm.can_edit then return false; end if;
    when 'delete' then if not v_perm.can_delete then return false; end if;
    else return false;
  end case;

  if v_perm.scope = 'all' then return true; end if;
  return p_owner_id is not null and p_owner_id = auth.uid();
end;
$$ language plpgsql security definer stable;

alter table roles enable row level security;
create policy roles_select on roles for select to authenticated using (true);

alter table permissions enable row level security;
create policy permissions_select on permissions for select to authenticated using (true);
