# Session handoff — 2026-09-01

Written because the working Claude Code session hit ~99% context usage and
could disconnect mid-task. Read this first if you're picking this project
up from a different machine/session — it tells you exactly where things
stand and what to do next.

## TL;DR

The TRAX CRM is live at **https://ai.vitrue.co.il/trax-crm/**, backed by
Supabase project `bkjqwroclpefwtyxjfkl` (billing active, ~$10/mo). Login:
`goldi@trax-crm.test` / `TraxCrm2026!q` (also `zarkosh@trax-crm.test` same
password) — though in practice the app currently renders without forcing a
login screen in most browser sessions.

Two large feature rounds are done and deployed. A **third round of ~24
fixes is currently mid-flight** across 8 background agents when this doc
was written — see "In-flight work" below before assuming anything in that
list is finished.

## How this session worked (context for whoever resumes)

Large batches of work were parallelized across many `general-purpose`
background agents, all editing the **same live working tree** directly
(no git worktree isolation was available in this environment — the
harness's own cwd wasn't a git repo, which `Agent({isolation:"worktree"})`
requires). Each agent was told to commit its own small scoped commit when
done. This worked well in practice — check `git log --oneline` for the
real history, it's honest about what shipped in what order.

**Known failure mode to watch for**: subagents sometimes tried to "wait
for a background build/deploy to notify them" — that notification
mechanism doesn't exist for subagents (only the top-level session gets
task-notifications). When that happened, they had to be sent a direct
message telling them to act synchronously instead. If you're resuming
work with more background agents, tell them explicitly up front: *act
synchronously, foreground, in the same tool-call turn — never wait for a
notification that will never arrive.*

## What's actually done (verified live, both rounds)

**Infra**: Supabase project restored from an archived deletion, schema +
seed data intact, both users recreated, all 3 original Edge Functions
redeployed.

**Round 1** (dashboards, tables, users, Cardcom, passengers, calls infra,
mobile pass) — see git log commits from `6e136b8` through `59a0c09`.

