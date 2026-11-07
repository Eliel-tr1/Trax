# AI_REFERENCE: TRAX (ייחוס טכני ל-AI)

קובץ לסוכן שעובד על TRAX, לא לאנשים. מצב נכון ל-07/11/2026, נאסף בקריאה בלבד מהמערכות החיות. בכל שינוי בתהליך, מעדכנים את הקובץ באותו צעד.
**הריפו ציבורי.** לכן אין כאן סודות, טלפונים של אנשים, או נתיבי webhook שאין עליהם אימות. נתיבים כאלה קוראים ישירות מ-n8n.

## 1. זהות
- לקוח: TRAX Adventure Club (ויחידה עסקית שנייה Xcon באותו CRM). מצב: לקוח.
- בעלים בויטרו: סער וינברג (מאשר פרודקשן וכל כתיבה לנתונים חיים). מנהלת פרויקט מול הלקוח: ירדן עקיבא. מפתח: טל.
- פרופיל Hermes: `trax-pm`. ידע מורחב: `/home/hermes/.hermes/profiles/trax-pm/knowledge/`, מסירה: `HANDOVER-TRAX.md`, סקיל פיתוח: `trax-crm-dev`.

## 2. מסד הנתונים (Supabase, ref `bkjqwroclpefwtyxjfkl`, eu-central-1)
staging ופרודקשן חולקים את אותו מסד. אין pg_cron במסד.

| טבלה | שם עסקי | שדות מפתח |
|---|---|---|
| `customers` | לקוח / ליד | `business_unit` (TRAX/Xcon), `status`, `mobile_phone` (E.164), `lead_source`, UTM, `send_lead_whatsapp`, `whatsapp_opt_out`, `cloudchat_user_ns`, `cloudchat_chat_url`, `deleted_at` (מחיקה רכה) |
| `sales` | מכירה (תהליך מכירה) | `stage`, `journey_id`, `owner_id`, `qualification_rating`, `qualification_summary`, `expected_value` (טריגר מהמסע), `ai_chat_status`, `ai_message_sent_at`, `ai_first_reply_at`, `ai_send_error`, `ai_noreply_task_at`, `ai_handoff_at` |
| `journeys` | מסע (יציאה) | `departure_date`, `return_date`, `status`, `price_per_person`, `currency`, `seats_total`, `seats_sold`, `itinerary`, `video_url`, `site_url` |
| `registrations` | הרשמה למסע | `status`, `customer_id`, `journey_id`, `sale_id` |
| `registration_passengers` | נוסע בהרשמה | `phone`, `is_primary` |
| `journey_messages` | יומן הודעות מסע | ייחודי לפי (registration, kind, phone). `kind`: `seat_reserved`, `welcome`. `status`: sent / skipped / failed |
| `phone_calls` | שיחה | `external_call_id` (ivruniqueid, דדופ), `recording_path`, `transcript`, `enriched_at` |
| `tasks`, `notes`, `notifications`, `meetings` | משימות, הערות, התראות, פגישות | `related_type` + `related_id` |
| `automation_rules`, `automation_logs` | כללי אוטומציה ב-UI | `status=skipped` עם `conditions not met` הוא תקין |
| `outbound_webhooks`, `webhook_deliveries` | וובהוקים יוצאים | `sale.created`, `registration.changed` אל n8n, עם header סוד |
| `system_settings` | הגדרות | `whatsapp_test_mode`, `whatsapp_test_phones`, `whatsapp_dedupe_days` (7), `whatsapp_noreply_hours` (24), `whatsapp_{lead,reserved,welcome}_template_{name,lang,params}`, `crm_public_url` |
| `api_keys` | מפתחות API | `role` לא נאכף (מפתח read יכול לכתוב) |
| `app_users` | משתמשים | 5, כולם `owner` |

ערכי רשימה (טקסט בעברית, לא מספר):
- `sales.stage` (CHECK במסד): ליד חדש, נוצר קשר על ידי AI, ממתין לתשלום, ללמ 1 עד ללמ 5, פולואפ, שיחת מכירה עם נציג אנושי, תואמה פגישה, הצעה נשלחה, ממתין להחלטה, נסגר בהצלחה, עסקה הופסדה (מחייב `loss_reason`).
- `sales.ai_chat_status`: נשלחה הודעה, ענה לסוכן, השליחה נכשלה.
- `sales.qualification_rating`: עומד בקריטריונים, חלקי, לא עומד, ספאם.
- `registrations.status` שמפעילים הודעות: משוריין (seat_reserved), שולמה מקדמה ושולם במלואו (welcome).
- `journeys.status`: בתכנון, פתוח להרשמה, מלא.

