# 0004 — Archive and delete the Supabase project instead of paying to keep it idle

**Context:** The client project isn't being activated right now — this was
a test/demo build. The Supabase project (`trax-crm`, ref
`zahrgdefjekucizocjtu`) costs $10/month even sitting idle: it's on the
smallest compute tier available (`Micro`) because the org
(`Eliel-tr1's Org`) is on the Pro plan, which has no free compute tier —
`Nano` (the actual free tier) is locked out entirely for Pro-tier orgs.
Pausing isn't available either (the pause API only works on free-tier
projects). There is no cheaper "keep it running" option — only pay, or
stop the project existing.

**Decision:** Take a full data + schema snapshot (`data/archive/`), then
delete the project. The schema is already fully reproducible from
`data/001...007_*.sql` (checked into git); the data snapshot in
`data/archive/*.json` plus the restore steps in `data/archive/README.md`
make the live *content* (25 test customers, 29 sales, 7 journeys, etc. —
all synthetic seed/QA data, no real client information) recoverable too.

**Why this over the alternatives:**
- Downgrading the whole org from Pro to Free wasn't chosen because it's
  an account-wide change that could affect other projects under the same
  org, not something to do without knowing what else lives there.
- Paying $10/month to keep an unused test project alive indefinitely
  wasn't worth it once a real recovery path existed.

**What this costs:** Restoring later isn't instant — a new project has to
be created, migrations reapplied, data reimported with UUID remapping for
the two auth users, Edge Functions redeployed, a fresh API key generated
(the old one's plaintext was never stored, by design — only its hash),
and the n8n workflow repointed. `data/archive/README.md` has the exact
steps. Any files actually uploaded to Supabase Storage before the
snapshot (there was only the one avatar image at snapshot time) are not
recoverable — only SQL-level table data was archived.

**Status:** Active — the project was deleted after this snapshot was
taken and verified.
