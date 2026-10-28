// customer-context: read-only "who is writing to Max" lookup, by phone.
// GET /customer-context?phone=<any format>   (also POST {phone})
// Auth: `Authorization: Bearer <api key>` (same keys as api-v1, verify_api_key()).
//
// Matches on the LAST 9 DIGITS, so +972533435240, 972533435240 and 0533435240
// are the same person (customers.mobile_phone is E.164 for almost everyone but
// not for all rows). Matches the customer first, then registration passengers.
// Returns the minimum Max needs to open the conversation properly: first name,
// status, the trips (journey, dates, registration status, timing relative to
// today in Asia/Jerusalem), the latest sale stage, and a ready `prompt_block`.
// No last name, email, amounts or payment data leave this function.
// Writes nothing except api_keys.last_used_at (inside verify_api_key) and a row
// in api_request_logs, like api-v1.
// docs/decisions/0012-customer-context-for-max.md

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const last9 = (s: string | null | undefined) =>
  (s || "").replace(/\D/g, "").slice(-9);

function todayIL(): string {
  // YYYY-MM-DD in Asia/Jerusalem
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}
const dayDiff = (a: string, b: string) =>
  Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000);

type Trip = {
  registration_id: string;
  journey_name: string | null;
  destination: string | null;
  departure_date: string | null;
  return_date: string | null;
  registration_status: string | null;
  timing: "upcoming" | "ongoing" | "past" | "unknown";
  days_until_departure: number | null;
  as_passenger_only?: boolean;
};

function timingOf(dep: string | null, ret: string | null, today: string): Trip["timing"] {
  if (!dep) return "unknown";
  const end = ret || dep;
  if (today < dep) return "upcoming";
  if (today > end) return "past";
  return "ongoing";
}

