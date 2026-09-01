-- Fill journeys.page_url (existing schema field, "קישור לעמוד המסע") with
-- each destination's page on trax-club.com. Verified live 2026-09-01:
-- /montenegro /madeira /costarica /uae → 200.
update journeys set page_url = case destination
  when 'מונטנגרו' then 'https://trax-club.com/montenegro'
  when 'מדיירה' then 'https://trax-club.com/madeira'
  when 'קוסטה ריקה' then 'https://trax-club.com/costarica'
  when 'איחוד האמירויות' then 'https://trax-club.com/uae'
  else page_url end
where page_url is null or page_url = '';