# Domain model

Source of truth: CRM-Studio spec `id=8` (`https://ai.vitrue.co.il/crm-studio/editor.html?id=8`,
CLI access via `c:\Users\sahar\Claude Code\crm-studio-api\`) cross-checked
against the live ClickUp execution tracker (list `901524934835`). Field names
are the client-facing Hebrew labels — **do not translate or rename them**;
renaming after build cascades into every automation and AI-agent prompt, and
is an explicit sign-off item still pending from the client (see blockers.md).

Wave tags (1/2) mark when a field is needed — see [roadmap.md](roadmap.md).

## Relationships

| Parent (1) | Relation | Child (N) | Note |
|---|---|---|---|
| לקוח | 1:N | מכירה | same customer can have multiple deals over time |
| לקוח | 1:N | הרשמה למסע | a repeat customer registers for multiple departures |
| מסע | 1:N | הרשמה למסע | up to 22 registrations per departure |
| מכירה | 1:N | הרשמה למסע | one deal can produce several registrations (couple/group) |

**Control rule:** participant count on a deal should match the number of
registrations it produced; a mismatch surfaces as a warning on the deal card.

## Entity: לקוח (Customer)

| Field | Type | Values / notes | Wave |
|---|---|---|---|
| שם פרטי | text | required | 1 |
| שם משפחה | text | required | 1 |
| טלפון נייד | phone | required. **Identity key for TRAX** | 1 |
| אימייל | email | | 1 |
| יחידה עסקית | select | TRAX, Xcon | 1 |
| מקור הגעה | select | פייסבוק, אינסטגרם, גוגל, אתר TRAX, דף נחיתה, המלצה, אחר | 1 |
| קמפיין | text | auto-captured from link params | 1 |
| סטטוס לקוח | select | ליד חדש, בטיפול, לקוח פעיל, לקוח עבר, לא רלוונטי | 1 |
| הערות | long text | | 1 |
| תאריך פנייה ראשונה | datetime | auto-set | 1 |
| דירוג ליד | select | חם, פושר, קר, לא רלוונטי | 2 |
| חבר מועדון | checkbox | NOT a trip-eligibility gate — benefits/credit only | 2 |
| תאריך הצטרפות למועדון | date | | 2 |
| יתרת קרדיט | currency | 5% loyalty accrual | 2 |
| רמת ניסיון באקסטרים | select | מתחיל, בינוני, מנוסה, מקצועי | 2 |
| שפה מועדפת | select | עברית, אנגלית — collected but unused (agent is Hebrew-only) | 2 |

**Xcon-only additional fields:** חברה (text, required — flags an org lead),
תפקיד (text), מייל עבודה (email, required — **identity key for Xcon**, used
instead of phone). Never match an Xcon contact to a TRAX customer by
phone/email even if identical — the business-unit field gates every
identity/dedup check.

## Entity: מכירה (Sale/Deal)

| Field | Type | Values / notes | Wave |
|---|---|---|---|
| שם העסקה | text | auto-composed: customer name + journey name (needs a fallback in Wave 1, before מסע exists) | 1 |
| לקוח | link → לקוח | required | 1 |
| יחידה עסקית | select | TRAX, Xcon | 1 |
| שלב מכירה | select | ליד חדש → נוצר קשר על ידי AI → ללמ 1 → ללמ 2 → ללמ 3 → ללמ 4 → ללמ 5 → פולואפ → שיחת מכירה עם נציג אנושי → תואמה פגישה → הצעה נשלחה → ממתין להחלטה → נסגר בהצלחה / עסקה הופסדה | 1 |
| ערוץ פנייה | select | וואטסאפ, טופס אתר, דף נחיתה, טלפון | 1 |
| מקור הגעה | select | **must match לקוח's value list exactly** | 1 |
| קמפיין | text | | 1 |
| בעלים | user | | 1 |
| סיבת אי סגירה | select | מחיר, תאריכים לא מתאימים, לא ענה, בחר מתחרה, נסגר בחוסר מקום לחזור בעתיד, לא רלוונטי, אחר — **required when stage = עסקה הופסדה** | 1 |
| מסע מבוקש | link → מסע | | 2 |
| מספר משתתפים | number | NOT the same as registration count — never derive one from the other | 2 |
| שווי צפוי | currency | | 2 |
| מטבע | select | יורו, שקל, דולר | 2 |
| דירוג הסמכה | select | עומד בקריטריונים, חלקי, לא עומד, ספאם — **written by the AI agent** | 2 |
| סיכום הסמכה מהסוכן | long text | written by the AI agent | 2 |
| תאריך שיחה הבאה | datetime | triggers an internal follow-up task automation | 2 |

**Xcon-only field:** תחום עניין — select: ייעוץ, פרויקטים, פתרונות, תובנות,
ZAP, קריירה, שותפויות, אחר. A lead whose תחום עניין = קריירה is **not** a
sales lead — create a flagged customer card only, no deal, no alert.

**Work rules:**
- Closing as "unsuccessful" without a reason is not allowed — field is required.
- Moving to "closed successfully" requires at least one linked registration.
- A repeat inquiry from an existing customer never opens a new customer
  record, but **always** opens a new deal — every inquiry is its own
  opportunity and is counted separately in reporting. If an open deal already
  exists, note it on the new one.
- A deal rated ספאם by the agent auto-transitions to "closed unsuccessful"
  with reason "not relevant" — it is not deleted (so reporting can show spam
  volume per campaign).

## Entity: מסע (Journey/Departure) — Wave 2

One record per dated departure — Montenegro-October and Montenegro-May are
two separate records, not one destination with two dates.

| Field | Type | Values / notes |
|---|---|---|
| שם היציאה | text | e.g. "מונטנגרו, אוקטובר 2026" |
| יחידה עסקית | select | TRAX, Xcon — also gates which products/offerings show in a deal |
| יעד | select | מונטנגרו, איחוד האמירויות, קוסטה ריקה, טנריף, מדיירה |
| תאריך יציאה | date | required |
| תאריך חזרה | date | |
| מספר מקומות | number | default 22 |
| מינימום להוצאה לדרך | number | default 18 |
| מקומות שנמכרו | computed | count of *active* registrations, recounted per event |
| מקומות פנויים | computed | מספר מקומות − מקומות שנמכרו |
| סטטוס יציאה | select, see below | |
| מחיר לאדם | currency | **client price conflict unresolved — see blockers.md** |
| מטבע | select | יורו, שקל, דולר |
| כולל טיסות | checkbox | default false, applies to the whole journey |
| תיאור קצר | long text | used by the AI agents |
| קישור לעמוד המסע | url | |
| הערות תפעול | long text | |

**Status transitions:**

| Status | Entered | Meaning |
|---|---|---|
| בתכנון | manual | not shown to clients or agents |
| פתוח להרשמה | manual | agents may offer it |
| כמעט מלא | auto, ≤2 seats left | agents flag scarcity |
| מלא | auto, 0 seats left | agents stop offering it, move to next departure |
| יצא לדרך | manual | closed to sales |
| בוטל | manual | every registration flagged for handling, none deleted |

The three manual statuses are immune to automation — the seat-count
automation never re-opens a departure that was closed manually.

## Entity: הרשמה למסע (Trip Registration) — Wave 2

One record per participant per departure — this is what occupies a seat.

| Field | Type | Values / notes |
|---|---|---|
| שם ההרשמה | text | auto: participant name + departure name |
| לקוח | link → לקוח | required |
| מסע | link → מסע | required |
| מכירה | link → מכירה | |
| סטטוס הרשמה | select | משוריין → שולמה מקדמה → שולם במלואו / בוטל |
| סכום ששולם | currency | |
| מטבע | select | יורו, שקל, דולר |
| תאריך תשלום אחרון | date | |
| אמצעי תשלום | select | אשראי, העברה בנקאית, אחר |
| מספר חשבונית | text | |
| דרכון בתוקף | checkbox | |
| ביטוח נסיעות | checkbox | |
| הערות רפואיות או תזונתיות | long text | |
| איש קשר לחירום | text | |
| כולל טיסה למשתתף זה | checkbox | default false — lives here (per-person), not on מסע or מכירה, because a couple registering together can differ |
| תאריך הרשמה | datetime | auto |

**Seat-counting rules:** a cancelled registration is not counted and
releases its seat immediately. A payment that updates סכום ששולם without
also updating סטטוס הרשמה leaves a seat double-sellable — status is the
field that counts, not the amount.

## Standard entities (come with the framework, not built from scratch)

| Entity | Key fields | Primary use |
|---|---|---|
| משימה (Task) | נושא, משויך ל (customer/sale/registration), אחראי, תאריך יעד, סטטוס, עדיפות | opens automatically: agent hands off to a rep, deal enters "awaiting decision" with a next-call date, agent hits an unanswered knowledge-base question |
| פגישה (Meeting) | נושא, משויך ל, start/duration, סוג, משתתפים, סיכום | two-way Google Calendar sync |
| שיחת טלפון (Phone call) | משויך ל, כיוון, duration, תוצאה, הקלטה, תמליל | auto-created from Voicenter + every Max voice call — the source for response-time metrics |
| הערה (Note) | תוכן, נכתב על ידי, תאריך, משויך ל | call transcripts, call summaries, free documentation |
| מסמך (Document) | שם קובץ, סוג, תאריך העלאה, משויך ל | passport, insurance approval, invoice |
| איש קשר (Contact) | שם, טלפון, אימייל, תפקיד, משויך ללקוח | mainly Xcon — an org customer can have several contacts |

## What stays in the CRM vs. goes to N8N

Per the client's own spec (§9/§16) — these are computed fields or internal
record automations, not integrations, and should stay fast/reliable inside
the CRM rather than round-tripping through N8N:

- מקומות שנמכרו / מקומות פנויים (computed fields)
- כמעט מלא / מלא status transitions (internal rule on the computed field)
- שם העסקה / שם ההרשמה (composite fields)
- follow-up task creation from "תאריך שיחה הבאה"

Everything else — lead intake, WhatsApp/voice webhooks, welcome messages,
handoff alerts — is N8N, calling into this system's Edge Functions.

## Dashboards

**מכירות (Sales):** new leads (monthly/weekly) · leads by source · leads by
campaign · lead→sale conversion rate · open deals by stage · reasons for
not closing.

**מסעות ותפוסה (Journeys & occupancy):** occupancy per departure (vs. the
18-seat minimum) · departures at risk (within 60 days, under 18 sold) ·
projected revenue per departure (sold × price, **never summed across
currencies without an explicit conversion**) · unpaid/partially-paid
registrations.

Explicitly rejected, do not build without a new explicit request: a daily
morning report, a customer-file-prep-before-call view, an NPS engine, a
departure fill-rate gauge board, a pre-trip journey flow.
