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

## Follow-up (same day): defaults, full UTM set, execution_url

Client feedback after the first pass, all applied:

- **`lead_source` is hardcoded to `"אתר TRAX"`**, not derived from
  `utm_source` — a real bug in the first version. `lead_source` (מקור הגעה)
  is TRAX's own channel taxonomy (site / landing page / referral / etc.);
  `utm_source` (the ad platform that drove traffic TO the site) is a
  different concept and stays in its own column.
- **Default account manager / sales rep**: every customer/sale created by
  this branch gets `account_manager_id`/`owner_id` = גולדי
  (`772a4955-5302-475a-ba69-2e3a2929d0f0`), until reassigned.
- **Full UTM field set**: a real historical n8n execution (id `342`)
  revealed the site form actually sends `funnel`, `utm_adset`, `utm_ad`,
  and `utm_placement` too, on top of the 6 already mapped — these were
  being silently dropped. Added as new columns (migration
  `data/015_full_utm_fields.sql`) and now written on both `customers` and
  `sales`.
- **`next_call_at`** defaults to the moment the lead came in (same day),
  on both create and update — a repeat form submission is renewed
  interest, so it bumps the follow-up date even on an already-open sale.
- **Notes**: no real form submission has ever included a message field
  (checked execution history) — built defensively for when the site form
  adds one (reads `message`/`notes`/`comment` off the RAW webhook body, not
  G1's filtered output, so G1 itself stays untouched). Appends rather than
  overwrites on a repeat submission, so an earlier note isn't lost.
- **`execution_url`**: the new n8n node now computes
  `{n8n_url}/workflow/{id}/executions/{execution.id}` via n8n's own
  `$workflow`/`$execution` expressions and writes it to both `customers`
  and `sales` on every create/update from this branch — the `execution_url`
  column already existed everywhere per earlier work, this is what
  actually populates it for this specific automation.

Verified live again after these changes: a real webhook POST with a
message and the full UTM set produced exactly the expected row — hardcoded
lead_source, appended note, Goldi as account manager/rep, all 10 UTM-ish
fields, a real execution_url, and next_call_at at submission time. Test
data cleaned up afterward.
