-- 049: TRAX side of a Voicenter call (Sahar 11/10/2026). The call screen shows
-- "שיחה יוצאת ממספר" (outgoing: the number the rep called from) or
-- "שיחה נכנסת למספר" (incoming: the TRAX number that was called), and the
-- assigned rep is the user whose app_users.phone is on the call (TRAX side
-- first, then the other side), falling back to Voicenter's representative_name.
alter table phone_calls add column if not exists trax_number text; -- E.164
