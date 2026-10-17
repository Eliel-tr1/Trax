-- 052: repair the create_api_key() EXECUTE grant (and the rest of 007's DB effects)
--
-- Symptom: issuing an API key from Settings > "מפתחות API" fails with
--   "יצירת המפתח נכשלה: permission denied for function create_api_key"
-- (PostgREST answers 403 with SQLSTATE 42501). The function itself exists and
-- is callable, but the `authenticated` role has no EXECUTE privilege on it, so
-- migration 007's grants are not in effect on the live database.
--
-- This re-applies 007's DB effects idempotently. The function body is NOT
-- touched here: the observed error is purely a privilege problem, and a
-- minimal change is the safest one. If the grant alone does not fix it, the
-- next step is to re-check the function's SECURITY DEFINER flag, not to
-- redefine it blindly.
--
-- Applied by: Sahar (Supabase SQL editor) or scripts/apply-sql.sh with
-- SUPABASE_ACCESS_TOKEN. Verified afterwards by the non-destructive REST probe
-- (rpc/create_api_key with an invalid role: success is a 23514 check-constraint
-- error, not a 42501 permission error).

grant execute on function public.create_api_key(text, text) to authenticated;

-- 007 also created these three policies. Recreated idempotently so the same
-- drift cannot leave API-key deletion or picklist management broken too.
drop policy if exists api_keys_delete on public.api_keys;
create policy api_keys_delete on public.api_keys for delete to authenticated
  using (can_access('settings','delete'));

drop policy if exists picklists_insert on public.picklists;
create policy picklists_insert on public.picklists for insert to authenticated
  with check (can_access('settings','create'));

drop policy if exists picklists_delete on public.picklists;
create policy picklists_delete on public.picklists for delete to authenticated
  using (can_access('settings','delete'));
