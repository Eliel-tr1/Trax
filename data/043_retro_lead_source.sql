-- Retro lead_source (Sahar 05.09) — applied and verified live.
-- Evidence from n8n WF-05a executions: real Meta lead-ads carry
-- utm_source=facebook; campaign 'לאוס | לידים | 01.09' is Sahar's Instagram
-- campaign (his explicit fallback rule), facebook utm without it = פייסבוק,
-- no utm/campaign at all = the site itself.
-- Final distribution (customers = source of truth, sales aligned):
--   אינסטגרם 28+1(stragglers), פייסבוק 1(+2 sales w/o customer),
--   אחר 1, אתר TRAX 1.

update customers set lead_source = 'אינסטגרם'
where deleted_at is null and business_unit='TRAX'
  and campaign = 'לאוס | לידים | 01.09'
  and lead_source is distinct from 'אינסטגרם';

update customers set lead_source = 'פייסבוק'
where deleted_at is null and business_unit='TRAX'
  and utm_source = 'facebook'
  and (campaign is null or campaign <> 'לאוס | לידים | 01.09')
  and lead_source is distinct from 'פייסבוק';

-- no campaign at all → the site itself (אתר TRAX), per Sahar
update customers set lead_source = 'אתר TRAX'
where deleted_at is null and business_unit='TRAX'
  and (campaign is null) and utm_source is null
  and lead_source is distinct from 'אתר TRAX';

-- sales mirror their customer
update sales s set lead_source = c.lead_source
from customers c
where s.customer_id = c.id and s.deleted_at is null and s.business_unit='TRAX'
  and s.lead_source is distinct from c.lead_source;

-- orphaned sales: same rule directly
update sales set lead_source = 'אינסטגרם'
where deleted_at is null and business_unit='TRAX'
  and campaign = 'לאוס | לידים | 01.09' and lead_source is distinct from 'אינסטגרם';
update sales set lead_source = 'פייסבוק'
where deleted_at is null and business_unit='TRAX'
  and utm_source='facebook' and (campaign is null or campaign <> 'לאוס | לידים | 01.09')
  and lead_source is distinct from 'פייסבוק';