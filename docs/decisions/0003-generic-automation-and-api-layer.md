# 0003 — Generic automation engine + object-level API, instead of one-off code

**Context:** Reviewed Bina+'s internal "building a CRM in Claude Code" playbook
(`https://bina-plus.co.il/presentations/crm/vibecode/`) mid-build. It documents
patterns for exactly this kind of build that this repo hadn't fully adopted yet.

**Decision:**
1. **Business-rule automations run through a generic rule engine**
   (`automation_rules`/`automation_logs` tables + one dispatch trigger function
   per object), not hand-written one-off triggers — except for the seat-count/
   status-transition logic on מסע, which stays a plain trigger because it's a
   structural computed field, not a business rule anyone would want to edit.
   The dispatch function has a **recursion-depth guard** (max 3) so a rule that
   updates a field can't trigger itself into an infinite loop, and a failed
   rule is caught and logged without blocking the record save or other rules.
   The three Wave-2 follow-up-task/notification rules from the spec are seeded
   as data (`automation_rules` rows), not code.
2. **A generic `/api/v1/{object}` surface**, schema-resolved, instead of a pile
   of bespoke intake-only Edge Functions. The already-committed lead-intake
   payload contract (full_name/phone/email/.../utm_*) stays exactly as
   documented to the client — it becomes a thin translation layer over the
   generic API, not a separate one-off endpoint. This is also the closer
   structural match to what we're replacing: Origami itself exposed a generic
   entity API (`entities_list`/`instance_data`/`create_instance`), not
   per-object endpoints.
3. **A notification center** (`notifications` table, unread-count bell) and
   **settings-as-data** (`system_settings` key/value table for the system name
   etc., not hardcoded) — cheap, and where automation actions like "alert the
   team on handoff" naturally land.

**Deliberately deferred, not adopted tonight:**
- A fully user-editable saved-views engine (named views, shareable, with
  filters/columns/sort stored as data and created from the UI). bina-crm's
  framework already persists per-user column config; user-*created* named
  views is real additional scope. TRAX has 2 full-access users right now —
  revisit when a third user or reporting need justifies it.
- The full role × object × scope (all/team/mine) + field-level permission
  matrix from the playbook. Right architecture for when TRAX actually adds a
  sales rep or trip escort role (already planned in domain-model.md §org) —
  building the matrix now, against 2 users who are both full owners, would be
  premature.
- A generic dashboard-widget engine (table/bar/pie/metric/list widgets driven
  by stored query definitions). The right shape for Wave 2's 10 metrics, but
  Wave 2 dashboards aren't being built tonight regardless.

**Status:** Active. The automation-rules and generic-API decisions apply from
tonight's build forward; the deferred items should be picked up as their own
decision records when their trigger condition (3rd user, Wave 2 dashboards)
is reached, referencing the playbook again then.
