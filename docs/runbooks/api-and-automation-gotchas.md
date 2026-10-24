# API layer & automation engine — operational notes

## Public API documentation page

`public/api-docs.html` (served at `/api-docs`, Cloudflare Pages rewrites the
`.html`) is the shareable, login-free API reference handed to integrators. It is
GENERATED, never hand-written: `scripts/build-api-docs.mjs` reads the `SCHEMA`
allow-list out of `supabase/functions/api-v1/index.ts`. The Settings > "מפתחות
API" tab links straight to it; there is no separate in-app docs tab anymore.

Run it after any change to the api-v1 schema: `node scripts/build-api-docs.mjs`.
It also runs as `npm run prebuild` and as a step in the staging deploy workflow,
and the workflow fails the build if the page is missing from `dist`. If you add
an object or a field to the edge function, the docs update themselves; you only
edit the prose sections in the generator.

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

**Known gap (not fixed, flagged 2026-10-17):** `apiKey.role` is read from
`verify_api_key` but never enforced, so a key issued as `read` can still POST,
PATCH and DELETE. The function's header comment ("role-checked") is optimistic.
Enforcing it needs a decision first: the n8n lead-intake key is seeded with role
`integration`, which is not one of the three roles the Settings UI offers, so a
naive "writes require write/internal" check would break that path. Do not
document the roles as enforced until this is closed. Related: `api_keys.role`
has no DB CHECK constraint either, so an arbitrary role value is accepted.

**API-key management repair (2026-10-17, applied to the live DB via
`data/052_fix_api_key_management.sql`):** issuing a key from Settings was dead
for two independent reasons, both fixed in that one file. (1) the `authenticated`
role had lost its EXECUTE grant on `create_api_key` (007's grant was not in
effect, so the RPC answered 42501). (2) after restoring it, the function body
itself failed with 42725 because its `can_access('settings','create')` was a
2-arg call and can_access gained a 4-arg overload in 037; the function is
recreated with the 4-cast form as its only change. Same file also flips
`api_request_logs.api_key_id` to `ON DELETE SET NULL`, because anyone deleting a
key that had ever served a request hit a bare 409 (the FK blocked the delete)
even though the key row is what the user asked to remove. Full lifecycle
re-verified afterwards through the real UI on production: create, use against
api-v1, delete.

`supabase/functions/lead-intake/` implements the exact payload contract
already committed to the client's site/landing/Xcon forms
(`docs/domain-model.md` → "הטפסים באתרים") as a thin wrapper over `api-v1`.

## n8n lead-intake workflow — live and verified

Workflow "TRAX - Lead Intake (site/landing/Xcon forms)", id `pjhRD7eOj8Xs7aDR`
on the Vitrue n8n instance (`n8n.srv1873970.hstgr.cloud`), created via the
Public API and activated. Webhook URL:
`{N8N_VITRUE_URL}/webhook/trax-lead-intake` — POST the exact payload
contract, it forwards to `lead-intake` and returns its response.

Despite the documented Amorphicure-instance gotcha (CLI/API-created webhook
nodes never registering — see `n8n_hostinger_deployment.md` memory), **this
webhook registered and worked correctly on the first try, verified twice**
with real end-to-end customer+sale creation (test rows cleaned up after).
That gotcha was confirmed on a different n8n instance/version
(`72.60.34.206`, Amorphicure) — evidently doesn't reproduce here. Still,
if this workflow is ever redeployed with new node code, re-verify with a
real POST before trusting it live — don't assume this instance is
permanently exempt.

Only the site-form path is wired end-to-end tonight. WhatsApp/Instagram/
Facebook DM intake and the Xcon-specific form still need their own
workflows pointed at the same webhook (or their own, calling the same
contract) — not built tonight, out of scope for the CRM repo itself per
architecture.md (this repo only needed to prove the receiving side works).

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

## WhatsApp AI agent (CloudChat): operations (2026-10-24, decisions/0010)

- Flow: sale INSERT -> trigger `sales_created_webhook` -> n8n `aZ475pR5nxSdzhuU`
  (header auth `X-Trax-Webhook-Secret`, waits 60 s) -> `cloudchat-bridge`
  `{action:'send', sale_id}` (header `x-bridge-secret`). Reply sync: n8n
  `lo7rijctoKVu3DwV` every 5 min -> `{action:'sync'}`; `{action:'sync',
  sale_ids:[...]}` re-checks specific sales. Chat panel: `{action:'chat'}` with
  the user's JWT.
