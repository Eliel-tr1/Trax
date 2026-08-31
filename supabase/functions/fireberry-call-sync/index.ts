// Pulls Voicenter call records that Fireberry already holds (calllog,
// objecttype 100 — recording, transcript, AI summary already attached by
// the existing Voicenter→Fireberry integration) and mirrors them into this
// CRM's `phone_calls` table, matched to a `customers` row by phone and
// best-effort assigned to an `app_users` row by rep name.
//
// See docs/decisions/0005-voicenter-fireberry-call-ingestion.md for the
// full design, the Fireberry field mapping, and why several pieces of this
// (transcript field name, ownername reliability) are documented as
// unverified gaps rather than assumed.
//
// ⚠️ UNTESTED against live TRAX Fireberry data — see that decision doc.
// FIREBERRY_TRAX_TOKEN is not present anywhere in this machine's
// credentials as of this writing (only FIREBERRY_AMORPHICURE_TOKEN exists,
// for a different client's tenant — never substitute it here). Until a
// human supplies TRAX's own tokenid, this function only supports
// ?mode=dry_run.
//
// Invocation: designed to be called by an N8N scheduled workflow (per
// docs/domain-model.md's "what stays in the CRM vs goes to N8N" — voice
// webhooks/integrations are N8N's job, calling into this Edge Function),
// the same pattern lead-intake already uses. A plain POST with no body.
//
// Query params:
//   ?mode=dry_run   — always available; never calls Fireberry or writes
//                      anything, just reports what it would do
//   ?business_unit=TRAX  — defaults to TRAX (this integration is TRAX-only;
//                      Xcon has no telephony data source configured)

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Vitrue's own Fireberry API reference (fireberry.md) documents two base
// URLs — data/query calls always go to api.powerlink.co.il, never
// api.fireberry.com (that's metadata-only).
const FIREBERRY_QUERY_URL = Deno.env.get("FIREBERRY_QUERY_URL") || "https://api.powerlink.co.il/api/query";
const FIREBERRY_TRAX_TOKEN = Deno.env.get("FIREBERRY_TRAX_TOKEN"); // intentionally may be undefined

const CALLLOG_OBJECT_TYPE = "100";
const CURSOR_KEY = "fireberry_call_sync_cursor";
const PAGE_SIZE = 500;

