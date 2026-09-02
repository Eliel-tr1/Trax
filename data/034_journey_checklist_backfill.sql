-- Backfill journey checklists: the 031 trigger only fires on INSERT, so the
-- 8 journeys that predated it have no checklist rows. Seed them now.
insert into journey_checklist_items (journey_id, label, position)
select j.id, t.label, t.position
from journeys j
cross join checklist_templates t
where t.scope = 'journey'
  and j.deleted_at is null
  and not exists (select 1 from journey_checklist_items c where c.journey_id = j.id)
order by j.id, t.position;

select j.name, count(c.id) as items
from journeys j left join journey_checklist_items c on c.journey_id = j.id
where j.deleted_at is null
group by j.name;