# Archive of Supabase project `trax-crm` (ref `zahrgdefjekucizocjtu`)

Snapshot taken 2026-08-31, right before the project was deleted to stop
its $10/month compute cost (Micro is the cheapest tier available on a
Pro-tier org — see [decisions/0004](../docs/decisions/0004-archive-and-delete-supabase-project.md)
for why deletion, not pause, was the only way to actually reach $0).

This is a **test build, not real client data** — see `docs/architecture.md`
and the client-communication note in that decision record.

## What's here

- `config_data.json` — roles, permissions, app_users, api_keys (metadata
  only, not the plaintext key), system_settings, automation_rules,
  custom_fields, picklists.
- `business_data.json` — customers, journeys, sales, registrations.
- `misc_data.json` — tasks, contacts, meetings, phone_calls, notes,
  documents.

Row counts at snapshot time: 25 customers, 29 sales, 7 journeys, 27
registrations, 4 tasks, 2 contacts, 1 meeting, 0 phone calls/notes/
documents, 4 roles, 23 permission rows, 3 automation rules, 2 app_users,
1 api_key (metadata only — the actual key value is unrecoverable, it was
never stored anywhere, only its bcrypt hash).

**Not archived, deliberately:** `audit_log`, `automation_logs`,
`api_request_logs`, `notifications` — operational history, not needed to
reconstruct the system. The Storage bucket contents (avatar image,
nothing in `attachments` at snapshot time) are **not** archived — Storage
objects aren't included in this SQL-level export. If that matters later,
say so before deleting anything with real files in it.

## How to restore (new project, since the old one is deleted)

1. **Create a new Supabase project.** Note its ref/URL.
2. **Apply the schema.** Run `data/001_init_schema.sql` through
   `data/007_api_keys_crud_picklists_insert.sql` **in order** against the
   new project (via the Supabase MCP `apply_migration` tool, or the SQL
   editor). This recreates every table, trigger, function, and RLS policy,
   plus the *default* seed rows for roles/permissions/automation_rules —
   which may already match `config_data.json` exactly (they did at
   snapshot time), but confirm rather than assume, in case they'd been
   edited live before the snapshot.
3. **Recreate the two auth users** (Supabase Auth → Users → Invite, or
   `admin.createUser`) with the same emails. **Their UUIDs will be
   different from the archived ones** — note the new UUIDs.
4. **Import the data**, in FK order: `customers` → `journeys` → `sales` →
   `registrations` → `tasks`/`contacts`/`meetings`/`notes`/`documents`.
   For `app_users`, insert using the **new** auth UUIDs from step 3, not
   the ones in `config_data.json` — then find/replace every `owner_id`/
   `assignee_id`/`created_by`/`updated_by` reference to the old UUIDs
   (`19426636-3dbc-4b0e-b085-eb482d241ed0` = זרקוש,
   `37e8f2e1-e231-4347-b5e6-f0ef093df703` = גולדי) with the new ones
   before inserting the business-data tables. A small Node script reading
   these JSON files and calling `supabase-js` `.insert()` per table (in
   the order above, with that one substitution) is the straightforward
   way to do this — write it fresh at restore time rather than trusting
   one written now to still fit whatever's changed by then.
5. **Redeploy the Edge Functions** — source is already in git
   (`supabase/functions/api-v1`, `lead-intake`, `invite-user`), just
   `deploy_edge_function` them against the new project.
6. **Generate a fresh API key** for lead-intake — the old one's plaintext
   is gone, only its bcrypt hash was ever stored (by design). Use the
   `create_api_key()` RPC from migration 007.
7. **Update `.env`** with the new project's `SUPABASE_URL`/
   `SUPABASE_ANON_KEY`, rebuild, and redeploy the frontend
   (`npm run build && node deploy.js`).
8. **Recreate the n8n workflow** (`docs/runbooks/api-and-automation-gotchas.md`
   has the current one's shape) pointed at the new project's Edge Function
   URL — the old workflow still exists on the n8n side but points at a
   dead project.
9. **Storage**: re-upload the TRAX logo assets (`src/assets/`, already in
   git) — those aren't Supabase Storage, no action needed. Any real
   avatar/attachment files uploaded by users before the snapshot are
   genuinely gone (see "Not archived" above).
