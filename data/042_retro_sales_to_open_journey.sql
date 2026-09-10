-- Retro (Sahar 05.09): reassign ALL non-closed sales to Madeira, Nov 2026
-- (fa5f2b8b-3e11-4e5c-9cfe-a1ba68fb99cd), the journey he designated. Note:
-- at run time Montenegro (Oct) was ALSO 'פתוח להרשמה' and nearer, so the
-- generic "nearest open" default would have picked Montenegro — the client
-- explicitly wanted the retro to Madeira. Going forward, new leads default
-- to the nearest open journey (041), which may be Montenegro until it departs.
do $$
declare
  v_madeira uuid := 'fa5f2b8b-3e11-4e5c-9cfe-a1ba68fb99cd';
  v_count int;
begin
  update sales s
    set journey_id = v_madeira
    where s.deleted_at is null
      and s.stage not in ('נסגר בהצלחה', 'עסקה הופסדה')
      and s.journey_id is distinct from v_madeira;
  get diagnostics v_count = row_count;
  raise notice 'moved % sales to Madeira', v_count;
end $$;