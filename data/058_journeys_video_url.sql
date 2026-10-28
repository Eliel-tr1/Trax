-- 056: journeys.video_url, a per-journey video link Max can send (Sahar 25/10/2026).
-- The video is dynamic data on the journey, not text inside a playbook, so a new
-- journey or a new clip only needs the field filled. Read by Max through the CRM
-- context block, and writable from the CRM journey screen and from api-v1.
alter table public.journeys add column if not exists video_url text;

comment on column public.journeys.video_url is 'קישור לסרטון של המסע (יוטיוב או קובץ). נשלח על ידי הסוכן ונערך במסך המסע.';
