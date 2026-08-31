-- Add "מנהל לקוח" (account manager) to customers — separate from the
-- existing (unused-in-UI) customers.owner_id column added in 001_init_schema.
-- Same FK target/pattern as sales.owner_id / customers.owner_id.
alter table customers add column if not exists account_manager_id uuid references auth.users(id);
create index if not exists customers_account_manager_idx on customers (account_manager_id);
