# 0005 — Voicenter call data: pull from Fireberry into `phone_calls`

## Context

TRAX's phone system is Voicenter. Vitrue does **not** integrate with
Voicenter directly for this CRM — a separate, already-live integration
pushes every Voicenter call (recording, transcript, AI summary) into
Fireberry, a different CRM the company runs for other clients, as a
`שיחת טלפון` / `calllog` record (objectType `100`). This decision covers
only the second hop: pulling those already-enriched call records out of
Fireberry and mirroring them into this CRM's `phone_calls` table, matched
to a `customers` row and (best-effort) to an `app_users` row.

## What Fireberry's `calllog` (100) actually contains

Confirmed from `fireberry.md` (Vitrue's own Fireberry API reference) —
these are the fields Voicenter populates on the Fireberry side:

| Field | Contents |
|---|---|
| `calllogid` | PK — used as the idempotency key |
| `status` | call status (picklist) |
| `type` | call type (picklist) |
| `ownerid` / `ownername` | the rep Fireberry attributes the call to — **note:** per `fireberry.md`'s documented Activity-object exception, some Fireberry objects return the rep's name under `ownername` rather than `owneridname`; this hasn't been verified specifically for `calllog`, so the sync code checks both |
| `accountid` / `contactid` | Fireberry's own matched customer/contact (not usable here — different CRM, different customer IDs) |
| `callerid` / `targetid` | phone numbers (source/destination) — **this is the join key into TRAX's `customers.mobile_phone`** |
| `duration` | seconds |
| `recordurl` | Voicenter recording URL |
| `pcfdownloadurl`, `pcfDriveLink` | alternate/backup recording links |
| `pcftranscriptAI`, `pcfAIDesc`, `voicentertranscript` | transcript text (multiple fields — Fireberry appears to have accreted more than one over time; sync prefers `pcftranscriptAI`, falls back to `voicentertranscript`) |
| `pcfcallsummary`, `pcfConversationAnalyse` | AI summary / analysis text |
| `pcfsystemfield100` | call start datetime |
| `createdon` | record creation datetime (used as the polling cursor) |

**Gap, stated explicitly rather than guessed:** `fireberry.md` documents
these fields structurally (name, label, type) but was written against
Vitrue's own/other clients' Fireberry tenants — it does not certify which
of the transcript/summary fields TRAX's specific Fireberry instance
actually populates for TRAX's calls, or confirm the `ownername` fallback
for object 100 specifically (that exception was only verified for object 6,
Activity). The sync code below defensively tries multiple candidate field
names and logs when a call record doesn't match the expected shape, rather
than assuming one field name is authoritative.

## Credentials — blocked for live testing

`c:\Users\sahar\Claude Code\.env` has exactly one Fireberry credential:
`FIREBERRY_AMORPHICURE_TOKEN` — the `tokenid` for **Amorphicure's**
Fireberry tenant, a completely different client/account from TRAX's. There
is no `FIREBERRY_TRAX_TOKEN` (or equivalent) anywhere in this machine's
credential store.

**This blocks any live call against TRAX's own Fireberry.** The Edge
Function below is written to fail loudly and explain why when
`FIREBERRY_TRAX_TOKEN` is unset, rather than silently no-op or fall back to
the Amorphicure token (which would pull the wrong company's call data).

## Pull model: polling, not a webhook

`fireberry.md` documents Query (`POST /api/query`), Records (CRUD), and
Metadata endpoints. It does not document any outbound webhook / push
mechanism from Fireberry. So ingestion is **polling**: the Edge Function
queries `calllog` (objecttype `100`) for records with
`createdon > <last synced cursor>`, using the same client-side-pagination
pattern documented in `fireberry.md` (`IsLastPage`, no reliable
server-side sort, no `>=` operator — use `> cursor` and dedupe by
`external_call_id` instead of a strict boundary).

The cursor is stored in `system_settings` (`key = 'fireberry_call_sync_cursor'`)
— an existing table in this schema built exactly for this kind of
singleton runtime state, so no new table is needed.

**Trigger:** per `docs/domain-model.md` ("What stays in the CRM vs. goes to
N8N" — *"lead intake, WhatsApp/voice webhooks, welcome messages, handoff
alerts — is N8N, calling into this system's Edge Functions"*), this
function is designed to be invoked by an **N8N scheduled workflow** (e.g.
every 5–15 minutes) hitting it as a plain authenticated POST, the same way
N8N already drives `lead-intake`. It can equally be invoked by
`pg_cron` calling `net.http_post` against its URL — either works, since the
function itself is stateless per invocation and idempotent (see below).

## Matching to a `customers` row

Per `docs/domain-model.md`, `customers.mobile_phone` is TRAX's identity
key. Match by phone:

1. Take Fireberry's `targetid` (incoming call) or `callerid` (outgoing
   call) — whichever one isn't TRAX's own Voicenter line/extension — as the
   customer's number.
2. Normalize it with the same `normalizePhone()` rule `lead-intake` already
   uses (`0XXXXXXXXX` → `+972XXXXXXXXX`), so the two integrations agree on
   one phone format.
3. Look up `customers` where `business_unit = 'TRAX'` and
   `mobile_phone = <normalized>`.
4. **No match → do not fabricate a customer.** The call is still inserted
   into `phone_calls` with `related_id = null`... except `phone_calls`'s
   schema has `related_id uuid NOT NULL` with no default — so an
   unmatched call is **logged and skipped**, not inserted, and counted in
   the run's response body as `unmatched`. (Silently dropping it would hide
   a real data problem; inserting a null/garbage `related_id` would violate
   the column and break the UI's `RelatedLink` resolution.)

## Assigning to an `app_users` row

`phone_calls` had no assignee column before this change (the domain model
lists `שיחת טלפון` with `משויך ל, כיוון, duration, תוצאה, הקלטה, תמליל` only
— no rep field). This migration adds a nullable `assigned_user_id uuid
references auth.users(id)`, mirroring Fireberry's `ownerid`/`ownername` —
the rep Fireberry (i.e. Voicenter) already attributes the call to.

Matching is **name-based and best-effort**, because there is no shared user
ID between Fireberry and this Supabase project's `auth.users`/`app_users`:
normalize `ownername` (trim, collapse whitespace, casefold) and compare
against `app_users.full_name` normalized the same way. No match →
`assigned_user_id` stays `null`; the UI shows "לא שויך" rather than a wrong
person. This is explicitly a heuristic, documented as one — a hardcoded
Fireberry-rep-name → TRAX-user-id mapping table would be more reliable but
requires a human to actually enumerate both name lists, which hasn't
happened.

## Idempotency / re-runs

`external_call_id` (already on `phone_calls`) stores Fireberry's
`calllogid`. Every insert is preceded by a check for an existing row with
that `external_call_id`; if found, the run updates it (Fireberry summaries/
transcripts can arrive after the call itself, added by AI processing that
finishes later) instead of inserting a duplicate.

## Dry-run / mock mode

Because there's no TRAX Fireberry credential to test against, the function
supports a `?mode=dry_run` query param (or `FIREBERRY_TRAX_TOKEN` simply
being unset): it returns a clearly labeled JSON response describing what
it *would* do — the query it would send, the cursor it would use — without
calling Fireberry or writing to `phone_calls`. This is **not** a fake-data
demo mode; it never invents sample call records. It exists purely so the
function's request/response shape and cursor logic can be sanity-checked
before a human supplies real credentials.

## Explicitly not done here

- No Voicenter-direct integration — out of scope, Fireberry already owns
  that relationship.
- No UI to configure the polling interval — that's N8N's schedule node
  config, external to this repo.
- No automatic creation of a new `customers` row for an unmatched phone
  number — a call is evidence someone rang in, not enough to auto-create a
  lead; that stays a human/N8N decision elsewhere.
- No live run against TRAX's Fireberry — blocked on credentials, see above.
