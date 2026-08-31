-- Closes two feature-audit gaps that 006 didn't cover:
--  1. api_keys had INSERT/UPDATE RLS already (wide open `true`, pre-existing)
--     but no DELETE policy and no safe way to actually create a key from the
--     client — key_hash must be produced by pgcrypto's crypt()+gen_salt('bf'),
--     the same approach verify_api_key() already reads (data/001 schema),
--     so key creation has to happen server-side via SECURITY DEFINER RPC.
--  2. picklists (006) was update-only — with 0 seeded rows that left the new
--     admin UI with nothing to manage. Adds insert/delete so an admin can
--     actually create a picklist, not just edit one that doesn't exist yet.

create policy api_keys_delete on api_keys for delete to authenticated
  using (can_access('settings','delete'));

-- Generates a real key (trax_live_<32 hex>), stores only its bcrypt hash
-- (matching verify_api_key's crypt(p_key, key_hash) check), and returns the
-- plaintext once — same pattern as the already-seeded
-- 'trax-lead-intake-2026-qa' key, just issued from the UI instead of by hand.
create or replace function create_api_key(p_name text, p_role text default 'read')
returns table(id uuid, plaintext_key text)
language plpgsql
security definer
as $$
declare
  v_key text;
  v_id uuid;
begin
  if not can_access('settings','create') then
    raise exception 'permission denied';
  end if;
  v_key := 'trax_live_' || encode(gen_random_bytes(24), 'hex');
  insert into api_keys (name, key_hash, key_prefix, role, created_by, is_active)
  values (p_name, crypt(v_key, gen_salt('bf')), left(v_key, 14), coalesce(p_role, 'read'), auth.uid(), true)
  returning api_keys.id into v_id;
  return query select v_id, v_key;
end;
$$;

grant execute on function create_api_key(text, text) to authenticated;

create policy picklists_insert on picklists for insert to authenticated
  with check (can_access('settings','create'));
create policy picklists_delete on picklists for delete to authenticated
  using (can_access('settings','delete'));
