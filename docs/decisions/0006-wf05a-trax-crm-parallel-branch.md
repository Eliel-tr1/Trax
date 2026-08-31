# 0006 — Feed the TRAX CRM from WF-05a's lead webhook, in parallel with Origami

**Context**: WF-05a (n8n workflow id `6Nam4IBnV39wT22J`, host
`n8n.srv1873970.hstgr.cloud`) already receives every TRAX website lead via a
webhook at `POST /webhook/trax-lead-website`, normalizes/validates the
payload (G1), dedupes rapid double-submits (G3), then searches for the
customer in Origami — update if found, create if not — and does the same for
an open deal. The client wants the TRAX CRM fed the same way, without
touching the Origami logic at all.

Note: the workflow's own sticky note ("שלב 1 בלבד... לא כותב שום דבר
לאוריגמי") is stale — the actual node graph already fully implements the
Origami read/write logic described above. Don't trust that note; the graph
is the source of truth.

**Decision**: added one new node,
`סנכרון ל-TRAX CRM (מקביל לאוריגמי)`, as a second target on the same "not a
duplicate" output the Origami branch already starts from (`האם כפילות
שליחה? (G3)`) — a genuine parallel fork, not a change to any existing node.
It POSTs the same G1-normalized payload to a new Edge Function.

**New Edge Function**: `supabase/functions/wf05a-crm-sync/index.ts`.
Deliberately NOT a change to the existing `lead-intake` function — a
different, already-working n8n workflow (`TRAX - Lead Intake`,
`pjhRD7eOj8Xs7aDR`) depends on `lead-intake`'s current contract, and
WF05a's payload shape (phone already E.164, nested `utm` object with
`utm_keyword`/`utm_ref` instead of `utm_term`/`referrer`) is different
enough that reusing it would have risked that workflow instead of cleanly
adding a new one.

Logic, matching exactly what the client asked for:
1. Search `customers` by `mobile_phone` (TRAX's identity key) — update
   contact/attribution fields if found (never touches `status`, so a repeat
   submission can't regress someone past "ליד חדש"), create with
   `status='ליד חדש'` if not.
2. Search `sales` for that customer where `stage` isn't in the closed set
   (`נסגר בהצלחה` / `עסקה הופסדה`) — update if found, create if not.
3. Every UTM field from the webhook is written to both `customers` and
   `sales`: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`,
   `utm_term` (mapped from WF05a's `utm_keyword`), `landing_page` (from
   `page_url`), `referrer` (from WF05a's `utm_ref`).
4. A sale with no `journey_id` yet gets defaulted to the nearest upcoming
   TRAX journey (`departure_date >= today`, ascending, first match) — never
   overwrites an already-linked journey.

Also added the same `utm_*`/`landing_page`/`referrer` fields (and the
missing `account_manager_id`) to `api-v1`'s customers/sales field allow-list
— they existed as DB columns from an earlier session but weren't exposed
through the generic API yet.

**Verified live**: sent a real POST to the production webhook URL twice
(once directly at the Edge Function to prove idempotency — same customer/
sale IDs both times — then once at the actual n8n webhook). Pulled the
resulting n8n execution via the API and confirmed, in the SAME execution:
the Origami branch created a customer there (`_id
6a95ff968ac331042a001c26`), and the new branch created the matching TRAX
CRM customer+sale with all UTM fields and the nearest-journey default
correctly populated — proving both branches ran cleanly, with neither
interfering with the other. Test data was cleaned up on the TRAX CRM side
(`customers`/`sales` rows deleted); the Origami test record was **not**
deleted (didn't want to write a delete against a live third-party system
without an established, verified-safe pattern for it) — worth a manual
cleanup in Origami if that matters (name "בדיקת וובהוק", phone
+972501118888).

**What this doesn't cover**: `Xcon` isn't handled by this branch — WF05a is
specifically the TRAX website's own lead form, it has no Xcon variant, so
`business_unit` is hardcoded to `TRAX`.
