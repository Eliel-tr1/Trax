-- Demo-data cleanup v3: tables without deleted_at get hard-deleted.
update tasks set deleted_at = now() where deleted_at is null;
update meetings set deleted_at = now() where deleted_at is null;
update registrations set deleted_at = now() where deleted_at is null;
update sales set deleted_at = now() where deleted_at is null;
update customers set deleted_at = now() where deleted_at is null;
delete from notes where true;
delete from phone_calls where true;

select
  (select count(*) from customers where deleted_at is not null) as customers_binned,
  (select count(*) from sales where deleted_at is not null) as sales_binned,
  (select count(*) from registrations where deleted_at is not null) as registrations_binned,
  (select count(*) from tasks where deleted_at is not null) as tasks_binned,
  (select count(*) from meetings where deleted_at is not null) as meetings_binned,
  (select count(*) from journeys where deleted_at is null) as journeys_kept;