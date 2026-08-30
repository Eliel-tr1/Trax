# Roadmap

Waves match the client's own approved scope (CRM-Studio spec §13 / ClickUp
execution list) — do not resequence without a reason recorded here.

## Wave 1 — leads have somewhere to land

Original commitment: 1-2 weeks from the spec meeting (target 23.08.2026,
now passed). Scope, unchanged:

- לקוח + מכירה entities, wave-1 fields only (see domain-model.md).
- Lead intake: site form + landing pages + WhatsApp inbound, with UTM
  capture (`utm_source` → מקור הגעה, `utm_campaign` → קמפיין).
- One list view + basic customer/deal card.
- 2 users (Goldi + Zarkosh), both full-access owners.
- Xcon lead intake + its extra customer/deal fields (§14) — in scope from
  day one, no additional cost per the client's closing email.

## Wave 2 — the full system

- מסע + הרשמה למסע entities, full field set.
- Seat computation (מקומות שנמכרו/פנויים) + status automation
  (כמעט מלא/מלא).
- Both dashboards, all 10 metrics.
- Phone call integration (Voicenter recordings/transcripts → customer card).
- Xcon view/report separation.
- Closed-won welcome message trigger.
- **Hard-blocked on the client delivering the journeys list** (destination,
  dates, price/person, seat count) — see blockers.md.

Only after Wave 2 is solid does work start on the WhatsApp agent (Max) —
that's a separate build (Vitrue Flows spec `trax-club`), this repo only
needs to expose the API surface it reads/writes against.

## Explicitly out of scope

- The WhatsApp/voice AI agent implementation itself.
- Multi-currency conversion/roll-up (rejected until TRAX sells abroad in
  practice — currency fields exist per-record, but dashboards never sum
  across currencies).
- Vendor management.
- Anything not written down: per the project's own rule, "כל מה שכתוב יבוצע,
  כל מה שלא כתוב לא יבוצע" — a new ask goes through a decision record here
  first, classified in-scope / upsell / rejected, never built quietly.
- Five ideas explicitly rejected by the client (08.08.2026) — do not revive
  without an explicit new request: daily morning report, pre-call customer
  file prep, an NPS engine, a departure fill-rate gauge dashboard, a
  pre-trip journey flow.
