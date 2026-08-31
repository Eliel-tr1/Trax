-- Rename the sales.stage value 'נסגר באי הצלחה' -> 'עסקה הופסדה'.
-- Applied live via Supabase MCP apply_migration (migration name:
-- rename_sale_stage_lost_deal) — this file mirrors it in the repo for
-- history/local-db-rebuild purposes; do not hand-edit 001_init_schema.sql.
--
-- Widen both CHECK constraints to accept old+new during the data move,
-- update existing rows, then tighten back down to just the new value.

alter table sales drop constraint sales_stage_check;
alter table sales add constraint sales_stage_check check (stage in (
  'ליד חדש','נוצר קשר על ידי AI','שיחת מכירה עם נציג אנושי',
  'הצעה נשלחה','ממתין להחלטה','נסגר בהצלחה','נסגר באי הצלחה','עסקה הופסדה'
));

alter table sales drop constraint sales_loss_reason_required;
alter table sales add constraint sales_loss_reason_required check (
  stage not in ('נסגר באי הצלחה','עסקה הופסדה') or loss_reason is not null
);

update sales set stage = 'עסקה הופסדה' where stage = 'נסגר באי הצלחה';

alter table sales drop constraint sales_stage_check;
alter table sales add constraint sales_stage_check check (stage in (
  'ליד חדש','נוצר קשר על ידי AI','שיחת מכירה עם נציג אנושי',
  'הצעה נשלחה','ממתין להחלטה','נסגר בהצלחה','עסקה הופסדה'
));

alter table sales drop constraint sales_loss_reason_required;
alter table sales add constraint sales_loss_reason_required check (
  stage <> 'עסקה הופסדה' or loss_reason is not null
);
