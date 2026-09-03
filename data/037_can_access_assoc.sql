-- can_access v2: "mine" scope = the record is associated with the caller
-- through ANY rep field (owner_id OR account_manager_id), per Sahar's rule:
-- "משויך אלי = רשומות שאני בשדה כזה או אחר משויך אליהם".
-- p_owner_id stays the primary owner param; the function now also accepts
-- an optional secondary assoc id (account_manager etc.).
create or replace function can_access(
  p_resource text,
  p_action text,
  p_owner_id uuid default null,
  p_assoc_id uuid default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
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

  -- 'mine': associated through the owner field OR any supplied assoc field
  if p_owner_id is not null and p_owner_id = auth.uid() then return true; end if;
  return p_assoc_id is not null and p_assoc_id = auth.uid();
end;
$$;
