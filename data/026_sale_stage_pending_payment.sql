-- Add "ממתין לתשלום" to the sales.stage pipeline (client request, 01.09.2026).
-- The UI list lives in src/lib/constants.js SALE_STAGES — this keeps the DB
-- CHECK constraint in sync so the value can actually be saved. Chronological
-- slot: right after "נוצר קשר על ידי AI", before the ללמ 1-5 ladder
-- (mirrors data/025's slotting approach: additive, no data remap).

alter table sales drop constraint sales_stage_check;
alter table sales add constraint sales_stage_check check (stage in (
  'ליד חדש','נוצר קשר על ידי AI','ממתין לתשלום','ללמ 1','ללמ 2','ללמ 3','ללמ 4','ללמ 5',
  'פולואפ','שיחת מכירה עם נציג אנושי','תואמה פגישה','הצעה נשלחה',
  'ממתין להחלטה','נסגר בהצלחה','עסקה הופסדה'
));