// Public lead-intake webhook — the exact payload contract already committed
// to the client's site/landing/Xcon forms (docs/domain-model.md, "הטפסים
// באתרים"). Thin translation layer over the generic /api-v1 object API
// (decision 0003) — does normalization/dedup/business-unit routing, then
// calls api-v1 for the actual customer/sale writes so authorization and
// field validation stay in one place.
//
// POST body: { full_name, phone, email?, message?, form_id, utm_source?,
//   utm_medium?, utm_campaign?, utm_content?, utm_term?, page_url? }
// form_id: "site" | "landing" | "xcon"

import { createClient } from "jsr:@supabase/supabase-js@2";

const API_BASE = Deno.env.get("API_BASE_URL") || `${Deno.env.get("SUPABASE_URL")}/functions/v1/api-v1`;
// Trusted-internal-caller pattern (see api-v1/index.ts) — the service role
// key is already auto-injected into every Edge Function in this project,
// so no separate secret needs provisioning for server-to-server calls.
const INTERNAL_API_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SOURCE_MAP: Record<string, string> = {
  facebook: "פייסבוק",
  fb: "פייסבוק",
  instagram: "אינסטגרם",
  ig: "אינסטגרם",
  google: "גוגל",
  site: "אתר TRAX",
  landing: "דף נחיתה",
  referral: "המלצה",
};

// גולדי — the author of auto-created feed notes and the default owner of
// new customers/sales coming from forms (Sahar 10.09 round 2: "שייך בדיפולט
// למשתמש שייצר אותו" — the webhook has no user session, so the CRM's
// designated default rep owns the lead until reassigned).
const DEFAULT_OWNER_ID = "772a4955-5302-475a-ba69-2e3a2929d0f0";

// Feed notes aren't exposed through api-v1 (not in its SCHEMA allow-list),
// so this writes them with the service role key directly.
async function insertNoteDirect(relatedType: string, relatedId: string, content: string) {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, INTERNAL_API_KEY);
  await admin.from("notes").insert({
    related_type: relatedType,
    related_id: relatedId,
    content,
    created_by: DEFAULT_OWNER_ID,
  });
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return "+972" + digits.slice(1);
  return digits;
}

async function apiCall(path: string, method: string, body?: unknown) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${INTERNAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  return { ok: res.ok, status: res.status, json };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  const body = await req.json().catch(() => null);
  if (!body) return jsonResponse({ error: "invalid JSON" }, 400);

  const { full_name, phone, email, message, form_id, utm_source, utm_medium, utm_campaign, page_url } = body;
  // Xcon leads identify by work email; phone isn't required there.
  const isXcon = form_id === "xcon";
  if (!full_name || (!isXcon && !phone) || (isXcon && !email) || !form_id) {
    return jsonResponse({ error: "full_name, form_id and (phone for TRAX / email for Xcon) are required" }, 400);
  }

  const businessUnit = isXcon ? "Xcon" : "TRAX";
  const normalizedPhone = normalizePhone(String(phone));
  const [firstName, ...rest] = String(full_name).trim().split(/\s+/);
  const lastName = rest.join(" ") || "-";
  const leadSource = SOURCE_MAP[(utm_source || "").toLowerCase()] || "אחר";
  const channel = form_id === "landing" ? "דף נחיתה" : "טופס אתר";

  // Dedup: phone for TRAX, work email for Xcon — never cross business units.
  const identityField = businessUnit === "Xcon" ? "work_email" : "mobile_phone";
  const identityValue = businessUnit === "Xcon" ? email : normalizedPhone;

  let customerId: string | null = null;
  if (identityValue) {
    const lookup = await apiCall(
      `customers?business_unit=${businessUnit}&${identityField}=${encodeURIComponent(identityValue)}`,
      "GET",
    );
    if (lookup.ok && lookup.json.data?.length) {
      customerId = lookup.json.data[0].id;
    }
  }

  if (!customerId) {
    const createCustomer = await apiCall("customers", "POST", {
      first_name: firstName,
      last_name: lastName,
      mobile_phone: businessUnit === "TRAX" ? normalizedPhone : undefined,
      email: email || undefined,
      work_email: businessUnit === "Xcon" ? email : undefined,
      business_unit: businessUnit,
      lead_source: leadSource,
      campaign: utm_campaign || undefined,
      status: "ליד חדש",
      notes: message || undefined,
      // Webhook has no user session — the CRM's default rep owns the lead
      // until reassigned (Sahar 10.09 round 2).
      owner_id: DEFAULT_OWNER_ID,
    });
    if (!createCustomer.ok) {
      return jsonResponse({ error: "failed to create customer", detail: createCustomer.json }, 502);
    }
    customerId = createCustomer.json.data.id;
  } else if (message) {
    // Existing customer re-submitting the form: append the form note to the
    // customer's notes (same convention wf05a uses) instead of dropping it
    // (Sahar 10.09: "ההערה מהטופס לא נכנסה ל-CRM").
    const existing = await apiCall(`customers?id=eq.${customerId}`, "GET");
    const prior = existing.ok ? existing.json.data?.[0]?.notes : null;
    const stamp = new Date().toISOString().slice(0, 10);
    const appended = (prior ? prior + "\n\n" : "") + `[טופס ${stamp}] ${message}`;
    await apiCall(`customers?id=eq.${customerId}`, "PATCH", { notes: appended });
  }

  // The form note as a FEED NOTE on the customer too (Sahar 10.09 round 2):
  // visible in the left-side הערות feed like a human-written note.
  if (message && customerId) await insertNoteDirect("customer", customerId, message);

  // A repeat inquiry always opens a new sale, even for an existing customer.
  // The form's note is ALSO stamped on the sale (Sahar 10.09: "הערה מטופס
  // הפניה: {ההערה}" inside the sale process itself), so the rep opening the
  // sale sees the visitor's own words without hunting through the customer
  // file.
  const createSale = await apiCall("sales", "POST", {
    customer_id: customerId,
    business_unit: businessUnit,
    channel,
    lead_source: leadSource,
    campaign: utm_campaign || undefined,
    owner_id: DEFAULT_OWNER_ID,
    ...(message ? { qualification_summary: `הערה מטופס הפניה: ${message}` } : {}),
  });
  if (!createSale.ok) {
    return jsonResponse({ error: "failed to create sale", detail: createSale.json }, 502);
  }
  const saleId: string = createSale.json.data.id;

  // The form note as a FEED NOTE on the sale too (Sahar 10.09 round 2).
  if (message) await insertNoteDirect("sale", saleId, message);

  return jsonResponse({
    success: true,
    customer_id: customerId,
    sale_id: saleId,
  }, 201);
});
