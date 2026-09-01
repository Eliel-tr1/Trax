// Max (מקס) — the CRM's floating AI assistant. Read-only Q&A over the TRAX
// data model via OpenAI function/tool-calling. Auth: caller's own Supabase
// JWT (verify_jwt is ON for this function, unlike lead-intake/api-v1 which
// are server-to-server) — so every query naturally runs as the signed-in
// user and RLS on max_sessions/max_messages already scopes chat history to
// them. Data reads use the service role key (like api-v1) but ONLY through
// the fixed tool functions below — never a raw/opaque query built from LLM
// output. This is the load-bearing security boundary: Max can count, list,
// fetch-by-id and aggregate against an allow-listed set of resources and
// fields, and nothing else. No create/update/delete tool exists, full stop.
//
// POST body: { session_id?, message }
//   session_id omitted -> creates a new max_sessions row.
// Response: { session_id, trail: string[], reply: string, suggestion?: string, deep_link?: string }

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("MAX_OPENAI_MODEL") || "gpt-4.1-mini";

// supabase-js's functions.invoke() sends the caller's session as an
// Authorization header, which makes this a cross-origin request the browser
// preflights with an OPTIONS request before the real POST. Without these
// headers (and without answering OPTIONS at all) the browser's CORS check on
// the preflight fails before the POST is ever sent — same fix already
// applied to update-user/invite-user. This was the actual reason Max never
// replied even after OPENAI_API_KEY was set: the request never left the
// browser (confirmed live 2026-09-01 via edge log showing "OPTIONS | 405 |
// .../max-chat" with no matching POST).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Fixed allow-list of resources + filterable fields (docs/domain-model.md).
// Same shape as api-v1's SCHEMA, but read-only and scoped to what an AI
// assistant plausibly needs to filter/aggregate on — not every writable
// field (e.g. free-text notes are readable via get_record, not filterable).
// ---------------------------------------------------------------------------
type ResourceDef = { table: string; filterFields: string[]; listFields: string[] };

const RESOURCES: Record<string, ResourceDef> = {
  customers: {
    table: "customers",
    filterFields: [
      "business_unit", "lead_source", "campaign", "status", "lead_rating",
      "club_member", "extreme_experience_level", "preferred_language", "owner_id",
    ],
    listFields: [
      "id", "first_name", "last_name", "mobile_phone", "email", "business_unit",
      "lead_source", "campaign", "status", "lead_rating", "club_member",
      "created_at",
    ],
  },
  sales: {
    table: "sales",
    filterFields: [
      "business_unit", "stage", "channel", "lead_source", "campaign",
      "owner_id", "loss_reason", "journey_id", "currency", "qualification_rating",
      "customer_id",
    ],
    listFields: [
      "id", "deal_name", "customer_id", "business_unit", "stage", "channel",
      "lead_source", "campaign", "owner_id", "loss_reason", "journey_id",
      "expected_value", "currency", "qualification_rating", "next_call_at",
      "created_at",
    ],
  },
  journeys: {
    table: "journeys",
    filterFields: ["business_unit", "destination", "status", "currency", "includes_flights"],
    listFields: [
      "id", "name", "business_unit", "destination", "departure_date",
      "return_date", "seats_total", "min_seats", "seats_sold", "seats_available",
      "status", "price_per_person", "currency",
    ],
  },
  registrations: {
    table: "registrations",
    filterFields: [
      "customer_id", "journey_id", "sale_id", "status", "currency",
      "payment_method", "passport_valid", "travel_insurance",
    ],
    listFields: [
      "id", "registration_name", "customer_id", "journey_id", "sale_id",
      "status", "amount_paid", "currency", "last_payment_date",
      "payment_method", "registered_at",
    ],
  },
  tasks: {
    table: "tasks",
    filterFields: ["related_type", "related_id", "assignee_id", "status", "priority", "business_unit"],
    listFields: [
      "id", "subject", "related_type", "related_id", "assignee_id", "due_at",
      "status", "priority", "business_unit", "created_at",
    ],
  },
  meetings: {
    table: "meetings",
    filterFields: ["related_type", "related_id", "type", "business_unit"],
    listFields: [
      "id", "subject", "related_type", "related_id", "start_at",
      "duration_minutes", "type", "summary", "business_unit",
    ],
  },
  phone_calls: {
    table: "phone_calls",
    filterFields: ["related_id", "direction", "result", "business_unit", "assigned_user_id"],
    listFields: [
      "id", "related_id", "direction", "occurred_at", "duration_seconds",
      "result", "summary", "business_unit",
    ],
  },
};

