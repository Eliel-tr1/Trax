// AI journey import — reads a public journey page from the client's site,
// extracts the journey fields with OpenAI, checks whether the journey
// already exists, and returns a ready-to-fill payload for the UI modal.
//
// POST { url }  →  { fields, exists, existing_id, existing_similar }
// The UI shows the parsed fields live, lets the user edit, then creates
// (or updates) via its normal API path. This function never writes.
import { createClient } from "jsr:@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = "gpt-4o-mini";

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
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error: userErr } = await admin.auth.getUser(jwt);
  if (userErr) return jsonResponse({ error: "invalid session" }, 401);

  const { url } = await req.json().catch(() => ({ url: null }));
  if (!url || typeof url !== "string" || !/^https?:\/\//.test(url)) {
    return jsonResponse({ error: "url is required" }, 400);
  }

  // 1. Fetch the public page HTML
  let html: string;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 TRAX-CRM-import" } });
    if (!res.ok) return jsonResponse({ error: `page fetch failed (${res.status})` }, 502);
    html = await res.text();
  } catch (e) {
    return jsonResponse({ error: "page fetch failed", detail: String(e) }, 502);
  }

  // 2. Strip to readable text (crude: drop scripts/styles/tags)
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 20000);

  // 3. Ask OpenAI to map the page into our journey fields
  const FIELD_CONTRACT = `Return ONLY a JSON object with these keys (null when not found on the page):
{
  "name": string,                // journey display name, e.g. "מונטנגרו, אוקטובר 2026"
  "destination": string,         // destination only, e.g. "מונטנגרו"
  "departure_date": "YYYY-MM-DD",
  "return_date": "YYYY-MM-DD" | null,
  "seats_total": number | null,
  "price_per_person": number | null,
  "currency": "EUR" | "ILS" | "USD",
  "short_description": string | null,
  "itinerary": string | null     // full day-by-day route description if present
}`;
  const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `You extract structured journey/trip data from travel-website pages (Hebrew or English). ${FIELD_CONTRACT}` },
        { role: "user", content: `Page URL: ${url}\n\nPage content:\n${text}` },
      ],
    }),
  });
  if (!aiRes.ok) return jsonResponse({ error: "AI extraction failed", detail: await aiRes.text() }, 502);
  const ai = await aiRes.json();
  let fields: Record<string, unknown>;
  try { fields = JSON.parse(ai.choices[0].message.content) } catch { return jsonResponse({ error: "AI returned unparseable JSON" }, 502) }

  // 4. Does a similar journey already exist? (same destination, ±60 days)
  let exists = false, existing_id: string | null = null;
  const destination = fields.destination as string | undefined;
  if (destination) {
    const { data: found } = await admin.from("journeys")
      .select("id, name, departure_date").eq("destination", destination).is("deleted_at", null);
    if (found?.length) {
      const dep = fields.departure_date as string | undefined;
      const close = dep
        ? found.find(j => Math.abs((new Date(j.departure_date).getTime() - new Date(dep).getTime()) / 86400000) <= 60)
        : null;
      const hit = close || found[0];
      exists = true; existing_id = hit.id;
    }
  }

  return jsonResponse({ fields, exists, existing_id, source_url: url });
});