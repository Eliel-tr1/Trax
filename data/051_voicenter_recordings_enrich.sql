-- 051: Voicenter recordings + transcripts copied into the CRM (Sahar 14/10/2026).
-- Voicenter's Call History API (api-manager-v1/Call/History/{ivruniqueid},
-- Bearer JWT) returns the AES-encrypted transcript and a presigned S3 link to
-- the encrypted MP3, plus the decryption data (PBKDF2-SHA256 100k + AES-256-CBC).
-- Edge Function voicenter-call-enrich decrypts both, stores the MP3 in the
-- private bucket call-recordings and the transcript/summary on the call.
-- The JWT lives in Supabase Vault (name 'voicenter_trax_jwt', inserted outside
-- migrations so it never lands in migration history); only service_role can
-- read it, through get_voicenter_jwt().

alter table phone_calls add column if not exists recording_path text; -- object key in call-recordings
alter table phone_calls add column if not exists enriched_at timestamptz; -- last successful Call History pull

insert into storage.buckets (id, name, public)
values ('call-recordings', 'call-recordings', false)
on conflict (id) do nothing;

-- Signed-URL creation needs SELECT on the object: users who may view calls.
drop policy if exists call_recordings_read on storage.objects;
create policy call_recordings_read on storage.objects for select to authenticated
  using (bucket_id = 'call-recordings' and public.can_access('phone_calls'::text, 'view'::text, null::uuid, null::uuid));

create or replace function get_voicenter_jwt()
returns text
language sql
security definer
set search_path to 'public', 'vault'
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'voicenter_trax_jwt' limit 1;
$$;
revoke all on function get_voicenter_jwt() from public, anon, authenticated;
grant execute on function get_voicenter_jwt() to service_role;
