// Direct Voicenter -> n8n -> CRM call ingestion. Called by the n8n workflow
// "Trax Calls - Voicenter" (QqOrRlWGBANByx2C) once per Voicenter CDR
// Notification, AFTER n8n's "נרמול CDR" Code node has normalized the raw
// CDR (JSON or form-urlencoded) into the contract below.
//
// See docs/decisions/0009-voicenter-direct-cdr-ingestion.md for why this
// path exists alongside fireberry-call-sync (0005), and for the field
// mapping and what is still unverified until the first real Voicenter call.
//
// Expected POST body (built by n8n):
// {
//   ivruniqueid: string,            // Voicenter call id -> phone_calls.external_call_id
//   direction: "נכנסת" | "יוצאת" | null,
//   skip_reason: string | null,     // set by n8n for internal / leg1 calls
//   customer_phone_raw: string|null,// the side that is NOT a TRAX extension/DID
//   occurred_at: ISO string | null,
//   duration_seconds: number | null,
//   result: "נענתה" | "לא נענתה" | "תפוס" | "השאיר הודעה" | null,
//   recording_url: string | null,
//   transcript: string | null,
//   summary: string | null,
//   representative_name: string | null,
//   voicenter_type: string | null, voicenter_status: string | null,
//   execution_url: string | null,
//   raw: object                     // the untouched CDR, for debugging
// }
//
// Behavior:
// - Dedupe by external_call_id: an existing row is UPDATED (Voicenter retries,
//   or a later CDR carrying aiData), never duplicated.
// - Customer match: customers.mobile_phone (business_unit TRAX, not deleted),
//   compared in both stored formats (+972XXXXXXXXX and 0XXXXXXXXX).
// - Unknown number: NO customer is created (Sahar 11/10/2026). The call is
//   stored unlinked (related_id null, customer_phone set); the rep opens a
//   lead from the call screen ("הקמת ליד", create_lead_from_call in 048).
// - Sale link: OPEN sale of the customer, else the latest one (same rule as
//   fireberry-call-sync, Sahar 16.09).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUSINESS_UNIT = "TRAX";
const CLOSED_STAGES = ["נסגר בהצלחה", "עסקה הופסדה"];
const VALID_RESULTS = ["נענתה", "לא נענתה", "תפוס", "השאיר הודעה"];
const VALID_DIRECTIONS = ["נכנסת", "יוצאת"];
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Same target format as lead-intake/fireberry-call-sync (+972...), but also
// accepts Voicenter's "972XXXXXXXXX" (no plus) international form.
function toE164(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length < 9) return null; // extension / SIP code, not a phone
  if (s.startsWith("+")) return "+" + digits;
  if (digits.startsWith("972")) return "+" + digits;
  if (digits.startsWith("0")) return "+972" + digits.slice(1);
  return "+" + digits;
}

function phoneCandidates(e164: string): string[] {
  const out = new Set<string>([e164]);
  if (e164.startsWith("+972")) {
    const local = "0" + e164.slice(4);
    out.add(local);
    out.add(e164.slice(1)); // 972...
  }
  return [...out];
}

function normalizeName(raw: string): string {
  return String(raw || "").trim().replace(/\s+/g, " ").toLowerCase();
}

