-- Xcon "אתר" field (Sahar 05.09): the site/company branch a B2B contact
-- belongs to. Plain text on customers, Xcon-facing only in the UI.
alter table customers add column if not exists site text;