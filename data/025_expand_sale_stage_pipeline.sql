-- Expand the sales.stage taxonomy with new mid-pipeline statuses requested
-- by the client. Applied live via Supabase MCP apply_migration (migration
-- name: expand_sale_stage_pipeline) — this file mirrors it in the repo for
-- history/local-db-rebuild purposes; do not hand-edit 001_init_schema.sql.
--
-- Pure additions, not renames: every new value slots between existing
-- stages (verified live — 0 rows held any value outside the pre-expansion
-- set, so no data remap was needed, unlike 008's rename). "שיחת מכירה עם
-- נציג אנושי" is unchanged — the client's shorthand "שיחה" in their new
-- list refers to this same existing stage, not a new one.
--
-- Full new ordered list: ליד חדש, נוצר קשר על ידי AI, ללמ 1, ללמ 2, ללמ 3,
-- ללמ 4, ללמ 5, פולואפ, שיחת מכירה עם נציג אנושי, תואמה פגישה, הצעה נשלחה,
-- ממתין להחלטה, נסגר בהצלחה, עסקה הופסדה.

alter table sales drop constraint sales_stage_check;
alter table sales add constraint sales_stage_check check (stage in (
  'ליד חדש','נוצר קשר על ידי AI','ללמ 1','ללמ 2','ללמ 3','ללמ 4','ללמ 5',
  'פולואפ','שיחת מכירה עם נציג אנושי','תואמה פגישה','הצעה נשלחה',
  'ממתין להחלטה','נסגר בהצלחה','עסקה הופסדה'
));