const RESOURCE_NAMES = Object.keys(RESOURCES);
// Fields any tool call may aggregate/group by — filterFields plus a couple of
// obviously-safe extras (status-like columns are already in filterFields).
function aggregatableFields(resource: string): string[] {
  return RESOURCES[resource].filterFields;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

// ---------------------------------------------------------------------------
// Tool implementations — plain Supabase queries via the service role client,
// built entirely from validated enum-like values (resource/field names
// checked against the allow-lists above, everything else passed as a bound
// filter value, never interpolated into SQL text). No raw SQL anywhere.
// ---------------------------------------------------------------------------
function validateResource(resource: string): ResourceDef {
  if (!RESOURCE_NAMES.includes(resource)) {
    throw new Error(`unknown resource "${resource}". Allowed: ${RESOURCE_NAMES.join(", ")}`);
  }
  return RESOURCES[resource];
}

function applyFilters(query: any, def: ResourceDef, filters: Record<string, unknown> | undefined) {
  if (!filters) return query;
  for (const [k, v] of Object.entries(filters)) {
    if (!def.filterFields.includes(k)) {
      throw new Error(`field "${k}" is not filterable on this resource. Allowed: ${def.filterFields.join(", ")}`);
    }
    if (v === null) query = query.is(k, null);
    else query = query.eq(k, v as any);
  }
  return query;
}

async function toolCountRecords(admin: ReturnType<typeof createClient>, args: any) {
  const def = validateResource(args.resource);
  let q = admin.from(def.table).select("*", { count: "exact", head: true }).is("deleted_at", null);
  q = applyFilters(q, def, args.filters);
  const { count, error } = await q;
  if (error) throw error;
  return { count };
}

async function toolListRecords(admin: ReturnType<typeof createClient>, args: any) {
  const def = validateResource(args.resource);
  const limit = Math.min(Number(args.limit) || 10, 25);
  let q = admin.from(def.table).select(def.listFields.join(",")).is("deleted_at", null);
  q = applyFilters(q, def, args.filters);
  q = q.order("created_at", { ascending: false }).limit(limit);
  const { data, error } = await q;
  if (error) throw error;
  return { records: data };
}

async function toolGetRecord(admin: ReturnType<typeof createClient>, args: any) {
  const def = validateResource(args.resource);
  if (!args.id || typeof args.id !== "string") throw new Error("id is required");
  const { data, error } = await admin
    .from(def.table)
    .select(def.listFields.join(","))
    .eq("id", args.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return { record: data };
}

async function toolAggregateByField(admin: ReturnType<typeof createClient>, args: any) {
  const def = validateResource(args.resource);
  const field = args.field;
  const allowed = aggregatableFields(args.resource);
  if (!allowed.includes(field)) {
    throw new Error(`field "${field}" is not aggregatable on this resource. Allowed: ${allowed.join(", ")}`);
  }
  let q = admin.from(def.table).select(field).is("deleted_at", null);
  q = applyFilters(q, def, args.filters);
  const { data, error } = await q;
  if (error) throw error;
  const buckets: Record<string, number> = {};
  for (const row of (data || []) as Record<string, unknown>[]) {
    const key = row[field] === null || row[field] === undefined ? "(ריק)" : String(row[field]);
    buckets[key] = (buckets[key] || 0) + 1;
  }
  return { buckets };
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "count_records",
      description: "Count records of a resource matching filters. Use for 'how many X' questions.",
      parameters: {
        type: "object",
        properties: {
          resource: { type: "string", enum: RESOURCE_NAMES },
          filters: { type: "object", description: "field -> exact value, only allow-listed filter fields for the resource" },
        },
        required: ["resource"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_records",
      description: "List up to 25 records of a resource matching filters, newest first.",
      parameters: {
        type: "object",
        properties: {
          resource: { type: "string", enum: RESOURCE_NAMES },
          filters: { type: "object" },
          limit: { type: "integer", description: "max 25" },
        },
        required: ["resource"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_record",
      description: "Fetch a single record of a resource by its id (uuid).",
      parameters: {
        type: "object",
        properties: {
          resource: { type: "string", enum: RESOURCE_NAMES },
          id: { type: "string" },
        },
        required: ["resource", "id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "aggregate_by_field",
      description: "Group-and-count records of a resource by one field. Use for breakdowns like 'leads by source'.",
      parameters: {
        type: "object",
        properties: {
          resource: { type: "string", enum: RESOURCE_NAMES },
          field: { type: "string", description: "field to group by, must be one of that resource's filterable fields" },
          filters: { type: "object" },
        },
        required: ["resource", "field"],
      },
    },
  },
];

async function runTool(admin: ReturnType<typeof createClient>, name: string, args: any) {
  switch (name) {
    case "count_records": return toolCountRecords(admin, args);
    case "list_records": return toolListRecords(admin, args);
    case "get_record": return toolGetRecord(admin, args);
    case "aggregate_by_field": return toolAggregateByField(admin, args);
    default: throw new Error(`unknown tool "${name}"`);
  }
}

// ---------------------------------------------------------------------------
// Max's persona + system prompt
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `אתה "מקס" — עוזר AI תוך-מערכתי ב-CRM של TRAX Adventure Club.
טיפוס בטוח בעצמו, טעים אקסטרים (צניחה, צלילה, טיפוס, ג'יפים, רפטינג) ומדי פעם
(לא בכל משפט) שולף מונח מהעולם הזה בתשובה — אבל אף פעם לא על חשבון בהירות.

חוקים:
- תשובות קצרות וממוקדות. בלי פטפוט, בלי הקדמות מיותרות.
- אתה קורא בלבד (read-only). אין לך שום יכולת ליצור, לעדכן או למחוק כלום —
  אם מבקשים ממך לשנות נתון, תסביר בקצרה שזה לא בסמכותך ותציע איפה לעשות
  את זה במערכת.
- כל תשובה על נתונים חייבת להתבסס אך ורק על תוצאות ה-tools שקיבלת — אף פעם
  אל תמציא מספרים.
- ענה תמיד בעברית.
- כשרלוונטי, סיים בהצעת המשך קצרה (שאלה טבעית הבאה) — לא חובה בכל תשובה.`;

async function callOpenAI(messages: any[]) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.4,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI error ${res.status}: ${text}`);
  }
  return res.json();
}

// Human-readable trail line for a tool call, shown to the user as a
// transient "thinking" line while Max works (per spec: "בודק את יישות
// לידים… סופר… מנסח תשובה…").
const RESOURCE_LABEL: Record<string, string> = {
  customers: "לקוחות", sales: "מכירות", journeys: "מסעות",
  registrations: "הרשמות", tasks: "משימות", meetings: "פגישות", phone_calls: "שיחות טלפון",
};
function trailLineFor(toolName: string, args: any): string {
  const label = RESOURCE_LABEL[args?.resource] || args?.resource || "הנתונים";
  if (toolName === "count_records") return `סופר ${label}…`;
  if (toolName === "list_records") return `מביא רשימת ${label}…`;
  if (toolName === "get_record") return `שולף רשומת ${label}…`;
  if (toolName === "aggregate_by_field") return `מפלח ${label} לפי ${args?.field || "שדה"}…`;
  return `בודק את יישות ${label}…`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return jsonResponse({ error: "missing auth" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return jsonResponse({ error: "invalid session" }, 401);
  const userId = userData.user.id;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.message !== "string" || !body.message.trim()) {
    return jsonResponse({ error: "message is required" }, 400);
  }

  let sessionId: string = body.session_id;
  if (!sessionId) {
    const title = body.message.trim().slice(0, 60);
    const { data: session, error: sessionErr } = await admin
      .from("max_sessions")
      .insert({ user_id: userId, title })
      .select("id")
      .single();
    if (sessionErr) return jsonResponse({ error: "failed to create session", detail: sessionErr.message }, 500);
    sessionId = session.id;
  } else {
    const { data: session, error: sessionErr } = await admin
      .from("max_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (sessionErr || !session) return jsonResponse({ error: "session not found" }, 404);
  }

  await admin.from("max_messages").insert({ session_id: sessionId, role: "user", content: body.message });

  if (!OPENAI_API_KEY) {
    // Secret not provisioned yet — everything else (session mgmt, tools,
    // frontend) is ready; the model call itself can't run. See report.
    return jsonResponse({
      session_id: sessionId,
      trail: ["בודק חיבור למודל…"],
      reply: "עוד לא מחובר למוח שלי (OPENAI_API_KEY לא הוגדר בשרת). תבקש מהצוות הטכני להשלים את זה ואני מוכן.",
      error: "OPENAI_API_KEY not configured",
    }, 200);
  }

  try {
    // Pull recent history for context (last 12 messages of this session).
    const { data: history } = await admin
      .from("max_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(24);

    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(history || []).map((m: any) => ({ role: m.role, content: m.content })),
    ];

    const trail: string[] = [];
    let finalReply = "";
    const MAX_ROUNDS = 5;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const completion = await callOpenAI(messages);
      const choice = completion.choices?.[0];
      const msg = choice?.message;
      if (!msg) throw new Error("no response from model");

      if (msg.tool_calls?.length) {
        messages.push(msg);
        for (const call of msg.tool_calls) {
          let args: any = {};
          try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* leave {} */ }
          trail.push(trailLineFor(call.function.name, args));
          let result;
          try {
            result = await runTool(admin, call.function.name, args);
          } catch (e) {
            result = { error: (e as Error).message };
          }
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        }
        continue; // let the model see tool results and respond/keep calling
      }

      finalReply = msg.content || "";
      break;
    }

    trail.push("מנסח תשובה…");

    if (!finalReply) finalReply = "לא הצלחתי לגבש תשובה מהנתונים הזמינים — נסה לנסח אחרת.";

    await admin.from("max_messages").insert({
      session_id: sessionId, role: "assistant", content: finalReply, trail,
    });
    await admin.from("max_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sessionId);

    return jsonResponse({ session_id: sessionId, trail, reply: finalReply });
  } catch (e) {
    console.error(e);
    const errMsg = "תקלה בדרך למוח שלי, נסה שוב עוד רגע.";
    await admin.from("max_messages").insert({
      session_id: sessionId, role: "assistant", content: errMsg, trail: [],
    });
    return jsonResponse({ session_id: sessionId, trail: [], reply: errMsg, error: (e as Error).message }, 200);
  }
});
