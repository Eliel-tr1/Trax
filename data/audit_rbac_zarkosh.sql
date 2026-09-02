-- Deep RBAC audit for zarkosh (sales rep). Runs everything the client-side
-- matrix + RLS policies rely on, so we see exactly what he can/can't do.
-- (Read-only; safe to run against prod data.)

-- 1) who is zarkosh, what's his role
select u.id, u.full_name, u.role_id, r.name as role_name, r.is_admin
from app_users u left join roles r on r.id = u.role_id
where u.full_name ilike '%רקוש%' or u.full_name ilike '%zarkosh%';

-- 2) his role's permission rows (what the UI matrix shows)
select p.resource, p.can_view, p.can_create, p.can_edit, p.can_delete, p.scope
from permissions p
join app_users u on u.role_id = p.role_id
where u.full_name ilike '%רקוש%'
order by p.resource;

-- 3) what can_access() answers for him on sales/customers (the RLS gate)
select
  can_access('sales', 'view')     as can_sales_view,
  can_access('customers', 'view') as can_customers_view;

-- 4) THE CRITICAL TEST: how many sales rows can he actually SELECT through
--    RLS vs how many exist. If both equal → RLS not scoping.
select
  (select count(*) from sales where deleted_at is null)                                   as sales_total,
  (select count(*) from sales where deleted_at is null and owner_id = (select id from app_users where full_name ilike '%רקוש%')) as sales_owned;

-- 5) same for customers
select
  (select count(*) from customers where deleted_at is null) as customers_total,
  (select count(*) from customers where deleted_at is null and owner_id = (select id from app_users where full_name ilike '%רקוש%')) as customers_owned;

-- 6) show the actual RLS policies on sales and customers (find the hole)
select tablename, policyname, cmd, qual
from pg_policies
where tablename in ('sales','customers')
order by tablename, policyname;

-- 7) is RLS even ENABLED on these tables?
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where relname in ('sales','customers','journeys','registrations','tasks','meetings','phone_calls','contacts','notes','app_users');
