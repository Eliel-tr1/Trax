-- Full UTM field set on customers/sales — the earlier utm_source/medium/
-- campaign/content/term/landing_page/referrer columns only covered part of
-- what WF-05a's real lead-form submissions actually carry (confirmed via a
-- real historical n8n execution, id 342): funnel, utm_adset, utm_ad, and
-- utm_placement were being silently dropped. See
-- docs/decisions/0006-wf05a-trax-crm-parallel-branch.md.

alter table customers add column if not exists funnel text;
alter table customers add column if not exists utm_adset text;
alter table customers add column if not exists utm_ad text;
alter table customers add column if not exists utm_placement text;

alter table sales add column if not exists funnel text;
alter table sales add column if not exists utm_adset text;
alter table sales add column if not exists utm_ad text;
alter table sales add column if not exists utm_placement text;
