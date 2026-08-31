-- Replace the original permissive (using true) RLS policies with real
-- can_access() checks, now that roles/permissions exist (003_rbac.sql).
-- Verified live: owner role (Goldi/Zarkosh) retains full read/write —
-- 'owner' has scope='all' on everything, so this is a no-op for them.

update permissions set scope = 'all' where resource = 'contacts';
-- contacts has no owner_id of its own (it's a sub-record of a customer),
-- so 'mine' scope could never resolve true for it.

do $$
declare
  t text;
  owner_col text;
begin
  for t in select unnest(array['customers','sales','tasks','journeys','registrations','contacts'])
  loop
    owner_col := case t when 'customers' then 'owner_id' when 'sales' then 'owner_id' when 'tasks' then 'assignee_id' else null end;

    execute format('drop policy if exists %I_select on %I', t, t);
    execute format('drop policy if exists %I_insert on %I', t, t);
    execute format('drop policy if exists %I_update on %I', t, t);
    execute format('drop policy if exists %I_delete on %I', t, t);

    if owner_col is not null then
      execute format($f$create policy %I_select on %I for select to authenticated using (can_access(%L, 'view', %I))$f$, t, t, t, owner_col);
      execute format($f$create policy %I_update on %I for update to authenticated using (can_access(%L, 'edit', %I)) with check (can_access(%L, 'edit', %I))$f$, t, t, t, owner_col, t, owner_col);
      execute format($f$create policy %I_delete on %I for delete to authenticated using (can_access(%L, 'delete', %I))$f$, t, t, t, owner_col);
    else
      execute format($f$create policy %I_select on %I for select to authenticated using (can_access(%L, 'view'))$f$, t, t, t);
      execute format($f$create policy %I_update on %I for update to authenticated using (can_access(%L, 'edit')) with check (can_access(%L, 'edit'))$f$, t, t, t, t);
      execute format($f$create policy %I_delete on %I for delete to authenticated using (can_access(%L, 'delete'))$f$, t, t, t);
    end if;

    execute format($f$create policy %I_insert on %I for insert to authenticated with check (can_access(%L, 'create'))$f$, t, t, t);
  end loop;
end $$;
