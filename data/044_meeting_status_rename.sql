-- 044: rename meeting status 'מתוכננה' to 'עתידה להתקיים' (Sahar 10.09).
-- Extend the CHECK constraint first, migrate rows, then tighten it.
alter table meetings drop constraint if exists meetings_status_check;
update meetings set status = 'עתידה להתקיים' where status = 'מתוכננה';
alter table meetings add constraint meetings_status_check
  check (status in ('עתידה להתקיים','התקיימה','לא התקיימה','בוטלה'));
alter table meetings alter column status set default 'עתידה להתקיים';