# 0001 — Replace Origami with a custom-built CRM

**Context:** The approved client spec (CRM-Studio `id=8`, closed decision
from the 09.08.2026 meeting) and the live ClickUp execution tracker both
record "פלטפורמת CRM: אוריגמי" as locked. Real setup work had already
started on Origami (account opened, credit card given, API key received),
the site's lead-to-CRM connection was reported done, and a client
walkthrough of the Origami-based system was scheduled.

**Decision:** Build a standalone React + Supabase CRM instead, modeled on
`bina-crm`'s architecture, and use it as the system of record going
forward. Confirmed explicitly by the project owner after being shown the
conflict above.

**Why this over Origami:** Not recorded here — this was the project
owner's call, made with full visibility into what it overrides. If the
reasoning matters for future work, add it.

**What this costs / what must happen alongside it:**
- The client-facing spec and ClickUp's locked-decisions list are now
  **out of date** and need updating — this repo does not update them.
- The already-reported "lead-to-CRM connection" and the scheduled client
  walkthrough were built against Origami; someone needs to decide whether
  that work is discarded, ported, or the walkthrough is postponed.
- The retainer pricing and third-party cost breakdown already shown to the
  client include Origami as a line item (₪200-250/user) — the commercial
  numbers may need revisiting.
- `origami_traxclub_api.md` (Vitrue's memory) documents a live, working
  Origami API connection for this account — that integration becomes
  unused unless a future decision brings it back (e.g. as a migration
  source, or a parallel write target during a transition period).

**Status:** Active. Revisit if the client relationship or commercial terms
around this change.
