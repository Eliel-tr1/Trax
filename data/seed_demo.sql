-- Demo/QA seed data. Synthetic only — never real customer data (CLAUDE.md).
-- Deliberately includes edge cases per the playbook: a journey with many
-- registrations, a journey with none, an about-to-be-full journey, mixed
-- currencies, mixed stages/statuses so dashboards/filters have something
-- to show instead of one flat state.

do $$
declare
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; c6 uuid; c7 uuid; c8 uuid;
  c9 uuid; c10 uuid; c11 uuid; c12 uuid; c13 uuid; c14 uuid; c15 uuid;
  xc1 uuid; xc2 uuid; xc3 uuid; xc4 uuid; xc5 uuid;
  j1 uuid; j2 uuid; j3 uuid; j4 uuid; j5 uuid; j6 uuid; j_empty uuid;
  s1 uuid; s2 uuid; s3 uuid;
  goldi_id uuid;
begin
  select id into goldi_id from app_users where full_name = 'גולדי' limit 1;

  -- ===== TRAX customers (15) =====
  insert into customers (first_name,last_name,mobile_phone,email,business_unit,lead_source,campaign,status,lead_rating,club_member,extreme_experience_level,preferred_language,owner_id)
  values ('דנה','כהן','+972501112221','dana.c@example.com','TRAX','פייסבוק','montenegro-oct','לקוח פעיל','חם',true,'מנוסה','עברית',goldi_id) returning id into c1;
  insert into customers (first_name,last_name,mobile_phone,email,business_unit,lead_source,campaign,status,lead_rating,extreme_experience_level)
  values ('יובל','לוי','+972501112222','yuval.l@example.com','TRAX','אינסטגרם','montenegro-oct','בטיפול','חם','בינוני') returning id into c2;
  insert into customers (first_name,last_name,mobile_phone,email,business_unit,lead_source,status,lead_rating)
  values ('מיכל','אברהם','+972501112223','michal.a@example.com','TRAX','גוגל','ליד חדש','פושר') returning id into c3;
  insert into customers (first_name,last_name,mobile_phone,email,business_unit,lead_source,campaign,status,lead_rating,club_member)
  values ('אורי','שרון','+972501112224','ori.s@example.com','TRAX','אתר TRAX','uae-dec','לקוח פעיל','חם',true) returning id into c4;
  insert into customers (first_name,last_name,mobile_phone,email,business_unit,lead_source,status,lead_rating)
  values ('נועה','פרידמן','+972501112225','noa.f@example.com','TRAX','המלצה','לקוח פעיל','חם') returning id into c5;
  insert into customers (first_name,last_name,mobile_phone,email,business_unit,lead_source,campaign,status,lead_rating)
  values ('איתי','ברק','+972501112226','itai.b@example.com','TRAX','פייסבוק','montenegro-oct','בטיפול','פושר') returning id into c6;
  insert into customers (first_name,last_name,mobile_phone,email,business_unit,lead_source,status,lead_rating)
  values ('שירה','גולן','+972501112227','shira.g@example.com','TRAX','דף נחיתה','ליד חדש','חם') returning id into c7;
  insert into customers (first_name,last_name,mobile_phone,email,business_unit,lead_source,status,lead_rating)
  values ('רועי','מזרחי','+972501112228','roi.m@example.com','TRAX','אינסטגרם','ליד חדש','קר') returning id into c8;
  insert into customers (first_name,last_name,mobile_phone,email,business_unit,lead_source,status,lead_rating,club_member)
  values ('טל','נחמיאס','+972501112229','tal.n@example.com','TRAX','המלצה','לקוח פעיל','חם',true) returning id into c9;
  insert into customers (first_name,last_name,mobile_phone,email,business_unit,lead_source,campaign,status,lead_rating)
  values ('הדר','אזולאי','+972501112230','hadar.a@example.com','TRAX','גוגל','costa-rica-nov','בטיפול','חם') returning id into c10;
  insert into customers (first_name,last_name,mobile_phone,email,business_unit,lead_source,status,lead_rating)
  values ('אלון','דיין','+972501112231','alon.d@example.com','TRAX','פייסבוק','ליד חדש','פושר') returning id into c11;
  insert into customers (first_name,last_name,mobile_phone,email,business_unit,lead_source,status,lead_rating)
  values ('גל','רוזן','+972501112232','gal.r@example.com','TRAX','אתר TRAX','ליד חדש','חם') returning id into c12;
  insert into customers (first_name,last_name,mobile_phone,email,business_unit,lead_source,status,lead_rating)
  values ('ליאור','שפירא','+972501112233','lior.sh@example.com','TRAX','אינסטגרם','לקוח עבר','לא רלוונטי') returning id into c13;
  insert into customers (first_name,last_name,mobile_phone,email,business_unit,lead_source,status,lead_rating)
  values ('עדי','קפלן','+972501112234','adi.k@example.com','TRAX','המלצה','לקוח פעיל','חם') returning id into c14;
  insert into customers (first_name,last_name,mobile_phone,email,business_unit,lead_source,status,lead_rating)
  values ('בר','וייס','+972501112235','bar.w@example.com','TRAX','פייסבוק','לא רלוונטי','לא רלוונטי') returning id into c15;

  -- ===== Xcon customers (5) — organizational, work-email identity =====
  insert into customers (first_name,last_name,work_email,company,job_title,business_unit,status)
  values ('משה','גרין','moshe@ent-global.com','Ent Global Ltd','סמנכ"ל תפעול','Xcon','בטיפול') returning id into xc1;
  insert into customers (first_name,last_name,work_email,company,job_title,business_unit,status)
  values ('רונית','שגיא','ronit@northtech.co.il','NorthTech','CIO','Xcon','לקוח פעיל') returning id into xc2;
  insert into customers (first_name,last_name,work_email,company,job_title,business_unit,status)
  values ('דורון','אשכנזי','doron@meridian-mfg.com','Meridian Mfg','VP IT','Xcon','ליד חדש') returning id into xc3;
  insert into customers (first_name,last_name,work_email,company,job_title,business_unit,status)
  values ('ענת','לב','anat@harborlog.com','Harbor Logistics','מנכ"לית','Xcon','ליד חדש') returning id into xc4;
  insert into customers (first_name,last_name,work_email,company,job_title,business_unit,status)
  values ('קובי','נוי','kobi@nexa-systems.com','Nexa Systems','מנהל פרויקטים','Xcon','לקוח פעיל') returning id into xc5;

  -- Xcon contacts (org customer can have multiple contacts)
  insert into contacts (customer_id, name, phone, email, role) values
  (xc1, 'רותם כרמלי', '+972521112221', 'rotem@ent-global.com', 'רכש'),
  (xc2, 'יאיר בן דוד', '+972521112222', 'yair@northtech.co.il', 'IT Manager');

  -- ===== Journeys (Wave 2 data, seeded now so the trigger math has real seats to compute) =====
  insert into journeys (name,business_unit,destination,departure_date,return_date,seats_total,min_seats,status,price_per_person,currency,short_description)
  values ('מונטנגרו, אוקטובר 2026','TRAX','מונטנגרו','2026-10-18','2026-10-25',22,18,'פתוח להרשמה',5000,'EUR','אקסטרים ביום, יוקרה בלילה') returning id into j1;

  insert into journeys (name,business_unit,destination,departure_date,return_date,seats_total,min_seats,status,price_per_person,currency,short_description)
  values ('מונטנגרו, מאי 2026','TRAX','מונטנגרו','2026-05-10','2026-05-17',22,18,'פתוח להרשמה',5000,'EUR','אקסטרים ביום, יוקרה בלילה') returning id into j2;
  insert into journeys (name,business_unit,destination,departure_date,return_date,seats_total,min_seats,status,price_per_person,currency,short_description)
  values ('איחוד האמירויות, דצמבר 2026','TRAX','איחוד האמירויות','2026-12-05','2026-12-12',20,18,'פתוח להרשמה',5200,'USD','מדבר, יוקרה ואקסטרים') returning id into j3;
  insert into journeys (name,business_unit,destination,departure_date,return_date,seats_total,min_seats,status,price_per_person,currency,short_description)
  values ('קוסטה ריקה, נובמבר 2026','TRAX','קוסטה ריקה','2026-11-14','2026-11-21',22,18,'בתכנון',5000,'EUR','ג׳ונגל וגלישה') returning id into j4;
  insert into journeys (name,business_unit,destination,departure_date,return_date,seats_total,min_seats,status,price_per_person,currency,short_description)
  values ('מונטנגרו, מרץ 2027','TRAX','מונטנגרו','2027-03-14','2027-03-21',22,18,'בתכנון',5000,'EUR','אקסטרים ביום, יוקרה בלילה') returning id into j5;
  -- near-full journey (20/22 sold, tests the "כמעט מלא" ≤2-seats-left automation)
  insert into journeys (name,business_unit,destination,departure_date,return_date,seats_total,min_seats,status,price_per_person,currency,short_description)
  values ('איחוד האמירויות, ינואר 2027','TRAX','איחוד האמירויות','2027-01-10','2027-01-17',22,18,'פתוח להרשמה',5200,'USD','מדבר, יוקרה ואקסטרים') returning id into j6;
  -- deliberate edge case: a journey with ZERO registrations
  insert into journeys (name,business_unit,destination,departure_date,return_date,seats_total,min_seats,status,price_per_person,currency,short_description)
  values ('קוסטה ריקה, פברואר 2027','TRAX','קוסטה ריקה','2027-02-20','2027-02-27',22,18,'פתוח להרשמה',5000,'EUR','ג׳ונגל וגלישה') returning id into j_empty;

  -- ===== Sales (mix of stages, TRAX + Xcon) =====
  insert into sales (customer_id,business_unit,stage,channel,lead_source,campaign,owner_id,journey_id,participants_count,expected_value,currency,qualification_rating,next_call_at)
  values (c1,'TRAX','נסגר בהצלחה','וואטסאפ','פייסבוק','montenegro-oct',goldi_id,j1,2,10000,'EUR','עומד בקריטריונים',null);
  insert into sales (customer_id,business_unit,stage,channel,lead_source,campaign,owner_id,journey_id,participants_count,expected_value,currency,qualification_rating,next_call_at)
  values (c2,'TRAX','ממתין להחלטה','וואטסאפ','אינסטגרם','montenegro-oct',goldi_id,j1,1,5000,'EUR','עומד בקריטריונים', now() + interval '2 days');
  insert into sales (customer_id,business_unit,stage,channel,lead_source,owner_id)
  values (c3,'TRAX','נוצר קשר על ידי AI','טופס אתר','גוגל',goldi_id);
  insert into sales (customer_id,business_unit,stage,channel,lead_source,campaign,owner_id,journey_id,participants_count,expected_value,currency,qualification_rating)
  values (c4,'TRAX','נסגר בהצלחה','טופס אתר','אתר TRAX','uae-dec',goldi_id,j3,2,10400,'USD','עומד בקריטריונים');
  insert into sales (customer_id,business_unit,stage,channel,lead_source,owner_id,journey_id,participants_count,expected_value,currency,qualification_rating)
  values (c5,'TRAX','נסגר בהצלחה','טלפון','המלצה',goldi_id,j2,1,5000,'EUR','עומד בקריטריונים');
  insert into sales (customer_id,business_unit,stage,channel,lead_source,campaign,owner_id,loss_reason)
  values (c6,'TRAX','עסקה הופסדה','וואטסאפ','פייסבוק','montenegro-oct',goldi_id,'מחיר');
  insert into sales (customer_id,business_unit,stage,channel,lead_source,owner_id)
  values (c7,'TRAX','ליד חדש','דף נחיתה','דף נחיתה',goldi_id);
  insert into sales (customer_id,business_unit,stage,channel,lead_source,owner_id,loss_reason)
  values (c8,'TRAX','עסקה הופסדה','וואטסאפ','אינסטגרם',goldi_id,'לא ענה');
  insert into sales (customer_id,business_unit,stage,channel,lead_source,owner_id,journey_id,participants_count,expected_value,currency,qualification_rating)
  values (c9,'TRAX','נסגר בהצלחה','טלפון','המלצה',goldi_id,j6,1,5200,'USD','עומד בקריטריונים');
  insert into sales (customer_id,business_unit,stage,channel,lead_source,campaign,owner_id,journey_id,expected_value,currency,qualification_rating,next_call_at)
  values (c10,'TRAX','הצעה נשלחה','טופס אתר','גוגל','costa-rica-nov',goldi_id,j4,5000,'EUR','עומד בקריטריונים', now() + interval '1 day');
  insert into sales (customer_id,business_unit,stage,channel,lead_source,owner_id)
  values (c11,'TRAX','ליד חדש','וואטסאפ','פייסבוק',goldi_id);
  insert into sales (customer_id,business_unit,stage,channel,lead_source,owner_id)
  values (c12,'TRAX','ליד חדש','טופס אתר','אתר TRAX',goldi_id);
  insert into sales (customer_id,business_unit,stage,channel,lead_source,owner_id,loss_reason)
  values (c13,'TRAX','עסקה הופסדה','טופס אתר','אינסטגרם',goldi_id,'אחר');
  insert into sales (customer_id,business_unit,stage,channel,lead_source,owner_id,journey_id,participants_count,expected_value,currency,qualification_rating,next_call_at)
  values (c14,'TRAX','ממתין להחלטה','טלפון','המלצה',goldi_id,j5,2,10000,'EUR','עומד בקריטריונים', now() - interval '1 day'); -- overdue, tests "ממתין לי" view
  insert into sales (customer_id,business_unit,stage,channel,lead_source,owner_id,loss_reason)
  values (c15,'TRAX','עסקה הופסדה','וואטסאפ','פייסבוק',goldi_id,'לא רלוונטי');

  -- Xcon sales (their own stage vocabulary reuses the same field per spec — using generic stages)
  insert into sales (customer_id,business_unit,stage,channel,owner_id,interest_area)
  values (xc1,'Xcon','שיחת מכירה עם נציג אנושי','טופס אתר',goldi_id,'ייעוץ');
  insert into sales (customer_id,business_unit,stage,channel,owner_id,interest_area)
  values (xc2,'Xcon','נסגר בהצלחה','טופס אתר',goldi_id,'פרויקטים');
  insert into sales (customer_id,business_unit,stage,channel,owner_id,interest_area)
  values (xc3,'Xcon','ליד חדש','טופס אתר',goldi_id,'פתרונות');
  insert into sales (customer_id,business_unit,stage,channel,owner_id,interest_area)
  values (xc4,'Xcon','ליד חדש','טופס אתר',goldi_id,'שותפויות');
  insert into sales (customer_id,business_unit,stage,channel,owner_id,interest_area)
  values (xc5,'Xcon','נסגר בהצלחה','טופס אתר',goldi_id,'קריירה'); -- career interest → no alert per spec, still fine as demo data

  -- ===== Registrations (drives the seat-count trigger — verify journeys update live) =====
  -- j1 (מונטנגרו אוקטובר): 3 registrations, mixed payment status
  insert into registrations (customer_id,journey_id,status,amount_paid,currency,payment_method,passport_valid,travel_insurance) values
  (c1,j1,'שולם במלואו',5000,'EUR','אשראי',true,true),
  (c1,j1,'שולם במלואו',5000,'EUR','אשראי',true,true), -- c1's partner, same deal
  (c2,j1,'שולמה מקדמה',1500,'EUR','העברה בנקאית',false,false);

  -- j3 (איחוד האמירויות דצמבר): 2 registrations
  insert into registrations (customer_id,journey_id,status,amount_paid,currency,payment_method,passport_valid,travel_insurance) values
  (c4,j3,'שולם במלואו',5200,'USD','אשראי',true,true),
  (c4,j3,'שולם במלואו',5200,'USD','אשראי',true,true);

  -- j2 (מונטנגרו מאי): 1 registration
  insert into registrations (customer_id,journey_id,status,amount_paid,currency,payment_method,passport_valid) values
  (c5,j2,'משוריין',0,'EUR','אחר',false);

  -- j6 (איחוד האמירויות ינואר 2027): 20 registrations → tests "כמעט מלא" (22-20=2 left) automation.
  -- Reuse existing customers cyclically since this is synthetic seat-fill data, not real people.
  insert into registrations (customer_id,journey_id,status,amount_paid,currency,payment_method,passport_valid,travel_insurance)
  select c.id, j6, 'שולם במלואו', 5200, 'USD', 'אשראי', true, true
  from (select id from customers where business_unit='TRAX' and deleted_at is null order by id limit 15) c;
  insert into registrations (customer_id,journey_id,status,amount_paid,currency,payment_method,passport_valid,travel_insurance)
  select c.id, j6, 'שולמה מקדמה', 1500, 'USD', 'העברה בנקאית', true, false
  from (select id from customers where business_unit='TRAX' and deleted_at is null order by id limit 5) c;

  -- j5: 1 cancelled registration (must NOT count toward seats_sold)
  insert into registrations (customer_id,journey_id,status,amount_paid,currency) values (c14,j5,'בוטל',0,'EUR');

  -- j_empty stays with zero registrations deliberately.

  -- ===== Tasks (a few open, a few done) =====
  insert into tasks (subject, related_type, related_id, assignee_id, due_at, status, priority) values
  ('להתקשר לדנה לגבי מקדמה', 'customer', c2, goldi_id, now() + interval '1 day', 'פתוחה', 'רגילה'),
  ('לוודא תשלום מלא - הדר', 'customer', c10, goldi_id, now() + interval '3 days', 'פתוחה', 'גבוהה'),
  ('מעקב אחרי שיחת אפיון Xcon', 'customer', xc1, goldi_id, now() - interval '1 day', 'פתוחה', 'דחופה'),
  ('שליחת חוזה חתום', 'customer', c1, goldi_id, now() - interval '5 days', 'בוצעה', 'רגילה');

end $$;

-- One deliberate rejection test, per the playbook step 06 — proves the
-- CHECK constraints are real, not just documented. Run separately and
-- expect it to fail with 23514.
-- insert into customers (first_name,last_name,business_unit,status) values ('בדיקה','שגויה','TRAX','לא-סטטוס-אמיתי');
