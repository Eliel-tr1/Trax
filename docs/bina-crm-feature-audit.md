# bina-crm feature audit — what's missing, screen by screen

Written from an actual read of `C:\Users\sahar\Claude Code\bina-crm`'s
current `src/pages/` and `src/components/` (not memory), after the owner
called out that earlier passes were shallow. Portal/content-specific
screens (Products/Cycles/Lessons/Modules/Attendance/Knowledge/Quiz/
VideoLibrary/ContentRelease/StudentProjects/Submissions/Guide/HowTo/
PromptLibrary/Tickets — the whole training-portal side) are excluded per
the owner's instruction. Everything below is a genuine CRM feature.

## Settings — bina has 9 tabs, TRAX has 6

bina's `Settings.jsx`: תצוגה (theme) · נציגים · הרשאות · סל מיחזור ·
מיזוג כפילויות · API וגיבויים · דוקומנטציה · מדריך שימוש · הדרכה.

- [ ] **תצוגה (theme light/dark)** — TRAX's CSS already has a full
  `[data-theme="dark"]` palette (index.css), there's just no toggle
  anywhere. Cheapest real gap to close.
- [ ] **הרשאות is read-only in TRAX** — bina's `Permissions.jsx` is a live,
  editable matrix: create/delete a role inline, click any view/create/
  edit/delete/export/manage checkbox to toggle it immediately (optimistic
  update + toast), a per-resource scope select (own/team/all) for owned
  resources. TRAX's roles/permissions tables already support this
  structurally (`data/006...sql` just added the missing INSERT/UPDATE/
  DELETE RLS policies) — this is a UI gap, not a schema gap.
- [ ] **מיזוג כפילויות (Duplicates)** — not portal-specific, a real CRM
  feature. `bina-crm/src/pages/Duplicates.jsx` — reconsider porting
  (earlier decision 0003 excluded it citing the DB unique constraint as
  "enough"; the owner's "don't miss anything" instruction overrides that).
- [ ] **API וגיבויים tab** — TRAX has a bare API-keys *list*, bina's
  version can generate a new key inline (with scopes), toggle active,
  delete, run a manual backup, and restore from one. TRAX's backup/
  restore Edge Function doesn't exist yet at all.
- [ ] **דוקומנטציה (self-generating API docs page)** — `bina-crm/src/pages/
  ApiDocsPage.jsx` — worth porting for TRAX's own generic `/api-v1`, since
  it's genuinely generic (lists every object + its fields, live curl
  examples). Would double as real documentation for the n8n integration.
- [ ] **הדרכה (onboarding tour)** — see below.
- [ ] **שדות מותאמים ורשימות (custom fields + picklists)** —
  `Settings.jsx`'s `SchemaTab` (per-object custom field definitions +
  editable picklist option lists). Schema now exists
  (`custom_fields`/`picklists` tables, `data/006...sql`), UI doesn't yet.

## Profile — TRAX's is much thinner than bina's `MySettings.jsx`

- [ ] **Sidebar customization** — drag-to-reorder nav items + per-item
  show/hide, saved to `app_users.prefs` (jsonb — TRAX doesn't have this
  column yet, add it), applied live without a save button.
- [ ] Phone field (TRAX's Profile only has full_name).
- [x] Avatar upload — already done.
- [x] Password change — already done.

## Permissions — see Settings above, same gap

## Notes/activity feed — no file upload

- [ ] Every detail page's note composer needs a file-attach control
  (`bina-crm/src/components/ActivityFeed.jsx` uploads to a Storage bucket
  `attachments`, saves `file_url`/`file_name`/`file_type`/`file_size` on
  the note row — schema now added in `data/006...sql`) and
  `bina-crm/src/components/Attachment.jsx`'s display component (inline
  image preview, typed file chip with icon+size for everything else) —
  port this file close to as-is, it's generic.

## Onboarding — doesn't exist in TRAX at all

- [ ] `bina-crm/src/components/Onboarding.jsx` — a real click-through
  spotlight tour (not a slideshow): info steps the user advances, action
  steps that wait for the user to actually click the real control before
  continuing. Needs a fresh set of steps written for TRAX's own screens
  (dashboard, customer/sale/journey/registration lists+records, business-
  unit switcher, profile) — don't reuse bina's step content, the screens
  don't match.

## Other bina components worth a look (evaluate, port only if a clean fit)

- `TeamsDialog.jsx` — team management. TRAX's spec has no "team" concept
  (only individual owner_id/assignee_id) — skip unless a real need shows up.
- `UserPicker.jsx` — reusable multi-user picker widget. Useful for
  `meetings.participants` (uuid[]), which currently has no add/remove UI.
- `HomeConfig.jsx` — per-user default landing screen. Minor, low priority.
- `ImageCropDialog.jsx` — avatar crop-to-square. TRAX's avatar upload
  currently skips cropping; nice-to-have, not required.

## Explicitly still excluded, confirmed correct

`CustomFields.jsx`'s *object-type-picker-and-add* UI is now in scope (the
schema exists), but nothing training-portal-shaped is: Products/Cycles/
Lessons/Modules/Attendance/Knowledge/Quiz*/VideoLibrary/VideoDetail/
ContentRelease/StudentProjects/StudentProgress/StudentSetupModal/
Submissions/Guide/HowTo/PromptLibrary/CloudChatEmbed/Tickets/TicketDetail/
ReplyComposer/EmailMessage — all confirmed portal/service-specific, not
relevant to a travel-club sales CRM.
