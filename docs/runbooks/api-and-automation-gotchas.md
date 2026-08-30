# API layer & automation engine — operational notes

## Generic object API

`supabase/functions/api-v1/` — `/api-v1/{object}[/{id}]`, GET/POST/PATCH/DELETE,
`Authorization: Bearer <key>`. Two kinds of caller:

- **External integrations** (n8n, future systems): a real row in `api_keys`,
  hashed (bcrypt via `crypt()`), verified through `verify_api_key(p_key)`.
  Create one with:
  ```sql
  insert into api_keys (name, key_hash, key_prefix, role)
  values ('some-integration', crypt('the-plaintext-key', gen_salt('bf')), 'trax_', 'integration');
  ```
  The plaintext is only ever visible at creation time — same rule as the
  playbook this pattern came from (`docs/decisions/0003`).
- **Internal Edge Functions in this same project** (e.g. `lead-intake`): pass
  `SUPABASE_SERVICE_ROLE_KEY` (auto-injected into every function) as the
  Bearer token. `api-v1` recognizes an exact match against its own service
  role key as a trusted internal caller and skips the `api_keys` lookup —
  see the comment in `api-v1/index.ts`. No extra secret to provision.

`supabase/functions/lead-intake/` implements the exact payload contract
already committed to the client's site/landing/Xcon forms
(`docs/domain-model.md` → "הטפסים באתרים") as a thin wrapper over `api-v1`.

## Windows/Git-Bash curl gotcha (cost real debugging time once already)

`curl -d '<hebrew text>'` on Windows Git Bash mangles UTF-8 into `?????`
before it reaches the request body. Always use `-d @file.json` with a file
written by a tool that preserves UTF-8 (Write/Edit), never an inline `-d`
string with Hebrew content.

## Postgres GUC gotcha in `automation_dispatch()` (found + fixed 2026-08-30)

`current_setting('trax.automation_depth', true)` — used for the recursion
depth guard — returned **empty string, not NULL**, causing
`::int` casts to fail with `invalid input syntax for type integer: ""`, but
**only through PostgREST** (i.e. only when called via the API, not via a
direct `execute_sql`/psql connection). Root cause: PostgREST reuses pooled
connections across separate requests/transactions; once a custom GUC has
been `SET LOCAL` at least once on a given connection, Postgres keeps it as a
session placeholder whose value reverts to `''` (not NULL) after the owning
transaction commits — `missing_ok=true` only returns NULL if the GUC has
*never* existed on that connection at all. A test via a fresh connection
each time will never reproduce this.

**Fix:** always `nullif(current_setting('x', true), '')::int` (or the
equivalent for whatever type), never a bare `current_setting(...)::type`,
for any custom GUC read back across requests. Applied in migration
`fix_automation_depth_guc_empty_string`.

**How it was actually diagnosed:** `execute_sql` reproduction didn't show
the bug (different connection each time), so the real signal was reading
`postgres_logs` via the `query_logs` tool — `parsed.context` named the exact
function and line, `parsed.query` showed the actual PostgREST-generated SQL.
When a bug only reproduces through the API and not through a direct query,
check the Postgres logs before assuming the bug is in your own code.