**Round 2** (this session's big client punch-list) — see commits `823aa81`
through `8cc473c`, roughly:
- Global date (`DD/MM/YYYY - HH:mm`), currency, and phone (flag-picker)
  formatting utilities — `src/lib/format.js`, `src/components/PhoneInput.jsx`
- Sale record reworked: loss-reason conditional, lost-stage renamed to
  "עסקה הופסדה" (DB constraint + all rows + all code refs), system/marketing
  tabs (`src/components/FieldTabs.jsx`)
- Two real, fully root-caused bugs fixed (**read these comments in the
  code, they document a genuinely tricky diagnosis**):
  - `src/components/list/ColumnLayoutSync.jsx` — a save effect that fired
    unconditionally on mount, causing a self-sustaining ~1-2s
    mount→save→remount loop with zero user interaction ("the screen keeps
    refreshing"). Fixed with an `armedRef` that makes the effect inert on
    its first eligible firing.
  - `src/stores/permissionStore.js` — `load()` unconditionally set
    `loading:true`, and `RequirePermission.jsx` unmounts its guarded
    subtree while `loading` is true — so ANY background permission
    refresh (e.g. editing a role's checkboxes in Settings) unmounted and
    remounted the very screen the user was on, resetting its local state
    ("the screen jumps to a different panel"). Fixed with a `silent` param
    on `load()` that skips the loading flip for background refreshes.
  - **If you hit another "screen refreshes/resets for no reason" bug,
    this exact pattern (an effect firing on mount + a loading flag some
    ancestor conditionally unmounts on) is the first thing to check.**
    Diagnostic technique that worked: hook `window.fetch` in the live
    browser via `javascript_tool` to log stack traces of the repeating
    network call, then add temporary `console.log` mount/unmount tracers
    gated behind a `window.__DEBUG` flag, deploy, and read the actual
    sequence — don't guess from static code reading alone past a certain
    point.
- Dashboard v2: single-line filter row, Xcon-aware (hides journeys),
  richer metrics, saved-views "create" button
- Registration passengers moved to main view, popup add-modal, compact
  journey passenger rows, branded PDF export
- 30 rows of demo data (calls/tasks/meetings), Users screen rework,
  permissions screen (pick-one-role dropdown)
- Entity-wide: colored status badges, generalized system-fields tab,
  bulk select/edit/delete on all 6 lists, 8 seeded shared preset views
- Quick-create meeting/task from the activity composer with smart
  defaults, generic searchable `EntityPicker` for every entity-reference
  field
- New `/my-desk` rep home screen — self-scoped, shrinks as things resolve
- Login page background video (hotlinked from trax-club.com's own hero
  video — their own asset, their own internal CRM, decided reasonable
  rather than bundling 14MB into the build) + 4 random deal-won
  celebration effects (fireworks+chime, jeep, skier, skydiver — hand-built
  CSS/SVG, no external media licensing risk)
- **Max, the AI assistant** — fully built (floating widget, session
  management, read-only tool-calling against a fixed allow-list of query
  functions, never raw SQL) but **not yet answering questions** — see
  below.

## In-flight when this doc was written (check `git log` / re-verify before trusting)

8 parallel agents were dispatched for a further ~24-item client fix list
and may or may not have finished/committed by the time you're reading
this. Topics, roughly:
1. Dashboard: rename a mistranslated label, fix RTL layout on charts,
   **make the load-in animation actually work** (claimed done twice
   before this round and genuinely wasn't — be skeptical, demand real
   proof, not just "the code looks right")
2. Nested/related-entity list columns (add not just remove, match the
   main list's structure), fix a "column drag reload the page" bug,
   generalize system/marketing tabs + `execution_url` everywhere, add
   breathing room to the activity composer
3. Israeli phone numbers should show local `05X` format not `+972`; fix
   "clearing a field throws a raw save error" beyond just `owner_id`
4. Registration passengers: remove age-required, guarantee customer is
   always passenger #1 (including via automation + backfill existing
   rows), demo multi-passenger data
5. Phone calls: make assigned rep/customer editable, add a recording
   playback UI
6. Add "מנהל לקוח" (account manager) to customers; rename sales'
   "בעלים"→"נציג מכירות" and fix its list column to show an avatar +
   be inline-editable
7. Expand every list's filters to cover all field types via a collapsible
   panel; fix a z-index bug on the new-user avatar popup; **fix the real
   invite-user Edge Function failure** ("Failed to send a request to the
   Edge Function"); try to find Goldi's real email/phone
8. Gate `/my-desk` as a real RBAC resource (default: everyone can view,
   always self-scoped); rename a metric label; add a total-call-time
   metric

**Before continuing this list**: run `git log --oneline -20` and
`git status` to see what actually landed. Some of these may already be
committed and deployed; some may be half-done in the working tree if an
agent got interrupted.

## Known gaps / things that need a human

1. **Max's OpenAI key isn't set.** Per this session's hard security rule,
   the agent may never type an API key into any field/tool call itself —
   the user must set it themselves: Supabase Dashboard → project
   `bkjqwroclpefwtyxjfkl` → Edge Functions → Secrets → add
   `OPENAI_API_KEY`. No redeploy needed after that, `max-chat` already
   reads it from `Deno.env`. **The key was pasted in plaintext in this
   chat session twice — it should be rotated on OpenAI's side.**
2. **Voicenter/Fireberry call sync is unbuilt/untested against real
   data** — no Fireberry API token exists for TRAX's own account (only
   Amorphicure's, a different client, is in `.env`). See
   `docs/decisions/0005-voicenter-fireberry-call-ingestion.md` for the
   full design; `supabase/functions/fireberry-call-sync/index.ts` exists
   and dry-run-guards itself when no token is present.
3. **Google Calendar integration (שלב ב')** — documented as future scope
   only, never built, per an earlier explicit agreement with the user.
4. Several agents' commits landed bundled together during the shared
   working tree (git history isn't perfectly attributed per-agent, e.g.
   commit `fec25a2` contains more than its message describes) — content
   was verified intact each time, just imperfect commit boundaries.
5. Build produces one large >2MB JS chunk (Vite warns about this) — not
   fixed, code-splitting was never prioritized. Not urgent, just a known
   inefficiency if the app ever feels slow to first-load.

## Where to look

- `docs/domain-model.md` — the full field-level spec, source of truth for
  what fields exist per entity.
- `docs/architecture.md`, `docs/decisions/*.md` — why things are built
  the way they are.
- `data/*.sql` — schema history, applied in numeric order; `008`+ are
  this session's additions (UTM tracking, registration_passengers,
  saved_views, stage rename, app_users.notes, status_changed_at, Max's
  tables).
- `CLAUDE.md` — repo-wide AI working rules (read-before-act order, no
  em-dashes in UI copy, etc.) — keep it in sync if conventions change.
- Live Supabase project ref: `bkjqwroclpefwtyxjfkl` (org "Eliel-tr1's
  Org"). `.env` has the connection details.

## How to resume

1. `git pull`, read `git log --oneline -20` to see exactly what's landed
   since this doc was written.
2. Re-verify anything marked "in-flight" above before trusting it.
3. The client's original fix-list (round 3) is reproduced in full in this
   conversation's transcript if you have access to it — otherwise re-ask
   the client which of the 24 items in the "In-flight" section above are
   still outstanding, since some may have completed after this doc was
   frozen.
