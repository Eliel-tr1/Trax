-- Drop the legacy hard-coded CHECK constraints on app_users.permission_profile
-- and app_users.department: they only allowed the original 3 values each, so
-- assigning a user to a NEW label added via the manager (migration 039) failed
-- with "העדכון נכשל". The managed role_labels/departments tables are now the
-- source of truth; the UPDATE path in LabelsManagerModal keeps users in sync.
alter table app_users drop constraint if exists app_users_permission_profile_check;
alter table app_users drop constraint if exists app_users_department_check;
