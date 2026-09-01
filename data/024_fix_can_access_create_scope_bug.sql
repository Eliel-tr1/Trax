-- can_access()'s 'create' branch falls through to the same bottom-of-function
-- scope check as 'edit'/'delete' ("scope='all' -> true, else p_owner_id is
-- not null and p_owner_id = auth.uid()") -- but every *_insert RLS policy
-- (data/005_enforce_rbac_rls.sql) calls can_access(resource, 'create') with
-- NO owner_id argument at all, since there's no existing row to own yet.
-- p_owner_id therefore defaults to NULL, and "NULL is not null" is always
-- false -- so ANY role with scope='mine' (i.e. every sales_rep, the CRM's
-- most common real role) can never INSERT a customer/sale/task/meeting/
-- journey/registration/phone_call at all, even though can_create=true for
-- all of those on sales_rep. Confirmed live: a simulated authenticated
-- sales_rep user's INSERT into customers failed RLS outright before this
-- fix.
--
-- Fix: 'create' is a yes/no permission (can this role create this resource
-- type at all), not a per-row ownership check like edit/delete -- there's
-- no existing owner to compare against a brand-new row, so scope doesn't
-- apply to it the way it does to view/edit/delete. Same reasoning as why
-- 'view' needed splitting off into can_view_resource() in
-- data/020_022_can_access_scope_fix.sql, but simpler here: 'create' just
-- returns as soon as the can_create gate passes, without falling through.
--
-- Discovered and fixed while verifying data/023's two new automations as a
-- real authenticated sales_rep user (not the privileged execute_sql
-- connection) -- the exact verification technique from the
-- automation_dispatch RLS fix (data/019).

create or replace function public.can_access(p_resource text, p_action text, p_owner_id uuid default null::uuid)
returns boolean
language plpgsql
stable security definer
as $function$
declare
  v_role_id uuid;
  v_perm record;
begin
  select role_id into v_role_id from app_users where id = auth.uid() and is_active = true;
  if v_role_id is null then return false; end if;

  select * into v_perm from permissions where role_id = v_role_id and resource = p_resource;
  if not found then return false; end if;

  if p_action = 'create' then
    return v_perm.can_create;
  end if;

  case p_action
    when 'view' then if not v_perm.can_view then return false; end if;
    when 'edit' then if not v_perm.can_edit then return false; end if;
    when 'delete' then if not v_perm.can_delete then return false; end if;
    else return false;
  end case;

  if v_perm.scope = 'all' then return true; end if;
  return p_owner_id is not null and p_owner_id = auth.uid();
end;
$function$;