טריגרים חשובים:
- `customers_auto_create_sale`: לקוח חדש בלי מכירה פתוחה מקבל מכירה על המסע הקרוב ב"פתוח להרשמה" באותה יחידה עסקית.
- `sales_created_webhook`: כל INSERT ל-sales שולח `sale.created` לכל וובהוק פעיל. כל מקור (UI, api-v1, קליטה) מפעיל הודעת פתיחה.
- `sales_ai_handoff`: מעבר ל"שיחת מכירה עם נציג אנושי" כש-`ai_chat_status` לא ריק: משימה בעדיפות גבוהה, התראה לבעלים, `ai_handoff_at`.
- `registrations_journey_webhook`, `passengers_journey_webhook`: `registration.changed` בסטטוסים הרלוונטיים או כשנוסע מקבל טלפון. אין יותר תנאי "מכירה נסגרה" (מיגרציה 056; ההערה בתהליך ב-n8n עדיין מזכירה אותו, והיא ישנה).
- `meetings_noshow_dispatch`: פגישה של מכירה ל"לא התקיימה": מכירה ל"פולואפ", הערה, משימה "לתאם מחדש".

## 3. ספר תהליכים
### n8n (`https://n8n.srv1873970.hstgr.cloud`, משותף ל-204 תהליכים של כל הלקוחות; של TRAX: 9)
| id | שם | טריגר | סטטוס | מה עושה |
|---|---|---|---|---|
| `6Nam4IBnV39wT22J` | WF-05a קליטת ליד מטופס האתר | webhook (טופס האתר, payload שטוח) | פעיל | G1 שדות חובה, נרמול E.164, G3 כפילות 10 דקות (static data), POST ל-`wf05a-crm-sync`. שימו לב: "TRAX" לא בשם |
| `eMfQTQi4RnsPxfCm` | TRAX - Lead Intake (Facebook Lead Ads) | webhook מ-Make | פעיל | מפרסר את צורות ה-payload של Make ומעביר ל-WF-05a |
| `aZ475pR5nxSdzhuU` | TRAX - WhatsApp ליד חדש (CRM sale.created) | webhook עם header auth | פעיל | המתנה 60 שניות, `cloudchat-bridge` action=send, ואז action=link |
| `lo7rijctoKVu3DwV` | TRAX - WhatsApp סנכרון מענה וסטטוס | כל 5 דקות | פעיל | `cloudchat-bridge` action=sync |
| `kENOh7fdnPaZmYbl` | TRAX - ברוך הבא למסע (CRM registration.changed) | webhook עם header auth | פעיל | המתנה 30 שניות, `cloudchat-bridge` action=journey |
| `QqOrRlWGBANByx2C` | Trax Calls - Voicenter | webhook (CDR Notification) | פעיל | נרמול CDR, `voicenter-call-sync`, `voicenter-call-enrich` |
| `xmkDq22FWxSf3tM2` | TRAX - Lead Intake (Facebook Lead Ads) | טריגר פייסבוק | כבוי | הוחלף ב-Make. לא להחיות |
| `pjhRD7eOj8Xs7aDR` | TRAX - Lead Intake (site/landing/Xcon forms) | webhook | כבוי | גרסה ראשונה. לא להחיות |
| `H2sUrT6TaxsnSkKz` | [בדיקה - למחיקה] WF05a registration test | webhook | כבוי | שארית בדיקה |

אין `errorWorkflow` לאף תהליך. הרצות webhook לא נשארות בהיסטוריה (רק הסנכרון התקופתי נראה).

### Make (eu1, team 2342400)
- תרחיש `7012775` "Integration Facebook Lead Ads", פעיל, מיידי, hook 3573900. מודולים: Facebook NewLeadMultiple, GetLeadDetails, JSON, HTTP אל n8n `eMfQTQi4RnsPxfCm`. ריצה אחרונה 12/10/2026.

