// deno-lint-ignore-file
// Journeys sync — pulls the live journeys from trax-club.com into the CRM.
// Triggered by pg_cron nightly (see data/030) or manually via a POST.
//
// Source of truth: the site is a Lovable-built SPA; its journey data lives
// in a Supabase project of the client's own (site DB). This function reads
// it with the SITE's anon key (safe: the site already exposes journeys
// publicly to every visitor) and upserts by destination+departure_date.
//
// Secrets required (Supabase Dashboard → Edge Functions → Secrets):
//   SITE_DB_URL       — e.g. https://<site-project>.supabase.co
//   SITE_DB_ANON_KEY  — the site project's publishable/anon key
// When absent the function dry-runs (returns what it WOULD sync) without
// writing — same guard pattern as fireberry-call-sync.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE_DB_URL = Deno.env.get("SITE_DB_URL");
const SITE_DB_ANON_KEY = Deno.env.get("SITE_DB_ANON_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (!SITE_DB_URL || !SITE_DB_ANON_KEY) {
    return jsonResponse({ ok: false, dry_run: true, message: "SITE_DB_URL / SITE_DB_ANON_KEY not configured — nothing written" });
  }

  const site = createClient(SITE_DB_URL, SITE_DB_ANON_KEY);

  // Read journeys from the site DB. The site's schema mirrors what the
  // public page renders; adapt table/column names if the site team renames.
  const { data: siteJourneys, error } = await site
    .from("journeys")
    .select("*")
    .eq("published", true)
    .order("departure_date");
  if (error) return jsonResponse({ ok: false, error: "site read failed", detail: error.message }, 502);

  let created = 0, updated = 0, skipped = 0;
  for (const j of siteJourneys || []) {
    const destination = j.destination_name || j.destination;
    if (!destination || !j.departure_date) { skipped++; continue }

    // Upsert key: destination + departure_date (a re-published date = update,
    // a new date for the same destination = a new departure).
    const { data: existing } = await admin.from("journeys")
      .select("id").eq("business_unit", "TRAX")
      .eq("destination", destination)
      .eq("departure_date", j.departure_date)
      .maybeSingle();

    const row = {
      business_unit: "TRAX",
      name: j.title || `${destination}`,
      destination,
      departure_date: j.departure_date,
      return_date: j.return_date || null,
      seats_total: j.capacity || 22,
      status: j.departure_date >= new Date().toISOString().slice(0, 10) ? "פתוח להרשמה" : "יצא לדרך",
      price_per_person: j.price ?? null,
      currency: j.currency || "EUR",
      short_description: j.description || null,
      page_url: `https://trax-club.com/${j.slug || ""}`,
    };

    if (existing) {
      const { error: updErr } = await admin.from("journeys").update(row).eq("id", existing.id);
      if (!updErr) updated++; else skipped++;
    } else {
      const { error: insErr } = await admin.from("journeys").insert({ ...row, min_seats: 18 });
      if (!insErr) created++; else skipped++;
    }
  }

  return jsonResponse({ ok: true, source_count: siteJourneys?.length ?? 0, created, updated, skipped });
});