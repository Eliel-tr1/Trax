// Facebook Lead Ads webhook — receives leadgen events from Meta and feeds
// them into lead-intake using the same payload contract as the site form.
//
// Setup (one-time, by Sahar):
//   1. Meta App → Webhooks → subscribe the page to "leadgen".
//   2. Callback URL: https://bkjqwroclpefwtyxjfkl.supabase.co/functions/v1/facebook-leads
//   3. Set FB_VERIFY_TOKEN secret; enter the same value in the Meta
//      subscription form (GET hub.mode/hub.verify_token/hub.challenge).
//   4. Set FB_PAGE_ACCESS_TOKEN (Graph API field lookup).
// Without FB_PAGE_ACCESS_TOKEN the function still answers 200 (Meta requires
// it) but only logs — leads are processed once the token lands.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const url = new URL(req.url);

  // --- Webhook verification handshake (Meta calls once on subscribe)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("FB_VERIFY_TOKEN");
    if (mode === "subscribe" && expected && token === expected) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain", ...corsHeaders } });
    }
    return new Response("forbidden", { status: 403 });
  }

  // --- Real lead event
  const payload = await req.json().catch(() => null);
  if (payload?.object !== "page" || !Array.isArray(payload.entry)) {
    return new Response(JSON.stringify({ ok: true, ignored: true }), { status: 200 });
  }

  const pageToken = Deno.env.get("FB_PAGE_ACCESS_TOKEN");
  if (!pageToken) {
    console.error("facebook-leads: FB_PAGE_ACCESS_TOKEN not set; lead logged only", JSON.stringify(payload));
    return new Response(JSON.stringify({ ok: true, processed: false }), { status: 200 });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  for (const entry of payload.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;
      const leadgenId = change.value?.leadgen_id;
      const formId = change.value?.form_id;
      if (!leadgenId) continue;

      try {
        // 1. Pull the full lead — field_data is only readable via Graph API
        const lr = await fetch(`https://graph.facebook.com/v21.0/${leadgenId}?access_token=${pageToken}`);
        const lead = await lr.json();
        if (lead.error) { console.error("lead fetch failed", JSON.stringify(lead.error)); continue }

        const field = (name: string) =>
          lead.field_data?.find((f: { name: string }) => f.name === name)?.values?.[0] ?? "";

        // 2. Map into the lead-intake contract (same shape as the site form)
        const res = await fetch(`${SUPABASE_URL}/functions/v1/lead-intake`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${SERVICE}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: field("full_name") || field("name"),
            phone: field("phone_number") || field("phone"),
            email: field("email") || undefined,
            message: `Facebook lead form ${formId ? `(form ${formId})` : ""}`.trim(),
            form_id: formId ? `fb_${formId}` : undefined,
          }),
        });
        if (!res.ok) console.error("lead-intake failed", res.status, await res.text());
      } catch (e) {
        console.error("facebook-leads processing error", e);
      }
    }
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});