### Edge Functions (Supabase)
| פונקציה | גרסה חיה | תפקיד | הערה |
|---|---|---|---|
| `api-v1` | v14 (28/10) | API גנרי לאובייקטים, משמש את מקס ואינטגרציות | דף `/api-docs` נוצר מה-SCHEMA |
| `customer-context` | v6 (28/10) | זיהוי פונה לפי 9 ספרות אחרונות, `prompt_block` למקס | החי = main. בלוק המסלול היומי (ADR 0013) קיים רק בענף `feat/journey-itinerary-to-agent`, ולא בחי |
| `cloudchat-bridge` | v18 (24/10) | send / link / sync / journey / chat / media | החי תואם ל-main |
| `wf05a-crm-sync` | v15 (01/10) | יצירה/עדכון לקוח ומכירה מהקליטה | **החי כולל תיקון שנמצא רק בענף `fix/wf05a-journey-choice-over-trigger-default` (ADR 0008). פריסה מ-main תחזיר באג** |
| `voicenter-call-sync`, `voicenter-call-enrich` | v8, v5 | שיחות, הקלטה ותמלול | JWT של Voicenter ב-Vault (`get_voicenter_jwt()`) |
| `max-chat` | v17 | עוזר AI צף בתוך ה-CRM (OpenAI) | **לא** סוכן הוואטסאפ |
| `journey-import` | v5 | ייבוא מסע מדף באתר (OpenAI) | |
| `invite-user`, `update-user` | | ניהול משתמשים | |
| `journeys-sync` | v7 | סנכרון מסעות מהאתר | אין pg_cron, לא רץ |
| `lead-intake`, `facebook-leads`, `fireberry-call-sync`, `reset-test-pw` | | ישנות | לא בשימוש בזרימה החיה |

סודות הפונקציות (שמות בלבד): OPENAI_API_KEY, TRAX_CLOUDCHAT_API_KEY, TRAX_CLOUDCHAT_BASE, CLOUDCHAT_BRIDGE_SECRET, TRAX_PORTAL_OUTBOUND_URL, TRAX_PORTAL_OUTBOUND_KEY, TRAX_PORTAL_API_BASE, TRAX_PORTAL_API_KEY.

### מקס (פורטל הסוכנים, חשבון "TRAX Adventure Club", tenant b-9b1ddc4e)
- `live=true`, `service_mode=everyone` (עונה לכל מי שכותב). 5 פלייבוקים: `pb4_f22944333a` לידים ומכירה, `pb4_7604e541ad` לקוח קיים, `pb4_7055f3e932` שאלות במהלך הטיול, `pb4_372fd9ce36` שירות כללי, `pb4_7acbe58d66` תלונה. כ-174 מאמרי KB.
- חיבור "Trax CRM" (MCP אל `api-v1`).
- התראה `agent_notification` פעילה: תבנית `agent_notification_callback_request` + מייל, פעם אחת לשיחה, לליד "עומד בקריטריונים" או "לא עומד" שהסיבה שלו תאריך, וגם ב-handover. הנמענים בפורטל.
- גישה: ה-MCP `account` בפרופיל, מפתח `ACCOUNT_API_KEY` ב-approval=none: **כל apply_change נכנס מיד לחי.** תמיד propose_change קודם, ודיווח version_id.

### CloudChat (סביבת TRAX Club)
תבניות (07/11): `trax_lead_opening`, `trax_lead_opening_v2` (בשימוש בהגדרות), `trax_seat_reserved`, `trax_welcome_aboard`, `agent_notification_callback_request`, `internal_service_alert`. כולן APPROVED.

## 4. מוצרים ותהליכים
- כל מכירה חדשה ב-TRAX: הודעת פתיחה (תבנית lead). Xcon: הגשר מדלג (`not_trax`).
- הרשמה: משוריין -> `seat_reserved`, מקדמה או מלא -> `welcome`. מי שקיבל welcome לא מקבל seat_reserved.

## 5. החלטות נעולות
- CRM ייעודי (React + Vite + Supabase) במקום Origami, 01/09/2026 (ADR 0001).
- כל ליד עובר דרך WF-05a. Make הוא המחבר של פייסבוק.
- שיחה ממספר לא מוכר לא פותחת ליד. כל השיחות נקלטות.
- מחירים ותאריכים למקס רק מה-CRM (`journeys.price_per_person`, `currency`). הלקוח מזין אותם. דמי חברות 150 דולר וקרדיט 5% מה-KB (סער 24/10).
- מצב בדיקה בוואטסאפ נשאר עד שסער אומר "עולים לאוויר".
- הודעות הרשמה תלויות בסטטוס ההרשמה בלבד (מיגרציה 056).
- ADR בריפו: 0001 עד 0012 ב-main (0008 ו-0013 בענפים).

