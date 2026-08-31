# QA checklist

Concrete break-scenarios, not "does it work" — per the Bina+ playbook
(see [decisions/0003](decisions/0003-generic-automation-and-api-layer.md)).
Each finding: what was expected, what happened, severity. Run every round
against real data (empty systems always look fine).

## 1. Basic CRUD (per object: customers, sales, journeys, registrations)
- [ ] Create, read, update, soft-delete each object via UI and via `/api-v1`.
- [ ] Save with a required field empty — must block with a clear message.
- [ ] Invalid values: bad phone/email format, negative numbers where
      disallowed, nonsensical dates.
- [ ] A CHECK-constraint value not in the closed list — must be rejected
      (422), not silently coerced.
- [ ] Very long text in a short field, special characters, quote marks.
- [ ] Rapid double-submit on save — must not create two records.

## 2. Business-unit isolation (TRAX-specific, not in the generic playbook)
- [ ] Nothing in TRAX view/list/dashboard ever shows an Xcon record or vice
      versa — check every list, every dedup lookup, every automation.
- [ ] Identical phone number across business units must NOT be treated as
      the same customer.

## 3. Data integrity
- [ ] Delete a customer with linked sales/registrations — must block with an
      explanation, not cascade silently.
- [ ] Duplicate a value that should be unique (TRAX phone, Xcon work email)
      — must reject (409), not create a duplicate.
- [ ] Closing a sale as "עסקה הופסדה" without a loss reason — blocked at
      both UI and DB level.

## 4. Automation engine
- [ ] Deactivate a rule, perform the action that would trigger it — nothing
      happens. Reactivate, confirm it fires.
- [ ] A rule whose condition isn't met — skipped, logged as `skipped`.
- [ ] A rule that throws — logged `failed`, the triggering record's own save
      still succeeds (don't let automation break the main write).
- [ ] Recursion guard: a rule that would trigger itself doesn't infinite-loop
      (depth cap at 3, logged `skipped` past that).

## 5. Generic API (`/api-v1`)
- [ ] All 5 verbs against one object, with a real API key.
- [ ] No key → 401. Inactive key → 401. Unknown object → 404.
- [ ] Unknown field in request body → 400, not silently dropped.
- [ ] Duplicate unique value → 409. Invalid enum value → 422.
- [ ] `api_request_logs` actually records every call (path, status, timing).

## 6. Security sweep
- [ ] No secrets anywhere in git history (`git log -p` scan) or in the repo
      as committed files — only `.env.example` with empty values.
- [ ] Only the anon/publishable Supabase key ever reaches the browser bundle
      (check the built `dist/` for the service role key — must not appear).
- [ ] RLS is enabled on every single table with zero exceptions
      (`list_tables` verbose — check `rls_enabled` on all of them).
- [ ] Logged out / no session: try reading data with only the anon key —
      confirms RLS actually blocks unauthenticated reads, not just that a
      policy exists.
- [ ] Edge Function errors return a generic message to the caller; the
      verbose error goes to `console.error`/logs only, never the response
      body (already true in `api-v1` — verify it stays that way).

## 7. UI / UX
- [ ] Empty states: what does a brand-new login see with zero data.
- [ ] Error messages say what to fix, not just "error".
- [ ] Unsaved-changes warning before navigating away from an edit.
- [ ] RTL correctness — logical CSS properties, not physical left/right
      (bina-crm's history has multiple real bugs here, see its memory file).

## 8. Mobile / desktop
- [ ] Full walkthrough at a phone viewport and a desktop viewport (two of
      the required passes tonight) — not just resizing and eyeballing,
      actually use the flows: login → list → filter → open record → edit →
      save → back.

## 9. Load (light check, not a real load test)
- [ ] A list view with a few hundred seeded rows — does it stay responsive.

---

Each round: log findings in this file's "Results" section below (create it on
first use) as a table — category, scenario, expected, actual, severity —
sorted by severity. A round that finds nothing didn't really run.
