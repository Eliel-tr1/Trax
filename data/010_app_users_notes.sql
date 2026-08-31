-- Add a free-text notes field to app_users, editable from the user edit
-- view in Settings > משתמשים (see src/pages/Settings.jsx UserEditModal).
-- Applied live via Supabase MCP apply_migration (migration name:
-- add_app_users_notes) — this file mirrors it in the repo for
-- history/local-db-rebuild purposes; do not hand-edit 001_init_schema.sql.

alter table app_users add column if not exists notes text;