## 6. מלכודות
| סימפטום | סיבה | פתרון |
|---|---|---|
| בדיקה ב-staging שלחה וואטסאפ / יצרה נתונים | staging ופרודקשן על אותו מסד | כל כתיבה מוסברת לסער, פיילוט, ניקוי והוכחת ספירות |
| הודעת פתיחה לא נשלחה | test_mode, opt_out, dedupe 7 ימים, טלפון ממוסך (`*`), already_in_conversation, Xcon | התשובה של `cloudchat-bridge` כוללת `reason` |
| "נשלח" אבל לא הגיע | שגיאת מטא | `flow/error-logs` ב-CloudChat, הסנכרון מסמן "השליחה נכשלה" |
| באג חוזר אחרי פריסת פונקציה | קוד חי שאינו ב-main | להשוות את גוף הפונקציה החי לפני פריסה |
| פונקציה עם כמה קבצים לא נפרסת | סקריפט פריסה שמעלה קובץ אחד | פריסה עם כמה חלקי `file` |
| לקוח חדש נכשל ביצירה | `customers_trax_phone_key` (טלפון ייחודי) | לחפש לפי 9 ספרות אחרונות |
| "מקס" במשימה | שני מקסים: `max-chat` בתוך ה-CRM, וסוכן הוואטסאפ בפורטל | לברר לאיזה הכוונה |
| ליד מפייסבוק עם טלפון ממוסך | אפליקציית המטא של הלקוח לא עברה אימות עסק | אצל הלקוח |
| `build-id.txt` מחזיר HTML | לא מוגש ב-CI | לא לסמוך על מנגנון "גרסה חדשה" |
| תבנית עם תמונה נכשלת | `cloudchat-bridge` לא שולח header תמונה | להוסיף תמיכה לפני שימוש |

## 7. גישה (שמות משתנים ב-`.env` של trax-pm, לא ערכים)
- קריאה: `scripts/trax_ro.py` (health, sql, rest, n8n, fn, served) קורא בלבד ומסרב לכתיבה.
- SUPABASE_URL, SUPABASE_PROJECT_REF, SUPABASE_ANON_KEY, QA_USER_* (REST דרך RLS); SUPABASE_ACCESS_TOKEN (Management API, **רואה את כל הפרויקטים בחשבון**, מותר רק ref של TRAX).
- CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (Pages `trax-crm`).
- N8N_VITRUE_URL, N8N_VITRUE_API_KEY (**כל השרת**, נוגעים רק בתהליכי TRAX). MAKE_VITRUE_TOKEN (רק 7012775).
- VOICENTER_TRAX_API_CODE. TRAX_CLOUDCHAT_BASE, TRAX_CLOUDCHAT_API_KEY, CLOUDCHAT_BRIDGE_SECRET, TRAX_CRM_API_KEY, TRAX_CRM_WEBHOOK_SECRET. ACCOUNT_API_KEY (מקס, כתיבה מיידית).
- GitHub: `gh` המשותף בשרת (Eliel-tr1).
- כלי כתיבה (רק באישור סער): `scripts/trax_sql_write.sh`, `scripts/trax_fn_deploy.sh`.

## 8. נהלי תפעול
- **פריסה ל-staging:** push לענף `staging` מפעיל `.github/workflows/deploy-staging.yml`.
- **פרודקשן (רק במילים מפורשות של סער):** PR ל-main, merge, ואז `gh workflow run deploy-staging.yml -R Eliel-tr1/Trax --ref main -f target=production`. push ל-main לבדו לא מפרסם. לעולם לא `wrangler pages deploy --branch main`.
- **אימות:** `trax_ro.py served` ששלוש הכתובות (staging, trax-crm.pages.dev, app.trax-club.com) מגישות את הבאנדל החדש, ובדיקה בממשק.
- **מיגרציה:** קובץ `data/NNN_*.sql` (אחרון 058), הרצה דרך Management API באישור, ובדיקה בקריאה חוזרת.
- **פונקציה:** לפני פריסה משווים לגוף החי (`GET /v1/projects/{ref}/functions/{slug}/body`). אחרי פריסה בודקים גרסה וקריאה.
- **חזרה אחורה:** פריסה מחדש של הקומיט הקודם באותה דרך.
- **מקס:** propose_change, apply_change עם reason, test_chat, ו-restore_version לחזרה.

## 9. לא לגעת
- תהליכים ב-n8n ותרחישים ב-Make של לקוחות אחרים (אותו שרת, אותו טוקן).
- פרויקטים אחרים ב-Supabase שה-PAT רואה.
- פרופילים אחרים בשרת Hermes.
