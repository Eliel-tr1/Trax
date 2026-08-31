-- Adds 'my_desk' as its own RBAC resource (was piggybacking on 'dashboard').
-- Grants every existing role can_view=true with scope='mine': the rep home
-- screen (/my-desk, MyDesk.jsx) is intentionally always hard-filtered to the
-- signed-in user's own rows regardless of role, so every role should be able
-- to open it, just always scoped to "mine" on this one screen.
insert into permissions (role_id, resource, can_view, can_create, can_edit, can_delete, scope)
select id, 'my_desk', true, false, false, false, 'mine' from roles
on conflict do nothing;
