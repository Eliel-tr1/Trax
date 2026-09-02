# Deploy runbook — TRAX CRM

Last updated: 2026-09-02 (Cloudflare migration)

## Environments

| Environment | URL | How it deploys |
|---|---|---|
| **Production** | https://trax-crm.pages.dev (domain pending, will be a client subdomain) | deploys to `main` branch of Cloudflare Pages project `trax-crm` |
| **Staging (testing)** | https://staging.trax-crm.pages.dev | deploys to `staging` branch — stable alias, work here by default |
| Preview (ephemeral) | `<hash>.trax-crm.pages.dev` | any other branch, auto URL per deploy |
| ~~Vitrue server~~ | ~~ai.vitrue.co.il/trax-crm/~~ | RETIRED 2026-09-02 — both `trax-crm/` and `trax-crm-backup/` folders were deleted from the server |

Both Cloudflare URLs hit the **same Supabase** project (`bkjqwroclpefwtyxjfkl`).

## Rule of thumb

- Work/test on **staging** (`staging.trax-crm.pages.dev`).
- Promote to production only on explicit request: deploy to `main`.
- The Vitrue SFTP deploy path is gone; do not use `deploy.js` / `deploy-backup.js` without updating them first.

## Manual deploy (works today, from a machine with wrangler logged in)

```bash
npm install

# Staging (test) — uses repo default base /trax-crm-backup/? NO — always build with --base=/
BUILD_ID=stg-$(date +%s) npx vite build --base=/
npx wrangler pages deploy dist --project-name trax-crm --branch staging

# Production — only on explicit request
BUILD_ID=prod-$(date +%s) npx vite build --base=/
npx wrangler pages deploy dist --project-name trax-crm --branch main
```

`wrangler login` is required once per machine (OAuth in browser).

### ⚠️ The `--base=/` flag is mandatory

`vite.config.js` still defaults to `base: '/trax-crm-backup/'` (legacy of the
Vitrue path). Building without `--base=/` produces a bundle that renders a
**blank page** on Cloudflare because assets point at the old path. Fixing the
default in vite.config.js is the pending cleanup (see "Pending" below).

## Pending / next steps

1. **Fix vite.config.js** — change `base` default to `/` (or env-driven) and
   delete `deploy.js` / `deploy-backup.js` once nothing needs SFTP deploys.
2. **Connect GitHub → Cloudflare Pages** in the dashboard (build command:
   `npx vite build --base=/`, output dir: `dist`) so pushes auto-deploy:
   push to `staging` → staging URL; push to `main` → production.
3. **Domain** — client to provide registrar access; then add a CNAME record
   `<subdomain>` → `trax-crm.pages.dev` and attach it in Pages → Custom domains.
4. Supabase: verify RLS on all tables; verify a backup restore; separate user
   accounts (no shared logins).
