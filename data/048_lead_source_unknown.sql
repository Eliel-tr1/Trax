-- 048: lead_source 'לא מוכר' (Sahar 11/10/2026). A Voicenter call from/to a
-- number that is not in the CRM opens a new lead with this source
-- (voicenter-call-sync). Additive: existing values unchanged.
alter table customers drop constraint if exists customers_lead_source_check;
alter table customers add constraint customers_lead_source_check
  check (lead_source in ('פייסבוק','אינסטגרם','גוגל','אתר TRAX','דף נחיתה','המלצה','אחר','לא מוכר'));

-- sales.lead_source mirrors the customer's (043); keep its CHECK in step if it has one.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'sales_lead_source_check') then
    alter table sales drop constraint sales_lead_source_check;
    alter table sales add constraint sales_lead_source_check
      check (lead_source in ('פייסבוק','אינסטגרם','גוגל','אתר TRAX','דף נחיתה','המלצה','אחר','לא מוכר'));
  end if;
end $$;