async function logUnmatched(admin: ReturnType<typeof createClient>, msg: string) {
  // automation_logs: the CRM's existing operational log (rule_id nullable).
  const { error } = await admin.from("automation_logs").insert({ rule_id: null, record_id: null, status: "skipped", message: msg });
  if (error) console.error("voicenter-call-sync: failed to write automation_logs", error.message);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonResponse({ error: "invalid JSON" }, 400);

  // Raw CDR goes to the function log too, so the first real call can be
  // inspected even if the n8n execution was pruned.
  console.log("voicenter-call-sync: received", JSON.stringify(body).slice(0, 4000));

  const ivr = String(body.ivruniqueid || "").trim();
  if (!ivr) return jsonResponse({ ok: false, status: "rejected", reason: "missing ivruniqueid" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // EVERY call is stored, no exceptions (Sahar 11/10/2026): internal calls,
  // Click2Call leg1 and calls without a customer number included. n8n's
  // skip_reason is kept only as information in the function log.
  if (body.skip_reason) console.log(`voicenter-call-sync: note ivruniqueid=${ivr} ${body.skip_reason}`);

  const e164 = body.customer_phone_raw ? toE164(String(body.customer_phone_raw)) : null;
  let customerId: string | null = null;
  if (e164) {
    const { data: custs, error } = await admin
      .from("customers")
      .select("id, created_at")
      .eq("business_unit", BUSINESS_UNIT)
      .is("deleted_at", null)
      .in("mobile_phone", phoneCandidates(e164))
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) return jsonResponse({ ok: false, status: "error", reason: `customer lookup: ${error.message}` }, 500);
    customerId = custs?.[0]?.id ?? null;
  }

  // Existing row (retry / AI data arriving later) is always updated, even if
  // the number no longer matches, so a retry never creates a duplicate.
  const { data: existing } = await admin
    .from("phone_calls")
    .select("id, related_id")
    .eq("external_call_id", ivr)
    .limit(1)
    .maybeSingle();

  // Rep on the call (best effort, by app_users.full_name).
  let assignedUserId: string | null = null;
  if (body.representative_name) {
    const { data: users } = await admin.from("app_users").select("id, full_name");
    const want = normalizeName(body.representative_name);
    assignedUserId = (users || []).find((u) => normalizeName(u.full_name) === want)?.id ?? null;
  }

  const direction = VALID_DIRECTIONS.includes(body.direction) ? body.direction : "נכנסת";
  const occurredAt = body.occurred_at || new Date().toISOString();

  // Unknown number: NEVER create a lead (Sahar 11/10/2026). The call is
  // stored UNLINKED (related_id null) with customer_phone; a rep opens the
  // lead from the call screen ("הקמת ליד" -> create_lead_from_call, 048).
  const relatedId: string | null = customerId ?? existing?.related_id ?? null;

  let saleId: string | null = null;
  if (relatedId) {
    const { data: sales } = await admin
      .from("sales")
      .select("id, stage")
      .eq("customer_id", relatedId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10);
    const openSale = (sales || []).find((s) => !CLOSED_STAGES.includes(s.stage));
    saleId = openSale?.id ?? (sales && sales.length ? sales[0].id : null);
  }

  const row: Record<string, unknown> = {
    related_type: "customer",
    related_id: relatedId,
    sale_id: saleId,
    direction,
    occurred_at: occurredAt,
    duration_seconds: Number.isFinite(Number(body.duration_seconds)) && body.duration_seconds !== null ? Math.round(Number(body.duration_seconds)) : null,
    result: VALID_RESULTS.includes(body.result) ? body.result : null,
    recording_url: body.recording_url || null,
    business_unit: BUSINESS_UNIT,
    external_call_id: ivr,
    execution_url: body.execution_url || null,
  };
  // Only overwrite AI text/assignee when this CDR actually carries it, so a
  // retry without aiData never blanks a transcript that already arrived.
  if (e164) row.customer_phone = e164;
  if (body.transcript) row.transcript = body.transcript;
  if (body.summary) row.summary = body.summary;
  if (assignedUserId) row.assigned_user_id = assignedUserId;

  if (existing) {
    const { error } = await admin.from("phone_calls").update(row).eq("id", existing.id);
    if (error) return jsonResponse({ ok: false, status: "error", reason: `update: ${error.message}` }, 500);
    return jsonResponse({ ok: true, status: "updated", id: existing.id, customer_id: relatedId, sale_id: saleId });
  }
  const { data: ins, error } = await admin.from("phone_calls").insert(row).select("id").single();
  if (error) return jsonResponse({ ok: false, status: "error", reason: `insert: ${error.message}` }, 500);
  return jsonResponse({ ok: true, status: "inserted", id: ins.id, linked: !!relatedId, customer_id: relatedId, sale_id: saleId, assigned_user_id: assignedUserId });
});
