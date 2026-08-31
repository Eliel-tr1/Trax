// Parallel branch for n8n workflow WF-05a ("קליטת ליד מטופס האתר") — mirrors
// the exact search-then-update-or-create logic that WF05a's Origami branch
// already does, but against this TRAX CRM instead. Added alongside Origami,
// not replacing it: the client explicitly wants both systems fed from the
// same lead, independently.
//
// Deliberately its OWN Edge Function, not a change to lead-intake/index.ts —
// a different, already-working n8n workflow (TRAX - Lead Intake,
// pjhRD7eOj8Xs7aDR) depends on lead-intake's existing contract, and this
// endpoint's input shape (WF05a's post-G1-normalization payload, nested
// `utm` object, phone already E.164) is different enough that reusing it
// would risk that workflow instead of cleanly extending it.
//
// Expected POST body:
// { first_name, last_name, phone_e164, email, page_url, submitted_at,
//   message?, execution_url?,
//   utm: { funnel, utm_source, utm_medium, utm_campaign, utm_adset, utm_ad,
//          utm_content, utm_keyword, utm_ref, utm_placement } }
// (utm field NAMES match WF05a's own "נרמול ובדיקת תקינות (G1)" node exactly
// — utm_keyword maps to this CRM's utm_term column, utm_ref maps to referrer.
// `message`/`notes`/`comment` are read defensively since no real submission
// has ever sent one yet (confirmed via n8n execution history) — the site
// form may add one later, and G1 was deliberately left untouched rather than
// widening its allow-list, so the calling n8n node reads this straight off
// the raw Webhook node's output, not off G1's filtered one.)
//
// business_unit is always TRAX here — WF05a is the TRAX website's own lead
// form, it has no Xcon variant.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CLOSED_STAGES = ["נסגר בהצלחה", "עסקה הופסדה"];
const LEAD_SOURCE = "אתר TRAX"; // this webhook IS the TRAX site's own lead form — not derived from utm_source, which is the ad platform that drove traffic TO the site, a different concept
const CHANNEL = "טופס אתר";
const DEFAULT_ACCOUNT_MANAGER_ID = "772a4955-5302-475a-ba69-2e3a2929d0f0"; // גולדי — default account manager / sales rep for every new TRAX website lead until reassigned

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  const body = await req.json().catch(() => null);
  if (!body) return jsonResponse({ error: "invalid JSON" }, 400);

  const { first_name, last_name, phone_e164, email, page_url, utm, execution_url } = body;
  const message: string | undefined = body.message || body.notes || body.comment || body.comments || undefined;
  if (!phone_e164) return jsonResponse({ error: "phone_e164 is required" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const u = utm || {};
  const now = new Date().toISOString();

  const utmPatch = {
    utm_source: u.utm_source || null,
    utm_medium: u.utm_medium || null,
    utm_campaign: u.utm_campaign || null,
    utm_content: u.utm_content || null,
    utm_term: u.utm_keyword || null, // WF05a's utm object calls it utm_keyword, not utm_term
    landing_page: page_url || null,
    referrer: u.utm_ref || null,
    funnel: u.funnel || null,
    utm_adset: u.utm_adset || null,
    utm_ad: u.utm_ad || null,
    utm_placement: u.utm_placement || null,
  };

  // 1. Customer: search by phone (TRAX's identity key), update if found, create if not.
  const { data: existingCustomers, error: custLookupErr } = await admin
    .from("customers")
    .select("id, notes")
    .eq("business_unit", "TRAX")
    .eq("mobile_phone", phone_e164)
    .is("deleted_at", null)
    .limit(1);
  if (custLookupErr) return jsonResponse({ error: "customer lookup failed", detail: custLookupErr.message }, 502);

  let customerId: string;
  if (existingCustomers && existingCustomers.length) {
    customerId = existingCustomers[0].id;
    const priorNotes = existingCustomers[0].notes as string | null;
    // Update contact/attribution fields only — never touch status on an
    // existing customer, a repeat form submission shouldn't regress
    // someone who's already progressed past "ליד חדש". Notes are appended,
    // not overwritten, so an earlier submission's message isn't lost.
    const { error: updErr } = await admin.from("customers").update({
      first_name: first_name || undefined,
      last_name: last_name || undefined,
      email: email || undefined,
      lead_source: LEAD_SOURCE,
      campaign: u.utm_campaign || undefined,
      execution_url: execution_url || undefined,
      ...(message ? { notes: (priorNotes ? priorNotes + "\n\n" : "") + `[טופס אתר ${now.slice(0, 10)}] ${message}` } : {}),
      ...utmPatch,
    }).eq("id", customerId);
    if (updErr) return jsonResponse({ error: "customer update failed", detail: updErr.message }, 502);
  } else {
    const { data: created, error: createErr } = await admin.from("customers").insert({
      first_name: first_name || "-",
      last_name: last_name || "-",
      mobile_phone: phone_e164,
      email: email || null,
      business_unit: "TRAX",
      lead_source: LEAD_SOURCE,
      campaign: u.utm_campaign || null,
      status: "ליד חדש",
      notes: message || null,
      account_manager_id: DEFAULT_ACCOUNT_MANAGER_ID,
      execution_url: execution_url || null,
      ...utmPatch,
    }).select("id").single();
    if (createErr) return jsonResponse({ error: "customer create failed", detail: createErr.message }, 502);
    customerId = created.id;
  }

  // 2. Sale: search for an OPEN one (anything not won/lost) for this customer, update if found, create if not.
  const { data: existingSales, error: saleLookupErr } = await admin
    .from("sales")
    .select("id, journey_id, stage")
    .eq("business_unit", "TRAX")
    .eq("customer_id", customerId)
    .is("deleted_at", null);
  if (saleLookupErr) return jsonResponse({ error: "sale lookup failed", detail: saleLookupErr.message }, 502);

  const openSale = (existingSales || []).find((s) => !CLOSED_STAGES.includes(s.stage));

  let saleId: string;
  if (openSale) {
    saleId = openSale.id;
    const patch: Record<string, unknown> = {
      lead_source: LEAD_SOURCE,
      campaign: u.utm_campaign || undefined,
      next_call_at: now, // a repeat submission is renewed interest — bump the follow-up to today either way
      execution_url: execution_url || undefined,
      ...utmPatch,
    };
    // Only default a journey if the sale doesn't already have one — never
    // clobber an already-linked journey with the "nearest upcoming" guess.
    if (!openSale.journey_id) {
      const { data: nearest } = await admin
        .from("journeys")
        .select("id")
        .eq("business_unit", "TRAX")
        .gte("departure_date", now.slice(0, 10))
        .is("deleted_at", null)
        .order("departure_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (nearest) patch.journey_id = nearest.id;
    }
    const { error: updErr } = await admin.from("sales").update(patch).eq("id", saleId);
    if (updErr) return jsonResponse({ error: "sale update failed", detail: updErr.message }, 502);
  } else {
    const { data: nearest } = await admin
      .from("journeys")
      .select("id")
      .eq("business_unit", "TRAX")
      .gte("departure_date", now.slice(0, 10))
      .is("deleted_at", null)
      .order("departure_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    const { data: created, error: createErr } = await admin.from("sales").insert({
      customer_id: customerId,
      business_unit: "TRAX",
      channel: CHANNEL,
      lead_source: LEAD_SOURCE,
      campaign: u.utm_campaign || null,
      journey_id: nearest ? nearest.id : null,
      owner_id: DEFAULT_ACCOUNT_MANAGER_ID,
      next_call_at: now, // "same day the lead came in", per spec
      execution_url: execution_url || null,
      ...utmPatch,
    }).select("id").single();
    if (createErr) return jsonResponse({ error: "sale create failed", detail: createErr.message }, 502);
    saleId = created.id;
  }

  return jsonResponse({ success: true, customer_id: customerId, sale_id: saleId }, 200);
});
