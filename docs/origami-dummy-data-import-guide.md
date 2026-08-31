# Guide: importing the TRAX CRM dummy data into Origami

**For a separate session.** This is instructions only — no API calls have
been made yet. The actual dummy data lives in `data/archive/*.json`
(archived from the now-deleted Supabase test project); this doc is the
mapping needed to turn that data into `create_instance` calls against the
live Origami account.

## Access

- Base: `https://traxclub.origami.ms`
- Auth: **body fields**, not a header — `{"username": "...", "api_secret": "OGMI-..."}`
  on every call. Credentials in `origami_traxclub.env`
  (username `trax.adventure.vitrue@gmail.com`).
- Endpoints (all POST, suffix `/format/json`): `entities_list`,
  `entity_structure` (+`entity_data_name`), `instance_data` (read/query),
  `create_instance`.
- **Gotchas (verified, don't relearn these):** errors return **HTTP 200**
  with `{"error":...}` — always check the body, not the status code.
  Filters must be array-of-arrays `[["fld","=","val"]]` — a malformed
  filter silently returns *all* records instead of erroring. Pagination
  is only `"limit":[skip,count]` — no `page`/`offset`. `"normalized":"1"`
  strips phone country-code + field metadata, so avoid it when you need
  those. Full field map: `origami_traxclub_schema.md` (memory working dir).

## Important mismatch to know before starting

**This Origami account has no TRAX/Xcon business-unit split and no
journey/seat-inventory concept** — it's a generic lead→client→deal CRM
with a flat product catalog, not TRAX's custom schema. The mappings below
are the closest reasonable fit, not a 1:1 translation. Where a mapping is
genuinely imperfect, it's flagged — decide there rather than assuming.

## Entity mapping

| TRAX CRM (Supabase) | Origami entity | Notes |
|---|---|---|
| `customers` where `status` in (ליד חדש, בטיפול, לא רלוונטי) | לידים `e_79` | Origami splits lead vs. client into separate entities; TRAX CRM used one entity with a status field |
| `customers` where `status` in (לקוח פעיל, לקוח עבר) | לקוחות `clients` | |
| `sales` | עסקאות `e_83` | Origami's deal stages are coarser (3 values) than TRAX's 7 — see stage mapping below |
| `journeys` | מוצרים `e_73` | **Imperfect fit** — Origami has no departure-date/seat-count concept. Each journey becomes a "product" (שם מוצר = journey name, מחיר ליחידה = price_per_person). Seat inventory (22 total, 18 minimum) has nowhere to live in Origami's product schema — note it in the product description field instead of losing it silently |
| `registrations` | עסקאות `e_83` → פירוט מוצרים (product line items) | **Imperfect fit** — Origami has no per-participant registration entity. Model each registration as one product-line-item row on its parent deal (מוצר להצעה = the journey/product, כמות = 1 per participant) rather than inventing a 14th entity |
| `tasks` | משימות `e_84` | |
| `meetings` | יומן פגישות `e_72` | |
| `contacts` (Xcon) | אנשי קשר `e_71` | **Check with the client whether Xcon belongs in this account at all** — this Origami account's schema shows no business-unit separation, so it may be TRAX-only and Xcon contacts may not belong here |
| `phone_calls` (empty in the archive — none were ever created) | תקשורות `e_87` | Nothing to import (0 rows) |
| `notes` (empty in the archive) | תקשורות `e_87` free-text, or the repeating "הערות" groups on לידים/לקוחות/עסקאות | Nothing to import (0 rows) |
| `app_users` (Goldi, Zarkosh) | *(not created via API)* | These are the real Origami login users already — don't recreate them as data rows |

## Field mapping

### customers → לידים (`e_79`) / לקוחות (`clients`)

| TRAX field | לידים field | לקוחות field | Notes |
|---|---|---|---|
| first_name | `lead_name` | `Costumers_Details_name` | |
| last_name | `fld_1054` | `fld_1090` | |
| mobile_phone | `fld_932_dup_e_79` | `fld_932` | input-telephone (nested value+normalize) |
| email | `fld_934_dup_e_79` | `fld_934` | |
| lead_source | `lead_origin` (אינטרנט/טלפון/קשר אישי/אחר) + `fld_930_dup_e_79` (דף נחיתה/אתר/פייסבוק/אינסטגרם/לינקדאין) for לידים; `fld_1321`/`fld_1322` for לקוחות | See value mapping below — TRAX's list and Origami's list don't match 1:1 |
| campaign | `fld_1316` (לידים) / `fld_1324` (לקוחות) | plain text, copy as-is |
| status | `fld_1249` (לידים: חדש/בטיפול/הצעת מחיר/סגור/לא רלוונטי) / `fld_619` (לקוחות: לקוח פעיל/לקוח לא פעיל) | see value mapping |
| notes | repeating group `g_191` (לידים) / `g_161` (לקוחות), field `fld_989_dup_e_79`/`fld_989` | one row per note — TRAX archive has 0 notes, nothing to migrate here |
| company/job_title/work_email (Xcon only) | no direct equivalent on לידים/לקוחות | see the Xcon caveat above — these customers may not belong in this account |

**lead_source value mapping** (TRAX → Origami's two-field split):
פייסבוק → `lead_origin`=אינטרנט, `fld_930...`=פייסבוק · אינסטגרם → אינטרנט/אינסטגרם ·
גוגל → אינטרנט/אתר · אתר TRAX → אינטרנט/אתר · דף נחיתה → אינטרנט/דף נחיתה ·
המלצה → קשר אישי (no second field) · אחר → אחר.

**status value mapping**: ליד חדש→חדש · בטיפול→בטיפול · לא רלוונטי→לא רלוונטי
(לידים entity). לקוח פעיל→לקוח פעיל · לקוח עבר→לקוח לא פעיל (clients entity).

### sales → עסקאות (`e_83`)

| TRAX field | Origami field | Notes |
|---|---|---|
| customer_id | `fld_1166` (select-from-entity {27}) | link to the already-created client/lead instance id |
| stage | `fld_1156` (הצעת מחיר / נסגרה בהצלחה / בוטלה) | **lossy**: TRAX's ליד חדש/נוצר קשר AI/שיחת מכירה/הצעה נשלחה/ממתין להחלטה all collapse to הצעת מחיר; נסגר בהצלחה→נסגרה בהצלחה; עסקה הופסדה→בוטלה |
| loss_reason | no direct field | put in `fld_1060_dup_e_83` (תיאור הצעה והערות) as free text so it isn't silently dropped |
| lead_source/campaign | `fld_1317`/`fld_1318` + `fld_1320` | same value mapping as customers above |
| expected_value/currency | `fld_1045_dup_e_83` is a *formula* field (computed from line items), not directly settable — set it via the product line items' prices instead |
| journey_id → registrations | פירוט מוצרים repeating group `g_185_dup_dup_e_83` | one row per registration linked to this sale — see registrations mapping |

### journeys → מוצרים (`e_73`)

| TRAX field | Origami field |
|---|---|
| name | `fld_951` (שם מוצר) |
| price_per_person | `fld_956` (מחיר ליחידה) |
| status (בתכנון/פתוח להרשמה/כמעט מלא/מלא/יצא לדרך/בוטל) | `fld_955` (only פעיל/לא פעיל exist) — map בתכנון/פתוח להרשמה/כמעט מלא→פעיל, מלא/יצא לדרך/בוטל→לא פעיל, and put the real TRAX status + seat counts (X/22) in `fld_958` (תיאור מוצר) so the detail isn't lost |
| destination/departure_date/seats_total/min_seats | no fields exist — fold into `fld_958` description, e.g. "מונטנגרו · יציאה 18.10.2026 · 22 מקומות, מינימום 18" |

### registrations → עסקאות product line items

Each registration becomes one row in its parent sale's `g_185_dup_dup_e_83`:
`fld_1043_dup_e_83` (מוצר להצעה) = the mapped journey/product id, `fld_1172`
(כמות) = 1, `fld_1302` (מחיר עסקה) = registration's `amount_paid`. Payment
status/passport/insurance/medical fields have no Origami equivalent —
put them in `fld_1159` (תיאור קובץ/הערה) in the same repeating group so
they're not silently dropped, flagged clearly as "לא ממופה, לבדיקה ידנית".

### tasks → משימות (`e_84`)

subject→`Tasks_details_name_dup_e_84` · description→`Tasks_details_description_dup_e_84` ·
due_at→`fld_1175_dup_e_84` · status (פתוחה/בוצעה/בוטלה)→`fld_474_dup_e_84`
(חדש/בתהליך/בוצע/בהשהיה/בוטל — map פתוחה→חדש, בוצעה→בוצע, בוטלה→בוטל) ·
priority (רגילה/גבוהה/דחופה)→`fld_1330` (נמוך/בינוני/גבוה — map רגילה→בינוני,
גבוהה→גבוה, דחופה→גבוה, there's no fourth level) · related customer→`fld_1325`.

### meetings → יומן פגישות (`e_72`)

subject→`fld_945` · start_at→(calendar element, check `entity_structure`
for the exact datetime field name at call time) · related
customer→`fld_1089` · type has no direct equivalent (TRAX: שיחת
טלפון/זום/פגישה פיזית) — fold into `fld_1068` (פרטים נוספים).

## Suggested execution order (respects the FK dependencies above)

1. Read `data/archive/business_data.json` (customers, journeys, sales,
   registrations) and `data/archive/misc_data.json` (tasks, contacts,
   meetings) — this is the actual dummy data to transform.
2. Create מוצרים (products) from `journeys` first — capture each
   returned instance id.
3. Create לידים/לקוחות from `customers`, split by status per the mapping
   above — capture each returned instance id.
4. Create אנשי קשר from `contacts` **only after** confirming with the
   client whether Xcon belongs in this account at all.
5. Create עסקאות from `sales`, linking `customer_id` to the id from
   step 3, and building the product-line-items array from this sale's
   `registrations` (matched by `sale_id` in `data/archive/business_data.json`),
   linking each line item's product to the id from step 2.
6. Create משימות from `tasks`, linking to the customer id from step 3.
7. Create יומן פגישות from `meetings`, same linking.
8. `phone_calls` and `notes` are both empty in the archive (0 rows) —
   nothing to do for either.

Verify each entity's exact live field list with `entity_structure` before
writing the actual `create_instance` payloads — this schema file is a
snapshot from 26.08.2026 and Origami field ids can change if the account
was edited since.
