# Architecture

## What this system is

A standalone CRM for **TRAX Adventure Club** (trax-club.com) — a premium
adventure-travel club — plus its founder's second business unit, **Xcon**
(SAP consulting, xcon.pro). One system, two fully-separated business units
(`יחידה עסקית`: TRAX / Xcon), sharing the same entity model.

This system **replaces Origami** as the system of record. Origami was the
platform decided with the client in the 09.08.2026 spec meeting and is
partially wired up already — see
[decisions/0001-replace-origami-with-custom-crm.md](decisions/0001-replace-origami-with-custom-crm.md)
for why we're building our own instead, and what that costs.

The content — entities, fields, business rules, dashboards — comes directly
from the approved CRM-Studio spec
(`https://ai.vitrue.co.il/crm-studio/editor.html?id=8`) and the live ClickUp
execution tracker (list `901524934835`, under client folder `86cb0vhev`).
See [domain-model.md](domain-model.md) for the full spec and
[roadmap.md](roadmap.md) for build order.

## Why this architecture

Modeled directly on `bina-crm` (Bina+'s service/sales CRM, also built by
Vitrue) — same stack, same proven generic framework, different domain
content. Reusing bina-crm's plumbing means we start from a system that has
already been through multiple rounds of real QA (RTL, accessibility,
data-loss bugs, RLS bugs) instead of re-discovering the same issues.

**Reused from bina-crm (generic, content-free):**
- `ResourceList` + `RecordLayout` + `RecordFormModal`/`EditField` — the
  list/record UI framework (Fireberry-style: related-record chips, inline
  edit, stage bars, tabbed field sections).
- `lib/schema.js` + `lib/ra/providers.js` — schema-driven `ra-core`/
  `ra-supabase` data layer.
- `ActivityFeed`, `Modal`/`Dialogs`/`Toaster`, `GlobalSearch`,
  `Notifications`, `CustomFields`, `Duplicates` (dedup/merge — re-keyed per
  business unit instead of bina's single-key dedup), `Permissions`.
- `lib/finance.js`'s *pattern* — generalized for TRAX's deposit/paid-in-full
  tracking and €/₪/$ currency, not bina's specific financing math.
- shadcn-admin chrome (`components/list/Toolbar`, `FacetedFilter`,
  `Pagination`), the `theme-bridge.css` trick, `lib/export.js`.

**Not reused** — everything training-portal-shaped: lessons/modules/
attendance/content-release/quiz/video-library/knowledge-base-Q&A, and the
whole support-ticket system (TRAX's sales process is 100% human-closed, no
ticketing concept in the spec).

## Stack

- **Frontend:** React + Vite, same conventions as bina-crm / Vitrue Flows.
- **Backend:** Supabase — Postgres, Auth, Storage, Edge Functions. New
  dedicated project (not shared with another client).
- **Hosting:** static build, SFTP-deployed to Vitrue's own host
  (`ai.vitrue.co.il/trax-crm/`, `/trax-crm/` base path) — see
  [decisions/0002-hosting-and-data-infra.md](decisions/0002-hosting-and-data-infra.md).
- **Automation:** N8N (existing shared Vitrue server) handles everything
  that isn't a computed field or an internal record automation — see
  domain-model.md's "what stays in the CRM vs. N8N" table.

## Data model — high level

Four custom entities (לקוח / מכירה / מסע / הרשמה למסע) plus standard CRM
objects (task, meeting, phone call, note, document, contact). Full field
lists, relationships, and business rules: [domain-model.md](domain-model.md).

```
לקוח (Customer) ──1:N── מכירה (Sale)
לקוח ──1:N── הרשמה למסע (Registration)
מסע (Journey) ──1:N── הרשמה למסע
מכירה ──1:N── הרשמה למסע
```

`הרשמה למסע` is the only entity with three parents — it's the record that
actually occupies a seat, recounted per event rather than tracked as a
cumulative counter.

## Automation & API layer

Business-rule automations run through a generic rule engine
(`automation_rules`/`automation_logs`, one dispatch trigger per object) rather
than one-off triggers, and the external API surface is a generic
`/api/v1/{object}` (schema-resolved) rather than bespoke intake-only
functions — see
[decisions/0003-generic-automation-and-api-layer.md](decisions/0003-generic-automation-and-api-layer.md)
for why. Structural computed fields (seat counts, status transitions,
composite names) stay as plain triggers — only actual business rules go
through the engine.

## Integration surface

Edge Functions replace what would have been calls into Origami's API:

| Function | Replaces | Fed by |
|---|---|---|
| `lead-intake` | Origami `create_instance` on form submit | site form, landing pages, Xcon form |
| `whatsapp-inbound` | Origami lead/sale creation from WhatsApp | CloudChat webhook |
| `voice-webhook` | manual call logging | Voicenter (PBX) |
| `payment-webhook` | manual registration update | Sumit |
| `backup-nightly` | — | pg_cron |

Lead-intake payload contract (already committed to the client's forms, do
not change without updating every form): `full_name`, `phone`, `email`,
`message`, `form_id`, `utm_source`, `utm_medium`, `utm_campaign`,
`utm_content`, `utm_term`, `page_url`.

## Current status (as of 2026-08-30, from ClickUp)

- Wave 1 target (customer + sale + lead intake) was due 23.08, now passed.
- A comment on the client folder task states the website's lead-to-CRM
  connection is already reported done and a client walkthrough is scheduled
  — **on the Origami-based system**. That system and this one are about to
  coexist/conflict; the user is handling client communication about the
  switch.
- See [blockers.md](blockers.md) for the live list of client-side blockers
  (journeys list, price conflict, Meta verification) that affect Wave 2 and
  the WhatsApp/voice agent regardless of which CRM platform is underneath.
