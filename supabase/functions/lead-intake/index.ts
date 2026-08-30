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
  if (!full_name || !phone || !form_id) {
    return jsonResponse({ error: "full_name, phone and form_id are required" }, 400);
  }

  const businessUnit = form_id === "xcon" ? "Xcon" : "TRAX";
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
    });
    if (!createCustomer.ok) {
      return jsonResponse({ error: "failed to create customer", detail: createCustomer.json }, 502);
    }
    customerId = createCustomer.json.data.id;
  }

  // A repeat inquiry always opens a new sale, even for an existing customer.
  const createSale = await apiCall("sales", "POST", {
    customer_id: customerId,
    business_unit: businessUnit,
    channel,
    lead_source: leadSource,
    campaign: utm_campaign || undefined,
  });
  if (!createSale.ok) {
    return jsonResponse({ error: "failed to create sale", detail: createSale.json }, 502);
  }

  return jsonResponse({
    success: true,
    customer_id: customerId,
    sale_id: createSale.json.data.id,
  }, 201);
});
