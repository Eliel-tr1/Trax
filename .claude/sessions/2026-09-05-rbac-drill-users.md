# Session Handoff — 2026-09-05: permissions, drill-down, user management

## What landed (all verified live)

### RBAC / permissions
- `can_access(p_resource, p_action, p_owner_id, p_assoc_id)` (037): scope
  'mine' = associated via owner OR assoc field. Customers policies pass
  `account_manager_id` as assoc (038).
- Impersonation filter (providers.js `listQuery`): customers cut =
  `owner_id.eq.X,account_manager_id.eq.X` (direct .or()); other tables owner
  eq. Previously hid assoc-managed rows.
- permissionStore.load: race guard (monotonic `_loadSeq`) + `loading:false`
  only lands together with a real matrix (silent INITIAL_SESSION refetch used
  to flip loading:false with an empty matrix → "no permission" after refresh).

### Drill-down (the big one)
- ROOT CAUSE of "marketing drill ignores filters": ra-core's getQuery prefers
  persisted store params over filterDefaultValues; the store survives
  remounts (global localStorage). Fix: drill filter rides as ListBase's hard
  `filter` prop (ResourceList.jsx). Never revert to filterDefaultValues.
- Marketing charts (source×campaign, top sources) now aggregate SALES — the
  table they drill into. Chart counts from customers + drill to sales = tile
  N vs table M mismatch (Sahar reported 19→20, 21→23).
- 'לא צוין' buckets drill as `field@is: null` (was: no filter → all rows).
- FunnelChart hides 0-value rows (drilling them = empty table = "broken").
- Rule doc: docs/decisions/0007-dashboard-drill-rule.md. Gate:
  scripts/verify-marketing-drill.mjs (13/14 PASS; the 1 "fail" is the
  all-rows tile 25→25 which is correct).

### Users & labels
- role_labels + departments tables (039) replace hard-coded consts; managed
  via LabelsManagerModal (add/rename-with-carry/delete-with-count-guard).
  Legacy CHECK constraints on app_users dropped (040) — assigning new labels
  failed with "העדכון נכשל" until then.
- update-user Edge Function: + set_password (min 8 chars, auto email_confirm)
  and + delete (can_delete perm, self-delete blocked, owned
  customers/sales/tasks nulled, auth user removed, sessions signed out).
  UsersTab action cell: edit / סיסמה / trash buttons.
- invite-user confirmed to set email_confirm:true on the LIVE function
  (verify-invite-confirm.mjs PASS) — new users can log in immediately.
- JourneyDetail: sales tab (sales.journey_id) alongside registrations.

### Verification tooling (the workflow)
- scripts/verify-user-admin.mjs — password reset + delete E2E (ALL PASS)
- scripts/verify-marketing-drill.mjs — clicks every marketing metric
- scripts/verify-drill.mjs — targeted drill cases
- scripts/verify-invite-confirm.mjs — invite email_confirm check
- scripts/verify-prod.sh — prod bundle non-empty + supabase refs
- scripts/zarkosh-visibility.sh (hermes scripts dir) — RLS visibility as
  zarkosh via REST
- All headless (playwright channel:chrome / supabase-js). NO computer-use
  for verification (focus-stealing; Sahar explicitly banned it).

## Ops notes
- SRK: management API api-keys endpoint, name='service_role' (the project
  secrets' SUPABASE_SERVICE_ROLE_KEY is a 64-char hex, NOT the JWT — don't
  use it against the REST API).
- Edge functions deploy: `npx supabase functions deploy <name>
  --project-ref bkjqwroclpefwtyxjfkl`
- Prod deploys ONLY on Sahar's explicit approval after he verifies staging
  (violated once 09-05 — don't repeat). Staging is the daily workspace.
- Passwords for interface-created users: admin sets them in the invite modal;
  if a user can't log in, check auth.users email_confirmed_at first
  (scripts/check-auth-users.mjs).

## Known-good state
- Migrations applied through 040.
- Build stamp pattern: index.html logs 'BUILD: index-<hash>.js | <ts>' to
  localStorage 'trax_build' (read via DiagnosticsOverlay, Alt+Shift+D).
- HashRouter: drill params must live INSIDE the hash (#/sales?drill_...).
