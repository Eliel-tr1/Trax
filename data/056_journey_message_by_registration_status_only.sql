-- 056: the "ברוך הבא למסע" / "שמירת מקום" WhatsApp depends on the REGISTRATION
-- status only (Sahar 25/10/2026). A registration created in 'משוריין' while the
-- sale was still open sent nothing (cloudchat-bridge gated on the sale stage);
-- it only went out after the sale moved to 'נסגר בהצלחה'.
--
-- 1. Drop the sale-won trigger: a sale stage change no longer re-fires
--    registration events (single path: registration INSERT / status change /
--    passenger added). journey_messages (registration, kind, phone) still
--    guarantees at most one send per person per message kind.
-- 2. Remove the obsolete gate setting (the function no longer reads it).
-- Idempotent.
drop trigger if exists sales_journey_webhook on sales;
drop function if exists sales_fire_journey_webhook();
delete from system_settings where key = 'whatsapp_journey_require_sale_won';
