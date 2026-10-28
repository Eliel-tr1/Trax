-- 057: fill the journey videos we already have, and point the CRM links in
-- outbound WhatsApp messages at production (Sahar 25/10/2026).
-- Videos are the client's own YouTube clips from @TRAXAdventureClub.
update public.journeys
   set video_url = 'https://www.youtube.com/watch?v=t0X0scMtXY4'
 where deleted_at is null
   and video_url is null
   and (name ilike 'מדיירה%' or destination ilike '%מדירה%' or destination ilike '%madeira%');

update public.journeys
   set video_url = 'https://www.youtube.com/watch?v=JRK4PROO9p4'
 where deleted_at is null
   and video_url is null
   and (name ilike 'מונטנגרו%' or destination ilike '%מונטנגרו%' or destination ilike '%montenegro%')
   and (coalesce(return_date, departure_date) < date '2027-04-01');

update public.journeys
   set video_url = 'https://www.youtube.com/watch?v=JPubgMg3FR4'
 where deleted_at is null
   and video_url is null
   and (name ilike 'מונטנגרו%' or destination ilike '%מונטנגרו%' or destination ilike '%montenegro%');

-- The alert and template links were landing on the staging host.
insert into public.system_settings (key, value)
values ('crm_public_url', 'https://app.trax-club.com')
on conflict (key) do update set value = excluded.value;
