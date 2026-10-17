-- 052: make create_api_key() callable again (EXECUTE grant + can_access overload)
--
-- Symptom: issuing an API key from Settings > "מפתחות API" fails with
--   "יצירת המפתח נכשלה: permission denied for function create_api_key"
-- (PostgREST answers 403 with SQLSTATE 42501). The function exists but the
-- `authenticated` role has no EXECUTE privilege on it, so migration 007's grant
-- is not in effect on the live database.
--
-- Restoring the grant alone is not enough: the call then reaches the function
-- body and dies on its FIRST line with SQLSTATE 42725,
-- "function can_access(unknown, unknown) is not unique". can_access() gained a
-- second (4-arg) overload in 037, so the bare 2-arg call inside the function no
-- longer resolves. The function is therefore recreated with the 4-cast form as
-- its ONLY change (same signature, same body, same SECURITY DEFINER).
--
-- Two independent regressions were silently blocking key creation; both are
-- fixed here in one place. Verified afterwards by the non-destructive REST
-- probe: rpc/create_api_key with an invalid role returns a 23514
-- check-constraint error (so the function actually ran) instead of 42501/42725.

create or replace function public.create_api_key(p_name text, p_role text default 'read')
returns table(id uuid, plaintext_key text)
language plpgsql
security definer
as $$
declare
  v_key text;
  v_id uuid;
begin
  if not can_access('settings'::text, 'create'::text, null::uuid, null::uuid) then
    raise exception 'permission denied';
  end if;
  v_key := 'trax_live_' || encode(gen_random_bytes(24), 'hex');
  insert into api_keys (name, key_hash, key_prefix, role, created_by, is_active)
  values (p_name, crypt(v_key, gen_salt('bf')), left(v_key, 14), coalesce(p_role, 'read'), auth.uid(), true)
  returning api_keys.id into v_id;
  return query select v_id, v_key;
end;
$$;

grant execute on function public.create_api_key(text, text) to authenticated;

-- 007 also created these three policies. Recreated idempotently so the same
-- drift cannot leave API-key deletion or picklist management broken too.
-- Same overload rule: every can_access() call passes all four arguments with
-- explicit casts (see the note above).
drop policy if exists api_keys_delete on public.api_keys;
create policy api_keys_delete on public.api_keys for delete to authenticated
  using (can_access('settings'::text,'delete'::text,null::uuid,null::uuid));

drop policy if exists picklists_insert on public.picklists;
create policy picklists_insert on public.picklists for insert to authenticated
  with check (can_access('settings'::text,'create'::text,null::uuid,null::uuid));

drop policy if exists picklists_delete on public.picklists;
create policy picklists_delete on public.picklists for delete to authenticated
  using (can_access('settings'::text,'delete'::text,null::uuid,null::uuid));

-- Sibling bug found while verifying the delete path: api_request_logs.api_key_id
-- references api_keys(id) with the default ON DELETE NO ACTION, so deleting ANY
-- key that has ever served a request fails with a bare 409 (surfaced in the UI
-- as "המחיקה נכשלה" with a foreign-key message). The log row is an audit record
-- and must survive; the link is what should clear. api_key_id is already
-- nullable (internal service-role calls log null), so ON DELETE SET NULL is the
-- correct behaviour and loses no data.
alter table public.api_request_logs
  drop constraint if exists api_request_logs_api_key_id_fkey;
alter table public.api_request_logs
  add constraint api_request_logs_api_key_id_fkey
  foreign key (api_key_id) references public.api_keys(id) on delete set null;