// TRAX's own Voicenter line(s)/extensions, so the sync can tell which side
// of callerid/targetid is "us" vs. "the customer". Not documented anywhere
// yet (no TRAX Voicenter config was available to read) — left env-driven
// and defensive: if unset, the sync falls back to "whichever number
// matches an existing customer" and logs when neither side matches.
const OWN_NUMBERS = (Deno.env.get("TRAX_VOICENTER_NUMBERS") || "")
  .split(",").map(s => s.trim()).filter(Boolean);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function normalizePhone(raw: string): string {
  const digits = String(raw || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return "+972" + digits.slice(1);
  return digits;
}

function normalizeName(raw: string): string {
  return String(raw || "").trim().replace(/\s+/g, " ").toLowerCase();
}

interface FireberryCallLog {
  calllogid: string;
  status?: string | number;
  type?: string | number;
  ownerid?: string;
  ownername?: string;
  owneridname?: string;
  callerid?: string;
  targetid?: string;
  duration?: number;
  recordurl?: string;
  pcfdownloadurl?: string;
  pcfDriveLink?: string;
  pcftranscriptAI?: string;
  pcfAIDesc?: string;
  voicentertranscript?: string;
  pcfcallsummary?: string;
  pcfConversationAnalyse?: string;
  pcfsystemfield100?: string;
  createdon?: string;
  [key: string]: unknown;
}

async function fireberryQuery(cursor: string): Promise<FireberryCallLog[]> {
  const results: FireberryCallLog[] = [];
  let page = 1;
  for (;;) {
    const res = await fetch(FIREBERRY_QUERY_URL, {
      method: "POST",
      headers: { tokenid: FIREBERRY_TRAX_TOKEN!, "Content-Type": "application/json" },
      body: JSON.stringify({
        objecttype: CALLLOG_OBJECT_TYPE,
        query: `(createdon > '${cursor}')`,
        fields: "*",
        page_size: PAGE_SIZE,
        page_number: page,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Fireberry query failed: ${res.status} ${text}`);
    }
    const json = await res.json();
    const data = json?.data?.Data;
    if (!Array.isArray(data)) {
      throw new Error(`Fireberry response shape mismatch — expected data.Data array, got: ${JSON.stringify(json).slice(0, 500)}`);
    }
    results.push(...data);
    if (json.data.IsLastPage !== false || data.length === 0) break;
    page += 1;
  }
  return results;
}

function pickTranscript(call: FireberryCallLog): string | null {
  // Documented as a gap in the decision doc — Fireberry has accreted
  // several transcript-shaped fields over time. Prefer the AI-processed
  // one, fall back to the raw Voicenter one.
  return call.pcftranscriptAI || call.pcfAIDesc || call.voicentertranscript || null;
}

function pickSummary(call: FireberryCallLog): string | null {
  return call.pcfcallsummary || call.pcfConversationAnalyse || null;
}

function pickRecordingUrl(call: FireberryCallLog): string | null {
  return call.recordurl || call.pcfdownloadurl || call.pcfDriveLink || null;
}

function pickOwnerName(call: FireberryCallLog): string | null {
  // fireberry.md documents an Activity-object-specific exception where the
  // rep name lands in `ownername` instead of `owneridname`. Unverified for
  // calllog specifically, so check both rather than assume.
  return call.ownername || call.owneridname || null;
}

function pickCustomerPhone(call: FireberryCallLog): { phone: string; direction: "נכנסת" | "יוצאת" } | null {
  const caller = call.callerid ? normalizePhone(call.callerid) : null;
  const target = call.targetid ? normalizePhone(call.targetid) : null;
  if (!caller && !target) return null;

  const callerIsOwn = caller && OWN_NUMBERS.some(n => normalizePhone(n) === caller);
  const targetIsOwn = target && OWN_NUMBERS.some(n => normalizePhone(n) === target);

  if (callerIsOwn && target) return { phone: target, direction: "יוצאת" };
  if (targetIsOwn && caller) return { phone: caller, direction: "נכנסת" };

  // OWN_NUMBERS not configured (or neither side matched it) — fall back to
  // "the number that isn't the shortest/extension-looking one", but this
  // is a heuristic, not a guarantee. Prefer target as the customer number
  // for an unknown direction, since inbound-to-a-CRM is the common case;
  // direction is left best-guess and callers should treat it as advisory
  // when OWN_NUMBERS isn't set.
  if (target) return { phone: target, direction: "נכנסת" };
  if (caller) return { phone: caller, direction: "יוצאת" };
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("mode") === "dry_run" || !FIREBERRY_TRAX_TOKEN;
  const businessUnit = url.searchParams.get("business_unit") || "TRAX";

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: cursorRow } = await admin
    .from("system_settings")
    .select("value")
    .eq("key", CURSOR_KEY)
    .maybeSingle();
  const cursor = cursorRow?.value || "2020-01-01";

  if (dryRun) {
    return jsonResponse({
      dry_run: true,
      reason: FIREBERRY_TRAX_TOKEN
        ? "mode=dry_run requested"
        : "FIREBERRY_TRAX_TOKEN is not set — no TRAX Fireberry credential exists yet (only FIREBERRY_AMORPHICURE_TOKEN, a different client's tenant, is present anywhere on this machine). See docs/decisions/0005-voicenter-fireberry-call-ingestion.md.",
      would_query: {
        url: FIREBERRY_QUERY_URL,
        objecttype: CALLLOG_OBJECT_TYPE,
        query: `(createdon > '${cursor}')`,
        page_size: PAGE_SIZE,
      },
      cursor_key: CURSOR_KEY,
      current_cursor: cursor,
      business_unit: businessUnit,
    }, 200);
  }

  let calls: FireberryCallLog[];
  try {
    calls = await fireberryQuery(cursor);
  } catch (err) {
    console.error("fireberry-call-sync: query failed", err);
    return jsonResponse({ error: "Fireberry query failed", detail: String(err) }, 502);
  }

  const summary = { total: calls.length, inserted: 0, updated: 0, unmatched_customer: 0, unmatched_user: 0, errors: [] as string[] };
  let maxCreatedOn = cursor;

  // Load customers/users once per run rather than per-call.
  const { data: customers } = await admin
    .from("customers")
    .select("id, mobile_phone")
    .eq("business_unit", businessUnit)
    .not("mobile_phone", "is", null);
  const { data: users } = await admin.from("app_users").select("id, full_name");

  const customerByPhone = new Map((customers || []).map(c => [normalizePhone(c.mobile_phone), c.id]));
  const userByName = new Map((users || []).map(u => [normalizeName(u.full_name), u.id]));

  for (const call of calls) {
    if (!call.calllogid) {
      summary.errors.push("skipped a record with no calllogid");
      continue;
    }
    if (call.createdon && call.createdon > maxCreatedOn) maxCreatedOn = call.createdon;

    const matched = pickCustomerPhone(call);
    const customerId = matched ? customerByPhone.get(matched.phone) : undefined;
    if (!customerId) {
      summary.unmatched_customer += 1;
      console.warn(`fireberry-call-sync: no customer match for calllogid=${call.calllogid}, phone=${matched?.phone ?? "none"}`);
      continue; // related_id is NOT NULL on phone_calls — cannot insert without a match
    }

    const ownerName = pickOwnerName(call);
    const assignedUserId = ownerName ? userByName.get(normalizeName(ownerName)) : undefined;
    if (ownerName && !assignedUserId) summary.unmatched_user += 1;

    const row = {
      related_type: "customer",
      related_id: customerId,
      direction: matched!.direction,
      occurred_at: call.pcfsystemfield100 || call.createdon || new Date().toISOString(),
      duration_seconds: typeof call.duration === "number" ? call.duration : null,
      recording_url: pickRecordingUrl(call),
      transcript: pickTranscript(call),
      summary: pickSummary(call),
      business_unit: businessUnit,
      external_call_id: call.calllogid,
      assigned_user_id: assignedUserId ?? null,
    };

    const { data: existing } = await admin
      .from("phone_calls")
      .select("id")
      .eq("external_call_id", call.calllogid)
      .maybeSingle();

    if (existing) {
      const { error } = await admin.from("phone_calls").update(row).eq("id", existing.id);
      if (error) summary.errors.push(`update ${call.calllogid}: ${error.message}`);
      else summary.updated += 1;
    } else {
      const { error } = await admin.from("phone_calls").insert(row);
      if (error) summary.errors.push(`insert ${call.calllogid}: ${error.message}`);
      else summary.inserted += 1;
    }
  }

  await admin.from("system_settings").upsert({ key: CURSOR_KEY, value: maxCreatedOn });

  return jsonResponse({ dry_run: false, ...summary, cursor_advanced_to: maxCreatedOn }, 200);
});
