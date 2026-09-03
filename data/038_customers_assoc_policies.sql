-- customers: "mine" = owner OR account_manager (Sahar's association rule).
-- Other tables keep owner-based policies (they have no account_manager field);
-- sales could get journey rep etc. later.
drop policy if exists customers_select on customers;
drop policy if exists customers_update on customers;
drop policy if exists customers_delete on customers;

create policy customers_select on customers for select
using (can_access('customers', 'view', owner_id, account_manager_id));

create policy customers_update on customers for update
using (can_access('customers', 'edit', owner_id, account_manager_id))
with check (can_access('customers', 'edit', owner_id, account_manager_id));

create policy customers_delete on customers for delete
using (can_access('customers', 'delete', owner_id, account_manager_id));
