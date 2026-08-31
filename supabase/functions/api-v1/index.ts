// Generic object-level API — /api-v1/{object}[/{id}]
// GET (list, filter/sort/limit/offset) · GET/{id} · POST · PATCH/{id} · DELETE/{id}
// Auth: `Authorization: Bearer <api key>` — hashed & role-checked via verify_api_key().
// Field/value validation happens against the allow-list below AND the DB's own
// CHECK constraints (belt and suspenders — never string-concat user input into SQL).
// See docs/decisions/0003-generic-automation-and-api-layer.md for why this
// exists instead of one bespoke function per integration.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Allow-listed objects and their writable fields. Adding an object here is
// the only code change needed for it to become available at every verb —
// per the playbook: "הוספת אובייקט חדש למערכת חייבת להיות זמינה ב-API מיד".
const SCHEMA: Record<string, { table: string; fields: string[] }> = {
  customers: {
    table: "customers",
    fields: [
      "first_name", "last_name", "mobile_phone", "email", "business_unit",
      "lead_source", "campaign", "status", "notes", "lead_rating",
      "club_member", "club_joined_at", "credit_balance",
      "extreme_experience_level", "preferred_language",
      "company", "job_title", "work_email", "owner_id", "account_manager_id", "custom", "execution_url",
      "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "landing_page", "referrer",
      "funnel", "utm_adset", "utm_ad", "utm_placement",
    ],
  },
  sales: {
    table: "sales",
    fields: [
      "customer_id", "business_unit", "stage", "channel", "lead_source",
      "campaign", "owner_id", "loss_reason", "journey_id",
      "participants_count", "expected_value", "currency",
      "qualification_rating", "qualification_summary", "next_call_at",
      "interest_area", "custom", "execution_url",
      "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "landing_page", "referrer",
      "funnel", "utm_adset", "utm_ad", "utm_placement",
    ],
  },
  journeys: {
    table: "journeys",
    fields: [
      "name", "business_unit", "destination", "departure_date",
      "return_date", "seats_total", "min_seats", "status",
      "price_per_person", "currency", "includes_flights",
      "short_description", "page_url", "operations_notes", "custom", "execution_url",
    ],
  },
  registrations: {
    table: "registrations",
    fields: [
      "customer_id", "journey_id", "sale_id", "status", "amount_paid",
      "currency", "last_payment_date", "payment_method", "invoice_number",
      "passport_valid", "travel_insurance", "medical_dietary_notes",
      "emergency_contact", "includes_flight_for_participant", "custom", "execution_url",
    ],
  },
  tasks: {
    table: "tasks",
    fields: [
      "subject", "related_type", "related_id", "assignee_id", "due_at",
      "status", "priority", "description", "business_unit", "execution_url",
    ],
  },
  contacts: {
    table: "contacts",
    fields: ["customer_id", "name", "phone", "email", "role", "execution_url"],
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function logRequest(
  admin: ReturnType<typeof createClient>,
  apiKeyId: string | null,
  path: string,
  method: string,
  statusCode: number,
  startedAt: number,
) {
  await admin.from("api_request_logs").insert({
    api_key_id: apiKeyId,
    path,
    method,
    status_code: statusCode,
    response_time_ms: Date.now() - startedAt,
  });
}

Deno.serve(async (req: Request) => {
  const startedAt = Date.now();
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const url = new URL(req.url);
  // path: /api-v1/{object}/{id?}
  const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  const idx = parts.indexOf("api-v1");
  const objectName = parts[idx + 1];
  const recordId = parts[idx + 2];

  const authHeader = req.headers.get("Authorization") || "";
  const key = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!key) {
    return jsonResponse({ error: "missing API key" }, 401);
  }

  let apiKey: { id: string | null; role: string };
  if (key === SERVICE_ROLE_KEY) {
    // Trusted internal caller (another Edge Function in this project — e.g.
    // lead-intake). Holding the service role key already implies full DB
    // access, so this isn't a privilege escalation, just skips the
    // api_keys lookup for same-project server-to-server calls.
    apiKey = { id: null, role: "internal" };
  } else {
    const { data: keyRows, error: keyErr } = await admin.rpc("verify_api_key", { p_key: key });
    if (keyErr || !keyRows || keyRows.length === 0) {
      return jsonResponse({ error: "invalid or inactive API key" }, 401);
    }
    apiKey = keyRows[0] as { id: string; role: string };
  }

  if (!objectName || !SCHEMA[objectName]) {
    await logRequest(admin, apiKey.id, url.pathname, req.method, 404, startedAt);
    return jsonResponse({ error: `unknown object "${objectName}"` }, 404);
  }
  const def = SCHEMA[objectName];

  try {
    if (req.method === "GET" && !recordId) {
      let query = admin.from(def.table).select("*").is("deleted_at", null);
      for (const [k, v] of url.searchParams.entries()) {
        if (k === "limit" || k === "offset" || k === "sort") continue;
        if (!def.fields.includes(k) && k !== "id") {
          await logRequest(admin, apiKey.id, url.pathname, req.method, 400, startedAt);
          return jsonResponse({ error: `unknown filter field "${k}"` }, 400);
        }
        query = query.eq(k, v);
      }
      const sort = url.searchParams.get("sort");
      if (sort) {
        const desc = sort.startsWith("-");
        query = query.order(desc ? sort.slice(1) : sort, { ascending: !desc });
      }
      const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
      const offset = Number(url.searchParams.get("offset")) || 0;
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      await logRequest(admin, apiKey.id, url.pathname, req.method, 200, startedAt);
      return jsonResponse({ data, count });
    }

    if (req.method === "GET" && recordId) {
      const { data, error } = await admin.from(def.table).select("*").eq("id", recordId).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      if (!data) {
        await logRequest(admin, apiKey.id, url.pathname, req.method, 404, startedAt);
        return jsonResponse({ error: "not found" }, 404);
      }
      await logRequest(admin, apiKey.id, url.pathname, req.method, 200, startedAt);
      return jsonResponse({ data });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") {
        await logRequest(admin, apiKey.id, url.pathname, req.method, 400, startedAt);
        return jsonResponse({ error: "invalid JSON body" }, 400);
      }
      const unknownFields = Object.keys(body).filter((f) => !def.fields.includes(f));
      if (unknownFields.length) {
        await logRequest(admin, apiKey.id, url.pathname, req.method, 400, startedAt);
        return jsonResponse({ error: `unknown field(s): ${unknownFields.join(", ")}` }, 400);
      }
      const { data, error } = await admin.from(def.table).insert(body).select().single();
      if (error) {
        const status = error.code === "23514" ? 422 : error.code === "23505" ? 409 : 400;
        await logRequest(admin, apiKey.id, url.pathname, req.method, status, startedAt);
        return jsonResponse({ error: error.message, code: error.code }, status);
      }
      await logRequest(admin, apiKey.id, url.pathname, req.method, 201, startedAt);
      return jsonResponse({ data }, 201);
    }

    if (req.method === "PATCH" && recordId) {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") {
        await logRequest(admin, apiKey.id, url.pathname, req.method, 400, startedAt);
        return jsonResponse({ error: "invalid JSON body" }, 400);
      }
      const unknownFields = Object.keys(body).filter((f) => !def.fields.includes(f));
      if (unknownFields.length) {
        await logRequest(admin, apiKey.id, url.pathname, req.method, 400, startedAt);
        return jsonResponse({ error: `unknown field(s): ${unknownFields.join(", ")}` }, 400);
      }
      const { data, error } = await admin.from(def.table).update(body).eq("id", recordId).select().maybeSingle();
      if (error) {
        const status = error.code === "23514" ? 422 : error.code === "23505" ? 409 : 400;
        await logRequest(admin, apiKey.id, url.pathname, req.method, status, startedAt);
        return jsonResponse({ error: error.message, code: error.code }, status);
      }
      if (!data) {
        await logRequest(admin, apiKey.id, url.pathname, req.method, 404, startedAt);
        return jsonResponse({ error: "not found" }, 404);
      }
      await logRequest(admin, apiKey.id, url.pathname, req.method, 200, startedAt);
      return jsonResponse({ data });
    }

    if (req.method === "DELETE" && recordId) {
      // soft-delete only — see CLAUDE.md, nothing hard-deletes from these tables.
      const { data, error } = await admin.from(def.table).update({ deleted_at: new Date().toISOString() }).eq("id", recordId).select().maybeSingle();
      if (error) throw error;
      if (!data) {
        await logRequest(admin, apiKey.id, url.pathname, req.method, 404, startedAt);
        return jsonResponse({ error: "not found" }, 404);
      }
      await logRequest(admin, apiKey.id, url.pathname, req.method, 200, startedAt);
      return jsonResponse({ data });
    }

    await logRequest(admin, apiKey.id, url.pathname, req.method, 405, startedAt);
    return jsonResponse({ error: "method not allowed for this path" }, 405);
  } catch (e) {
    await logRequest(admin, apiKey.id, url.pathname, req.method, 500, startedAt);
    // Verbose error stays server-side (in the log), the client gets a generic message.
    console.error(e);
    return jsonResponse({ error: "internal error" }, 500);
  }
});
