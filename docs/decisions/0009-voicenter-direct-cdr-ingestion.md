# 0009 - Voicenter calls: direct CDR push via n8n into `phone_calls`

## Context

0005 planned Voicenter -> Fireberry -> `fireberry-call-sync` (polling). TRAX
has no Fireberry tenant and no `FIREBERRY_TRAX_TOKEN`, so that path never ran.
The n8n workflow `Trax Calls - Voicenter` (QqOrRlWGBANByx2C) existed but was a
single Webhook node registered for GET only, so Voicenter's POST CDRs were
rejected with 404 and nothing reached the CRM (diagnosis 01/10/2026).

## Decision (approved by Sahar 01/10/2026)

Voicenter CDR Notification -> n8n webhook (same production path
`/webhook/d91aa789-8a4c-4a21-a7f3-c9a0a390b33c`, POST, answers 200
immediately) -> Code node `נרמול CDR` (source copy:
`scripts/n8n/voicenter-normalize-cdr.js`) -> Edge Function
`voicenter-call-sync` -> `phone_calls`.

- Accepts POST JSON and form-urlencoded (also a single form field holding JSON).
- Customer number = the phone-like side that is not ours: incoming -> `caller`
  (or `callerPhone`), outgoing -> `target`; values with < 9 digits are
  extensions/SIP codes; `did` and the (still empty) `OWN_NUMBERS` list in the
  Code node are excluded. Normalized to `+972...`; lookup also tries `0...`
  because `customers.mobile_phone` holds both formats.
- Dedupe: `ivruniqueid` = `phone_calls.external_call_id`; a repeat CDR updates
  the row (retry, or later aiData) and never blanks an existing transcript.
- Unknown number: no customer is created (same rule as 0005). Logged to
  `automation_logs` (status `skipped`, message starts with `voicenter:` and
  carries the n8n execution URL). Raw CDR stays in the n8n execution (workflow
  saves all executions) and in the function log.
- Internal calls and leg1 of Click2Call / ProductiveCall are skipped (leg2
  carries the real call and recording) and logged the same way.
- Sale link and rep match reuse the fireberry-call-sync rules (OPEN sale else
  latest; `representative_name` vs `app_users.full_name`, best effort).
- Auth: Edge Function has verify_jwt on; n8n sends the anon key. The webhook
  itself has no auth yet (Voicenter header support unknown, see open items).

## Why not polling (Call Log API)

Needs an org `code` from Voicenter plus IP allow-listing of the n8n host;
push needs only the CDR URL configured on Voicenter's side and is real time.
0005 stays in the repo as the fallback if TRAX ever moves calls via Fireberry.

## Still unverified until the first real CDR

aiData shape for TRAX's account (string vs object, Hebrew transcript), exact
number format in `caller`/`target`, which values are TRAX DIDs (fill
`OWN_NUMBERS`), and whether `direction` is sent at all for this account.

## Update 11/10/2026 (first real CDR, execution 27083)

- Unknown number (Sahar, final): the sync NEVER creates a lead, in or out.
  The call is stored UNLINKED (`related_id` null, now nullable) with the other
  side's E.164 number in `customer_phone` (migration 048). The call screen
  shows "הקמת ליד": RPC `create_lead_from_call` opens a lead (`ליד טלפוני
  <number>`, lead_source `לא מוכר`, owner = the clicking rep) or reuses a
  customer that already has the number, links EVERY unlinked call with that
  number (+ open-else-latest sale), and writes a feed note on customer + sale.
- `time` is Israel wall-clock encoded as UTC (3h ahead in IDT). occurred_at
  now comes from the ivruniqueid prefix converted from Asia/Jerusalem.
- Summary keeps the AI summary + TRAX-defined questions only; Voicenter's
  inherited "support" category questions (keywords, resolved, agent score)
  are dropped.
- Recording URLs (`cpanel.voicenter.co.il/.../*.enc`) return 403 without a
  Voicenter session; the CRM player cannot play them until a Voicenter API
  token lets n8n copy the file to Supabase Storage (requested from Voicenter).
