-- form_name — which specific lead-form on the site the submission came
-- from (the site had a bug until now where `notes` and `form_name` never
-- made it into the webhook payload at all; fixed on the client's side,
-- see docs/decisions/0006). Marketing attribution field, shown alongside
-- the UTM fields.

alter table customers add column if not exists form_name text;
alter table sales add column if not exists form_name text;
