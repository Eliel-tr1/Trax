// Enum value lists — mirrors the CHECK constraints in data/001_init_schema.sql
// exactly (Hebrew labels ARE the values; do not translate/rename — see
// docs/domain-model.md's note on entity/field naming sign-off).

export const BUSINESS_UNITS = ['TRAX', 'Xcon']

export const LEAD_SOURCES = ['פייסבוק', 'אינסטגרם', 'גוגל', 'אתר TRAX', 'דף נחיתה', 'המלצה', 'אחר']

export const CUSTOMER_STATUSES = ['ליד חדש', 'בטיפול', 'לקוח פעיל', 'לקוח עבר', 'לא רלוונטי']

export const LEAD_RATINGS = ['חם', 'פושר', 'קר', 'לא רלוונטי']

export const EXPERIENCE_LEVELS = ['מתחיל', 'בינוני', 'מנוסה', 'מקצועי']

export const PREFERRED_LANGUAGES = ['עברית', 'אנגלית']

export const SALE_STAGES = [
  'ליד חדש',
  'נוצר קשר על ידי AI',
  'ללמ 1',
  'ללמ 2',
  'ללמ 3',
  'ללמ 4',
  'ללמ 5',
  'פולואפ',
  'שיחת מכירה עם נציג אנושי',
  'תואמה פגישה',
  'הצעה נשלחה',
  'ממתין להחלטה',
  'נסגר בהצלחה',
  'עסקה הופסדה',
]
// Stages that count as "closed" — excluded from the "עסקאות פתוחות" preset.
export const SALE_STAGES_CLOSED = ['נסגר בהצלחה', 'עסקה הופסדה']

export const SALE_CHANNELS = ['וואטסאפ', 'טופס אתר', 'דף נחיתה', 'טלפון']

export const LOSS_REASONS = [
  'מחיר', 'תאריכים לא מתאימים', 'לא ענה', 'בחר מתחרה',
  'נסגר בחוסר מקום לחזור בעתיד', 'לא רלוונטי', 'אחר',
]

export const QUALIFICATION_RATINGS = ['עומד בקריטריונים', 'חלקי', 'לא עומד', 'ספאם']

export const CURRENCIES = [
  { value: 'EUR', label: 'יורו (€)' },
  { value: 'ILS', label: 'שקל (₪)' },
  { value: 'USD', label: 'דולר ($)' },
]
export const CURRENCY_SYMBOLS = { EUR: '€', ILS: '₪', USD: '$' }

export const INTEREST_AREAS = ['ייעוץ', 'פרויקטים', 'פתרונות', 'תובנות', 'ZAP', 'קריירה', 'שותפויות', 'אחר']

// מסע (Wave 2)
export const JOURNEY_DESTINATIONS = ['מונטנגרו', 'איחוד האמירויות', 'קוסטה ריקה', 'טנריף', 'מדיירה']
export const JOURNEY_STATUSES = ['בתכנון', 'פתוח להרשמה', 'כמעט מלא', 'מלא', 'יצא לדרך', 'בוטל']

// הרשמה למסע (Wave 2)
export const REGISTRATION_STATUSES = ['משוריין', 'שולמה מקדמה', 'שולם במלואו', 'בוטל']
export const PAYMENT_METHODS = ['אשראי', 'העברה בנקאית', 'אחר']

// registration_passengers — per-passenger fields on a registration.
export const PASSENGER_GENDERS = ['זכר', 'נקבה', 'אחר']
export const PASSENGER_LANGUAGES = PREFERRED_LANGUAGES

// Task
export const TASK_STATUSES = ['פתוחה', 'בוצעה', 'בוטלה']
export const TASK_PRIORITIES = ['רגילה', 'גבוהה', 'דחופה']
export const TASK_PRIORITY_COLOR = { 'רגילה': '#64748b', 'גבוהה': '#d97706', 'דחופה': '#dc2626' }

// Meeting
export const MEETING_TYPES = ['שיחת טלפון', 'זום', 'פגישה פיזית']
// Marking a sale-linked meeting 'לא התקיימה' auto-follows-up the sale —
// see data/023_meeting_noshow_and_customer_auto_sale.sql.
export const MEETING_STATUSES = ['מתוכננה', 'התקיימה', 'לא התקיימה', 'בוטלה']

// Phone call
export const CALL_DIRECTIONS = ['נכנסת', 'יוצאת']
export const CALL_RESULTS = ['נענתה', 'לא נענתה', 'תפוס', 'השאיר הודעה']

export const enumOpts = (arr) => arr.map((x) => ({ value: x, label: x }))

// Fallback used only if the `cardcom_payment_url` row is missing from
// system_settings (Settings > פרטי מערכת) — the live URL is swapped there,
// never here, so replacing it later is a one-line DB edit, not a deploy.
export const DEFAULT_CARDCOM_PAYMENT_URL = 'https://secure.cardcom.solutions/EA/EA5/G1cjb5qFe06oHgZWWSTXug/Order'