- Function secrets (Supabase): `TRAX_CLOUDCHAT_API_KEY` (workspace "TRAX
  Club" 326381 key), `TRAX_CLOUDCHAT_BASE`, `CLOUDCHAT_BRIDGE_SECRET`. n8n
  credentials: "TRAX CRM webhook secret", "TRAX cloudchat-bridge secret".
  Deployed with verify_jwt OFF (send/sync check the bridge secret, chat checks
  the user JWT itself).
- Settings live in `system_settings` (`whatsapp_*`): template name/lang/params,
  test mode + test phones, dedupe days, no-reply hours. Test mode ON until
  Sahar says go live: staging and production share this DB.
- `send` result reasons when skipped: disabled_on_sale, not_trax, opt_out,
  already_sent, no_valid_phone, test_mode, dedupe. A missing or unapproved
  template marks the sale `השליחה נכשלה` with the reason in `ai_send_error`;
  a failed sale is retried by the next `send` for it.
- `send` skips only a sale opened FROM a WhatsApp chat (channel `וואטסאפ`, Max
  created it): links the chat, sets `ענה לסוכן`, sends nothing
  (already_in_conversation). Every other new sale gets the template even if the
  number chatted with Max earlier (Sahar 24/10).
- Every send is also reported to the agent portal outbound log when
  TRAX_PORTAL_OUTBOUND_URL / TRAX_PORTAL_OUTBOUND_KEY are set (function secrets),
  so the portal conversation shows the rendered template text.
- Any sale INSERT fires the flow, whatever the source: CRM UI, api-v1 (POST
  customers / sales), lead-intake, wf05a (site + Facebook). Gap: wf05a REUSES an
  open sale for a returning lead (no INSERT), so a repeat submission sends nothing.
- Max hands over by PATCH `/api-v1/sales/{id}` with `stage: 'שיחת מכירה עם
  נציג אנושי'` + qualification fields; trigger `sales_ai_handoff` opens the task.
  Max finds the ids in the CloudChat subscriber fields `crm_customer_id`,
  `crm_sale_id`.
- Known: the automation engine's `create_record` writes `related_type` as the
  TABLE name (`sales`), which `tasks_related_type_check` rejects: rule "משימת
  מעקב לתאריך שיחה הבאה" has failed 22 times. Not fixed here (changes behavior
  of a live rule; needs Sahar).
- CloudChat answers `send-whatsapp-template-by-user-id` with
  `{"status":"ok","mid":...}` even for a template that does not exist (checked
  24/10): "ok" means queued, not sent. The rejection shows up in
  `/flow/error-logs/data` (user_ns + "(#132001) ..."), not always as a chat
  row; `sync` reads both. That is also why `send` refuses a template that is
  not in `/whatsapp-template/list` as APPROVED.
- API template sends appear in the chat as `type: agent`, `msg_type: wa_template`.
- api-v1: `contacts` has no `deleted_at`; list/get no longer filter on it (was
  a 500 on every call) and DELETE answers 405.

## "ברוך הבא למסע" (2026-10-24, decisions/0011)

- Flow: registration status -> trigger `registrations_journey_webhook` (also
  `passengers_journey_webhook`, `sales_journey_webhook` on won) -> n8n
  `kENOh7fdnPaZmYbl` (waits 30 s) -> `cloudchat-bridge {action:'journey',
  registration_id}`. Re-run by hand with the same call; it is idempotent.
- Settings: `whatsapp_reserved_template_*`, `whatsapp_welcome_template_*`,
  `whatsapp_journey_require_sale_won`; test mode and test phones are shared
  with the lead flow.
- `journey_messages` is the audit trail and the dedupe key. To deliberately
  re-send to someone, delete (or set to 'failed') their row, then touch the
  registration status. Never update a 'sent' row to resend by accident.
- Placeholders: {first_name} (of each recipient) {trip_name} {destination}
  {start_date} {end_date} (DD.MM.YYYY) {participants} {days_to_trip} {trip_url}
  {customer_first_name}.
