# Build notes — Wave 1 scaffold (2026-08-30, overnight session)

Unsupervised build per the task's blanket approval. Documenting the calls
made without asking, and what's genuinely left open.

## Deviations from the spec / implementation calls made

1. **`CustomFields.jsx` not ported.** bina-crm's version manages field
   *definitions* via a `custom_fields` metadata table that TRAX's schema
   (`data/001_init_schema.sql`) does not have — only a raw `custom jsonb`
   column per entity, no UI to define custom fields on top of it. Wiring it
   in would have meant inventing a new table not in the approved schema.
   Skipped; the `custom` column exists and is readable via direct queries
   if ever needed, but there is no admin UI for it yet.

2. **`Duplicates.jsx` (dedup/merge UI) not built.** DB-level unique indexes
   already enforce the identity-key rule per business unit (`mobile_phone`
   for TRAX, `work_email` for Xcon — see the schema's partial unique
   indexes), so silent duplicate creation is already blocked at the data
   layer. A dedicated merge UI was judged lower priority than getting
   customer/sale screens working for Wave 1 and was left out.

3. **`owner:app_users!...` / `assignee:app_users!...` embedded selects
   removed from `lib/ra/providers.js` and `ActivityFeed.jsx`.** `sales.owner_id`,
   `tasks.assignee_id`, and `notes.created_by` all reference `auth.users(id)`,
   not `app_users` — even though `app_users.id` mirrors `auth.users.id`
   1:1, there is no actual FK PostgREST can traverse, so an embedded
   `owner:app_users!sales_owner_id_fkey(...)` select 400s with "Could not
   find a relationship." Found this live while smoke-testing (see below) —
   fixed by resolving user names client-side from `loadOptions()`'s `users`
   list instead of embedding.

4. **Permission model is a stub.** `stores/permissionStore.js` is new
   (bina-crm's version is hardcoded to bina's own resource list) — `can()`
   always returns `true`, matching the spec's "2 users, both full-access
   owners, no restriction yet." `RequirePermission` is wired but currently
   a no-op gate. Easy to fill in real role logic later without touching
   call sites.

5. **Business-unit switcher** (`components/layout/BusinessUnitSwitcher.jsx`,
   `stores/businessUnitStore.js`) is new — not a bina-crm port, since bina
   has no equivalent concept. Persists to `localStorage`; every list view
   and every create-form default reads from it.

6. **Sidebar RTL side** — the ported `ui/sidebar.tsx` primitive defaults to
   `side="left"`; bina-crm's own sidebar never explicitly overrode this
   despite a comment claiming otherwise. TRAX's `AppSidebar.jsx` explicitly
   sets `side="right"`.

7. **Placeholder brand palette** in `theme-bridge.css` / `index.css` (slate/
   blue) — a real TRAX branding pass was explicitly out of scope for
   tonight per the task brief.

## Bug found and fixed during smoke-testing (important — read this)

While testing in a real browser, an off-screen click (screenshot was scaled
800×450 but the actual viewport was 1280×720, so a computed "safe" click
coordinate landed outside what the screenshot showed) hit an unintended
control and **soft-deleted every row in `customers` and `sales`** in the
live Supabase project (`deleted_at` stamped on all of them). This was
caught immediately by re-querying the DB directly, and all rows were
restored (`deleted_at = null`) via the Supabase SQL tool before finishing.
Verified row-for-row afterward — nothing lost. Flagging this here in case
anything looks off later: the affected ids were 3 customer rows
(`539bd6aa…`, `a5a54178…`, `a1158b0c…`) and 7 sales rows, all restored.

**Follow-up worth doing:** the `BulkDeleteButton` bulk-action currently has
no confirmation step visible before it fires (or the select-all + delete
combination is one click too easy to trigger by accident) — worth a
deliberate look before this ships to real users, independent of tonight's
stray-click cause.

## Deliberately left unfinished (not this session's job per the brief)

- Seeding realistic Wave 1 demo data beyond what already existed in the
  project (3 customers, 7 sales — pre-existing, not created by me).
- Deploying to `ai.vitrue.co.il/trax-crm/` (`deploy.js` is ready and
  points at the right `REMOTE_DIR`, but wasn't run).
- QA pass beyond the smoke test described above.
- Wave 2 screens (journeys, registrations, dashboards) — schema-ready,
  not built, per roadmap.md.

## Lovable prompt — Xcon contact form with proper lead submission (01.09.2026)

Paste this into Lovable for xcon.pro:

---
Update the contact form on this site so every submission is sent to our CRM
system automatically. Requirements:

1. FORM FIELDS (in this exact order, all in Hebrew UI):
   - שם מלא (full_name) — required
   - אימייל עסקי (email) — required, must be validated as an email
   - טלפון (phone) — optional
   - חברה (company) — required
   - תפקיד (role) — optional
   - תחום עניין (area_of_interest) — dropdown with exactly these options:
     ייעוץ / פרויקטים / פתרונות / Insight / ZAP / קריירה / שותפויות / אחר
   - ספרו לנו על האתגר (message) — optional textarea

2. UTM CAPTURE: on page load, read all UTM parameters from the URL
   (utm_source, utm_medium, utm_campaign, utm_content, utm_term, funnel,
   utm_adset, utm_ad, utm_placement) and store them. Also capture
   page_url (the full current URL) and referrer (document.referrer).
   Include ALL of these in the submitted JSON — even when empty, include
   them as empty strings.

3. SUBMISSION PAYLOAD (POST as application/json to the webhook URL below):
   {
     "form_id": "xcon",
     "full_name": "...",
     "email": "...",
     "phone": "... or empty string",
     "company": "...",
     "role": "... or empty string",
     "area_of_interest": "one of the dropdown values",
     "message": "... or empty string",
     "utm_source": "...", "utm_medium": "...", "utm_campaign": "...",
     "utm_content": "...", "utm_term": "...", "funnel": "...",
     "utm_adset": "...", "utm_ad": "...", "utm_placement": "...",
     "page_url": "...", "referrer": "..."
   }
   IMPORTANT: do not put the email in a "phone" field and do not rename
   keys — the CRM maps them by exact key name. form_id MUST be exactly "xcon".

4. WEBHOOK URL: POST to the n8n webhook URL we will provide
   (placeholder: https://n8n.srv1873970.hstgr.cloud/webhook/xcon-lead-intake).
   Use fetch with mode 'cors'. On success show a success message in Hebrew;
   on failure show an error message and keep the form data so the user can
   retry.

5. UX: disable the submit button while submitting, show a loading state,
   and prevent double-submits (debounce 3 seconds).
---
