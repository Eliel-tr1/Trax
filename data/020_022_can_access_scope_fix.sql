-- Squashed history of migrations 020-022 (live iteration, kept as one file
-- since 020/021 were superseded within the same session — see git history
-- if the intermediate steps matter). Final state:
--
-- can_access()'s 'view' branch used to return bare can_view, ignoring
-- scope/ownership even when RLS passes a real row's owner_id -- so
-- scope='mine' never restricted which ROWS were visible to anyone, real
-- login or impersonated, only whether the resource was visible at all.
-- Confirmed live: a simulated scope='mine' authenticated user saw all 30
-- customers regardless of ownership before this fix, 1 (their own) after.
--
-- The fix required splitting into two functions, not just patching one:
-- can_access(resource, action, owner_id) is now a STRICT per-row check
-- (real RLS policies always pass the row's actual owner_id column, which
-- legitimately can be NULL for an unowned row -- NULL never equals any
-- uuid, so an unowned row correctly does NOT count as "mine").
-- can_view_resource(resource) is a NEW, separate function for the bulk
-- permission-matrix loader (permissionStore.js's load()), which has no
-- specific row and asks "can this role ever view this resource type" --
-- overloading that case onto can_access via a NULL owner_id argument is
-- what caused the original bug (no way to distinguish "no row context"
-- from "this row's owner is NULL" once both look like NULL inside the
-- function). See src/stores/permissionStore.js's load() for the client
-- change that calls can_view_resource for the 'view' action specifically.

create or replace function public.can_view_resource(p_resource text)
 returns boolean
 language plpgsql
 stable security definer
as $function$
declare
  v_role_id uuid;
  v_can_view boolean;
begin
  select role_id into v_role_id from app_users where id = auth.uid() and is_active = true;
  if v_role_id is null then return false; end if;
  select can_view into v_can_view from permissions where role_id = v_role_id and resource = p_resource;
  return coalesce(v_can_view, false);
end;
$function$;

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

  case p_action
    when 'view' then if not v_perm.can_view then return false; end if;
    when 'create' then if not v_perm.can_create then return false; end if;
    when 'edit' then if not v_perm.can_edit then return false; end if;
    when 'delete' then if not v_perm.can_delete then return false; end if;
    else return false;
  end case;

  if v_perm.scope = 'all' then return true; end if;
  return p_owner_id is not null and p_owner_id = auth.uid();
end;
$function$;

-- Also backfilled owner_id across existing customers/sales (all NULL since
-- the archive restore, which made scope='mine' untestable) -- distributed
-- evenly across the 2 real users. See git history for the exact statement
-- if you need to reproduce it; not repeated here since it's one-time data
-- cleanup, not schema.
