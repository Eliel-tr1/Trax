-- marketing_consent — the site's lead form has a "אישור דיוור" checkbox
-- (real field name from the site: marketing_consent) that had no home in
-- the CRM. Customer-only (it's consent from the person, not per-deal).
-- See docs/decisions/0006 for the wf05a-crm-sync integration this feeds.

alter table customers add column if not exists marketing_consent boolean;
