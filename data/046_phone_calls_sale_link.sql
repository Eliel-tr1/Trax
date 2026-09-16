-- Retro-link existing calls to their customer's best-matching sale:
-- prefer the customer's OPEN sale (work on an active deal), else the most
-- recent sale. Calls for customers without any sale stay unlinked.
update phone_calls pc
set sale_id = best.sale_id
from (
  select distinct on (pc2.id)
    pc2.id as call_id,
    s.id as sale_id,
    (case when s.stage not in ('נסגר בהצלחה','עסקה הופסדה') then 0 else 1 end) as prio,
    s.created_at
  from phone_calls pc2
  join customers c on c.id = pc2.related_id and c.deleted_at is null
  join sales s on s.customer_id = c.id and s.deleted_at is null
  order by pc2.id, prio asc, s.created_at desc
) best
where pc.id = best.call_id and pc.sale_id is null;