Deno.serve(async (req: Request) => {
  const startedAt = Date.now();
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const url = new URL(req.url);

  const key = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!key) return json({ error: "missing API key" }, 401);
  const { data: keyRows, error: keyErr } = await admin.rpc("verify_api_key", { p_key: key });
  if (keyErr || !keyRows || keyRows.length === 0) {
    return json({ error: "invalid or inactive API key" }, 401);
  }
  const apiKeyId = keyRows[0].id as string;
  const log = (status: number) =>
    admin.from("api_request_logs").insert({
      api_key_id: apiKeyId,
      path: url.pathname,
      method: req.method,
      status_code: status,
      response_time_ms: Date.now() - startedAt,
    });

  let phone = url.searchParams.get("phone") || "";
  if (!phone && req.method === "POST") {
    const body = await req.json().catch(() => null);
    phone = String(body?.phone || "");
  }
  const key9 = last9(phone);
  if (key9.length < 9) {
    await log(400);
    return json({ error: "phone needs at least 9 digits" }, 400);
  }

  try {
    const today = todayIL();

    // 1. customer by last 9 digits (paged scan: the table is small, formats vary)
    type Cust = { id: string; first_name: string | null; status: string | null; club_member: boolean | null; created_at: string };
    const matches: Cust[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin
        .from("customers")
        .select("id, first_name, status, club_member, mobile_phone, created_at")
        .is("deleted_at", null)
        .order("id")
        .range(from, from + 999);
      if (error) throw error;
      for (const c of data || []) if (last9(c.mobile_phone) === key9) matches.push(c as Cust);
      if (!data || data.length < 1000) break;
    }
    // Several rows for one phone (duplicates happen): prefer the one with registrations,
    // then the newest. All matching ids are returned so the agent can see the duplicate.
    let customer: Cust | null = null;
    if (matches.length === 1) customer = matches[0];
    else if (matches.length > 1) {
      const { data: regs } = await admin.from("registrations").select("customer_id")
        .in("customer_id", matches.map((m) => m.id)).is("deleted_at", null);
      const withReg = new Set((regs || []).map((r) => r.customer_id));
      matches.sort((a, b) =>
        (withReg.has(b.id) ? 1 : 0) - (withReg.has(a.id) ? 1 : 0) ||
        b.created_at.localeCompare(a.created_at));
      customer = matches[0];
    }

    // 2. registrations: of the customer, or (no customer match) of a passenger with this phone
    let regIds: string[] = [];
    let passengerOnly = false;
    let passengerName: string | null = null;
    if (customer) {
      const { data, error } = await admin
        .from("registrations")
        .select("id")
        .eq("customer_id", customer.id)
        .is("deleted_at", null);
      if (error) throw error;
      regIds = (data || []).map((r) => r.id);
    } else {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await admin
          .from("registration_passengers")
          .select("registration_id, full_name, phone")
          .not("phone", "is", null)
          .order("id")
          .range(from, from + 999);
        if (error) throw error;
        for (const p of data || []) {
          if (last9(p.phone) === key9) {
            regIds.push(p.registration_id);
            passengerName = passengerName || p.full_name;
          }
        }
        if (!data || data.length < 1000) break;
      }
      passengerOnly = regIds.length > 0;
    }

    const trips: Trip[] = [];
    if (regIds.length) {
      const { data, error } = await admin
        .from("registrations")
        .select("id, status, journeys(name, destination, departure_date, return_date)")
        .in("id", regIds)
        .is("deleted_at", null);
      if (error) throw error;
      for (const r of (data || []) as any[]) {
        const j = Array.isArray(r.journeys) ? r.journeys[0] : r.journeys;
        const dep = j?.departure_date ?? null;
        const ret = j?.return_date ?? null;
        trips.push({
          registration_id: r.id,
          journey_name: j?.name ?? null,
          destination: j?.destination ?? null,
          departure_date: dep,
          return_date: ret,
          registration_status: r.status ?? null,
          timing: timingOf(dep, ret, today),
          days_until_departure: dep ? dayDiff(dep, today) : null,
          ...(passengerOnly ? { as_passenger_only: true } : {}),
        });
      }
      trips.sort((a, b) => (a.departure_date || "").localeCompare(b.departure_date || ""));
    }

    // 3. latest sale of the customer (stage only)
    let sale: Record<string, unknown> | null = null;
    if (customer) {
      const { data, error } = await admin
        .from("sales")
        .select("id, stage, journey_id, participants_count, expected_value, currency, interest_area")
        .eq("customer_id", customer.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      sale = data && data[0] ? data[0] : null;
    }

    const { data: jr, error: jerr } = await admin
      .from("journeys")
      .select("id, name, destination, departure_date, return_date, status, price_per_person, currency, page_url, site_url, video_url")
      .is("deleted_at", null)
      .gte("departure_date", today)
      .order("departure_date");
    if (jerr) throw jerr;
    const journeys = (jr || []).filter((j) => j.status !== "בוטל");

    const activeTrips = trips.filter((t) => t.registration_status !== "בוטל");
    const isExisting =
      activeTrips.length > 0 || customer?.status === "לקוח פעיל";
    const found = !!customer || passengerOnly;
    const kind = !found ? "unknown" : isExisting ? "existing_customer" : "known_lead";

    const firstName = customer?.first_name || (passengerName || "").split(" ")[0] || null;
    const tripLine = (t: Trip) => {
      const when =
        t.timing === "upcoming" ? `upcoming, departs in ${t.days_until_departure} days`
        : t.timing === "ongoing" ? "happening right now"
        : t.timing === "past" ? "already finished"
        : "date unknown";
      return `- ${t.journey_name || t.destination || "journey"} (${t.departure_date || "?"} to ${t.return_date || "?"}), registration status ${t.registration_status}, ${when}${t.as_passenger_only ? ", he is a passenger on someone else's registration" : ""}`;
    };
    let prompt_block: string;
    if (kind === "existing_customer") {
      prompt_block =
        `Known customer: YES, an existing TRAX customer (identified by his WhatsApp number).\n` +
        `First name: ${firstName || "unknown"}. CRM status: ${customer?.status || "passenger"}.\n` +
        `His trips:\n${trips.map(tripLine).join("\n") || "- none on record"}`;
    } else if (kind === "known_lead") {
      prompt_block =
        `Known customer: NO customer yet, but a known lead in the CRM (identified by his WhatsApp number).\n` +
        `First name: ${firstName || "unknown"}. CRM status: ${customer?.status}. Latest inquiry stage: ${sale?.stage || "none"}.\n` +
        `No trips booked.`;
    } else {
      prompt_block = `Known customer: NO. This phone number is not in the CRM. Treat as a new inquiry.`;
    }

    const salesLine = sale
      ? `\nOpen CRM sale for him: sale_id=${sale.id}, stage=${sale.stage}, journey_id=${sale.journey_id ?? "empty"}, participants_count=${sale.participants_count ?? "empty"}, expected_value=${sale.expected_value ?? "empty"} ${sale.currency ?? ""}.`
      : "";
    const idsLine = customer ? `\ncustomer_id=${customer.id} (use these ids directly for update_customers / update_sales, no lookup needed).` : "";
    const catalog = journeys.length
      ? `\nCRM journeys (internal, for filling CRM fields only; quote dates from here, price only as the business price list allows):\n` +
        journeys.map((j) => `- journey_id=${j.id} | ${j.name} | ${j.departure_date} to ${j.return_date ?? "?"} | ${j.status} | price_per_person=${j.price_per_person ?? "none"} ${j.currency ?? ""} | page=${j.page_url ?? j.site_url ?? "none"} | video=${j.video_url ?? "none"}`).join("\n")
      : "";
    prompt_block += idsLine + salesLine + catalog;

    await log(200);
    return json({
      found,
      kind, // existing_customer | known_lead | unknown
      is_existing_customer: kind === "existing_customer",
      customer: customer
        ? { id: customer.id, first_name: customer.first_name, status: customer.status, club_member: customer.club_member }
        : null,
      matched_as_passenger_only: passengerOnly,
      trips,
      latest_sale: sale,
      duplicate_customer_ids: matches.length > 1 ? matches.map((m) => m.id) : [],
      journeys,
      today: today,
      prompt_block,
    });
  } catch (e) {
    console.error(e);
    await log(500);
    return json({ error: "internal error" }, 500);
  }
});
