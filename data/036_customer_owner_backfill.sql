-- Backfill: sync customers.owner_id from their sales' owner (the rep who
-- owns a sale should own — or at least be visible to — that customer).
-- Only fills NULL owner_id, never overrides an explicit assignment.
update customers c
set owner_id = s.owner_id
from sales s
where s.customer_id = c.id
  and s.owner_id is not null
  and c.owner_id is null
  and c.deleted_at is null;
