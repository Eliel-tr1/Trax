-- RBAC row-scope fix (027) — CORRECTED draft. `participants` is uuid[];
-- the proper containment check is auth.uid() = any(participants), and there
-- is no permissions_scope_all() helper — scope lives in permissions.scope.
-- This version uses a small inline SQL subselect for the scope='all' check.

-- registrations: scope through the parent sale's owner_id.
drop policy if exists registrations_select on registrations;
create policy registrations_select on registrations for select
  using (can_access('registrations', 'view', (select s.owner_id from sales s where s.id = registrations.sale_id)));

drop policy if exists registrations_update on registrations;
create policy registrations_update on registrations for update
  using (can_access('registrations', 'edit', (select s.owner_id from sales s where s.id = registrations.sale_id)));

-- meetings: participants is a real uuid[] column — direct ANY() containment.
drop policy if exists meetings_select on meetings;
create policy meetings_select on meetings for select
  using (can_access('meetings', 'view') and (
    coalesce((select p.scope from permissions p
      join app_users u on u.role_id = p.role_id
      where u.id = auth.uid() and p.resource = 'meetings'), 'mine') <> 'mine'
    or auth.uid() = any(participants)
  ));

-- phone_calls: assigned rep sees own calls; scope='all' sees everything.
drop policy if exists phone_calls_select on phone_calls;
create policy phone_calls_select on phone_calls for select
  using (can_access('phone_calls', 'view') and (
    coalesce((select p.scope from permissions p
      join app_users u on u.role_id = p.role_id
      where u.id = auth.uid() and p.resource = 'phone_calls'), 'mine') <> 'mine'
    or assigned_user_id = auth.uid()
  ));

-- journeys: catalog data — view-gated, not row-scoped (deliberate; see 027
-- header comment). Only re-assert the same semantics so the policy exists
-- with an explicit comment.
drop policy if exists journeys_select on journeys;
create policy journeys_select on journeys for select
  using (can_access('journeys', 'view'));
