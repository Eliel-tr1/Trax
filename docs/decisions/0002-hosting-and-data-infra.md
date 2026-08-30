# 0002 — Hosting and data infrastructure

**Context:** Need a backend (auth, database, file storage, server-side
functions) and a hosting location for the frontend build, for a from-scratch
system with no data to migrate.

**Decision:**
- **Backend:** a new, dedicated Supabase project (Postgres + Auth + Storage
  + Edge Functions) — not shared with another client's project.
- **Frontend hosting:** static build, SFTP-deployed to Vitrue's own host at
  `ai.vitrue.co.il/trax-crm/`.

**Why this over alternatives:** This is the exact pattern already proven
across `bina-crm` and Vitrue Flows — same stack, same deploy mechanism,
same team familiarity. TRAX's own domain (`trax-club.com`) is on Lovable,
and per the spec Vitrue only has Lovable-invite access there, not DNS/SFTP —
so the CRM cannot live on the client's own domain today regardless of
preference.

**What this leaves open:** if the client later hands over DNS for
`trax-club.com`, a subdomain (e.g. `crm.trax-club.com`) could point at the
same host via CNAME — revisit then, not before.

**Data safety baked in from day one** (bina-crm learned these the hard way,
applying them from the start here instead of rediscovering them):
- Soft-delete + audit log on every table — nothing is ever hard-deleted from
  a customer/sale/registration record.
- Storage keys are ASCII-only; original (possibly Hebrew) filenames are kept
  as metadata, never as the storage key.
- Nightly backup Edge Function dumping all tables to a Storage bucket.
- RLS policies split by write-vs-read from the start (bina-crm shipped with
  a bug where a single `FOR ALL using(true)` policy accidentally governed
  SELECT too, bypassing per-rep read restrictions — split INSERT/UPDATE/
  DELETE from SELECT from the first migration, not as a later fix).

**Status:** Active.
