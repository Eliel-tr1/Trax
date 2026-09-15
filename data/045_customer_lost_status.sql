-- 045: client feedback round 10.09 (Sahar via WhatsApp)
-- 1. New customer status 'עסקה הופסדה' — only reachable when the customer
--    NEVER closed a deal. Business rules live in the app (recalculateSaleStatus)
--    and a DB trigger keeps the CHECK honest.
alter table customers drop constraint if exists customers_status_check;
alter table customers add constraint customers_status_check
  check (status in ('ליד חדש','בטיפול','לקוח פעיל','לקוח עבר','לא רלוונטי','עסקה הופסדה'));