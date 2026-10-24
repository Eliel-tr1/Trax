// cloudchat-bridge: the CRM side of the WhatsApp AI agent (Max on CloudChat).
// See docs/decisions/0010-cloudchat-whatsapp-agent.md.
//
// One function, three actions (POST JSON {action, ...}):
//   chat  {customer_id | sale_id}   read-only conversation for the CRM panel.
//         Auth: the signed-in user's Supabase JWT. The record is read with the
//         caller's own RLS, so a user only sees chats of records he can see.
//   send  {sale_id}                 send the opening WhatsApp template for a new
//         sale. Called by n8n ("TRAX - WhatsApp ליד חדש") about a minute after the
//         CRM 'sale.created' webhook. Auth: header x-bridge-secret.
//   sync  {}                        reply / error / no-reply follow-up, run by the
//         n8n schedule every 5 minutes. Auth: header x-bridge-secret.
//
// The CloudChat workspace key (TRAX_CLOUDCHAT_API_KEY) never leaves this
// function. verify_jwt is OFF so n8n can call send/sync with the bridge
// secret; chat verifies the user JWT itself.

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CC_BASE = Deno.env.get("TRAX_CLOUDCHAT_BASE") || "https://console.thecloud.chat/api";
const CC_KEY = Deno.env.get("TRAX_CLOUDCHAT_API_KEY") || "";
const BRIDGE_SECRET = Deno.env.get("CLOUDCHAT_BRIDGE_SECRET") || "";
const CHAT_URL = (ns: string) => `https://console.thecloud.chat/inbox/${ns}`;

const STATUS_SENT = "נשלחה הודעה";
const STATUS_REPLIED = "ענה לסוכן";
const STATUS_FAILED = "השליחה נכשלה";
const STAGE_NEW = "ליד חדש";
const STAGE_AI = "נוצר קשר על ידי AI";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bridge-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Meta error codes as CloudChat logs them (same table as the org skill
// cloudchat-delivery-status).
const META_ERR_HE: Record<string, string> = {
  "131042": "תשלום לא מוסדר בחשבון המטא",
  "131026": "לא נמסרה (מספר לא בוואטסאפ, חסום או גרסה ישנה)",
  "131047": "עבר חלון 24 השעות",
  "131049": "מטא חסמה הודעת שיווק לנמען",
  "131048": "מגבלת ספאם",
  "131050": "הנמען ביקש לא לקבל שיווק",
  "131056": "יותר מדי הודעות לאותו נמען",
  "132000": "מספר הפרמטרים לא תואם לתבנית",
  "132001": "תבנית לא קיימת או לא מאושרת",
  "132015": "תבנית מושהית",
  "132016": "תבנית מושבתת",
  "130472": "הנמען בניסוי של מטא (לא נשלח)",
  "131000": "שגיאה כללית אצל מטא",
};
const PENDING_SEC = 120;
const FAIL_WINDOW_SEC = 900;
const OPT_OUT = /^(הסר|הסרה|הסירו|הסר אותי|הסירו אותי|תסיר|תסירו|תסירו אותי|תפסיק|תפסיקו|די|stop|unsubscribe)( בבקשה| תודה)?[\s.!]*$/i;

// ------------------------------------------------------------------ CloudChat
async function cc(method: string, path: string, body?: unknown) {
  const res = await fetch(CC_BASE + path, {
    method,
    headers: { Authorization: `Bearer ${CC_KEY}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
  return { ok: res.ok, status: res.status, data };
}

type Msg = { id: number; type: string; msg_type: string; ts: number; text: string; username?: string; agent_id?: number };

function msgText(m: any): string {
  const p = m?.payload;
  if (p && typeof p === "object") {
    if (typeof p.text === "string" && p.text) return p.text;
    if (typeof p.caption === "string" && p.caption) return p.caption;
  }
  if (typeof m?.content === "string") return m.content;
  return "";
}

async function chatMessages(userNs: string, limit = 100): Promise<Msg[]> {
  const r = await cc("GET", `/subscriber/chat-messages?user_ns=${encodeURIComponent(userNs)}&include_bot=1&include_note=1&include_system=1&limit=${limit}`);
  if (!r.ok) throw new Error(`CloudChat chat-messages HTTP ${r.status}`);
  const rows: any[] = Array.isArray(r.data?.data) ? r.data.data : [];
  return rows
    .map((m) => ({ id: m.id, type: m.type, msg_type: m.msg_type, ts: Number(m.ts) || 0, text: msgText(m), username: m.username, agent_id: m.agent_id }))
    .sort((a, b) => a.ts - b.ts || a.id - b.id);
}

function errInfo(m: Msg) {
  const code = /"?code"?\s*:\s*(\d+)/.exec(m.text)?.[1] || null;
  const title = /"?title"?\s*:\s*"([^"]+)/.exec(m.text)?.[1] || m.text.slice(0, 160);
  return { code, text: [code ? META_ERR_HE[code] : null, title].filter(Boolean).join(": ") || "שגיאת שליחה" };
}

function digits(phone: string | null | undefined): string {
  let d = (phone || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "972" + d.slice(1);
  return d;
}

// ------------------------------------------------------------------ settings
async function settings(admin: SupabaseClient) {
  const { data } = await admin.from("system_settings").select("key, value").like("key", "whatsapp_%");
  const s: Record<string, string> = {};
  for (const r of data || []) s[r.key] = r.value ?? "";
  let params: Record<string, string> = {};
  try { params = JSON.parse(s.whatsapp_lead_template_params || "{}") || {}; } catch { params = {}; }
  return {
    templateName: (s.whatsapp_lead_template_name || "").trim(),
    templateLang: (s.whatsapp_lead_template_lang || "he").trim(),
    templateParams: params,
    testMode: (s.whatsapp_test_mode || "true").trim() !== "false",
    testPhones: (s.whatsapp_test_phones || "").split(/[,\s]+/).map(digits).filter(Boolean),
    dedupeDays: Number(s.whatsapp_dedupe_days || 7) || 7,
    noReplyHours: Number(s.whatsapp_noreply_hours || 24) || 24,
  };
}

async function resolveTemplate(name: string, lang: string) {
  const r = await cc("POST", `/whatsapp-template/list?limit=100&name=${encodeURIComponent(name)}`);
  if (!r.ok) return { error: `CloudChat template list HTTP ${r.status}` };
  const list: any[] = Array.isArray(r.data?.data) ? r.data.data : [];
  const matches = list.filter((t) => (t.name || "") === name);
  const t = matches.find((x) => (x.language || x.lang) === lang) || matches[0];
  if (!t) return { error: `התבנית "${name}" לא נמצאה בחשבון הוואטסאפ` };
  const status = String(t.status || "").toUpperCase();
  if (status && status !== "APPROVED") return { error: `התבנית "${name}" במצב ${status}, עדיין לא מאושרת` };
  // Body variable count, from whichever shape CloudChat returns.
  const comps = typeof t.components === "string" ? safeJson(t.components) : t.components;
  const bodyText = String((Array.isArray(comps) ? comps.find((c: any) => String(c.type).toUpperCase() === "BODY")?.text : null) || t.body || t.content || "");
  const vars = new Set((bodyText.match(/\{\{\d+\}\}/g) || [])).size;
  return { namespace: t.namespace || t.name_space || "", name: t.name, lang: t.language || t.lang || lang, vars };
}
const safeJson = (s: string) => { try { return JSON.parse(s); } catch { return null; } };

function fill(tpl: string, ctx: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => ctx[k] ?? "");
}

async function note(admin: SupabaseClient, relatedType: string, relatedId: string, content: string) {
  await admin.from("notes").insert({ related_type: relatedType, related_id: relatedId, content });
}

// ------------------------------------------------------------------ send
async function send(admin: SupabaseClient, saleId: string) {
  const { data: sale } = await admin.from("sales").select("*").eq("id", saleId).maybeSingle();
  if (!sale) return { result: "skipped", reason: "sale_not_found" };
  const { data: cust } = await admin.from("customers").select("*").eq("id", sale.customer_id).maybeSingle();
  if (!cust) return { result: "skipped", reason: "customer_not_found" };
  const cfg = await settings(admin);
  const phone = digits(cust.mobile_phone);

  if (sale.deleted_at || cust.deleted_at) return { result: "skipped", reason: "deleted" };
  // The agent and the WhatsApp number are TRAX's; Xcon leads never get it.
  if (sale.business_unit !== "TRAX") return { result: "skipped", reason: "not_trax" };
  if (!sale.send_lead_whatsapp) return { result: "skipped", reason: "disabled_on_sale" };
  if (cust.whatsapp_opt_out) return { result: "skipped", reason: "opt_out" };
  if (sale.ai_chat_status === STATUS_SENT || sale.ai_chat_status === STATUS_REPLIED) return { result: "skipped", reason: "already_sent" };
  if (phone.length < 11 || phone.includes("*")) return { result: "skipped", reason: "no_valid_phone" };
  if (cfg.testMode && !cfg.testPhones.includes(phone)) return { result: "skipped", reason: "test_mode" };

  const since = new Date(Date.now() - cfg.dedupeDays * 86400_000).toISOString();
  const { data: recent } = await admin.from("sales").select("id")
    .eq("customer_id", cust.id).neq("id", sale.id).gte("ai_message_sent_at", since).limit(1);
  if (recent && recent.length) return { result: "skipped", reason: "dedupe", other_sale_id: recent[0].id };

  const fail = async (msg: string) => {
    await admin.from("sales").update({ ai_chat_status: STATUS_FAILED, ai_send_error: msg.slice(0, 500) }).eq("id", sale.id);
    return { result: "failed", error: msg };
  };

  if (!cfg.templateName) return await fail("לא הוגדרה תבנית וואטסאפ (הגדרות > וואטסאפ וסוכן AI)");
  const tpl: any = await resolveTemplate(cfg.templateName, cfg.templateLang);
  if (tpl.error) return await fail(tpl.error);

  let journeyName = "";
  if (sale.journey_id) {
    const { data: j } = await admin.from("journeys").select("name").eq("id", sale.journey_id).maybeSingle();
    journeyName = j?.name || "";
  }
  let ownerName = "";
  if (sale.owner_id) {
    const { data: u } = await admin.from("app_users").select("full_name").eq("id", sale.owner_id).maybeSingle();
    ownerName = u?.full_name || "";
  }
  const ctx = {
    first_name: cust.first_name || "", last_name: cust.last_name === "-" ? "" : (cust.last_name || ""),
    full_name: [cust.first_name, cust.last_name === "-" ? "" : cust.last_name].filter(Boolean).join(" "),
    journey_name: journeyName, owner_name: ownerName,
  };
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg.templateParams)) params[k] = fill(String(v), ctx);
  if (!Object.keys(params).length && tpl.vars >= 1) params["BODY_{{1}}"] = ctx.first_name;

  const r = await cc("POST", "/subscriber/send-whatsapp-template-by-user-id", {
    user_id: phone,
    create_if_not_found: "yes",
    content: { namespace: tpl.namespace, name: tpl.name, lang: tpl.lang, params },
    contact: { first_name: ctx.first_name, last_name: ctx.last_name, user_name: ctx.full_name },
  });
  const okBody = r.ok && r.data && r.data.status !== "error" && r.data.success !== false;
  if (!okBody) return await fail(`CloudChat HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 300)}`);

  // user_ns of the (possibly just created) subscriber.
  let userNs: string = r.data?.data?.user_ns || r.data?.user_ns || "";
  if (!userNs) {
    const info = await cc("GET", `/subscriber/get-info-by-user-id?user_id=${phone}`);
    userNs = info.data?.data?.user_ns || "";
  }

  const salePatch: Record<string, unknown> = {
    ai_chat_status: STATUS_SENT, ai_message_sent_at: new Date().toISOString(), ai_send_error: null,
  };
  if (sale.stage === STAGE_NEW) salePatch.stage = STAGE_AI;
  await admin.from("sales").update(salePatch).eq("id", sale.id);
  if (userNs) {
    await admin.from("customers").update({ cloudchat_user_ns: userNs, cloudchat_chat_url: CHAT_URL(userNs) }).eq("id", cust.id);
    // Lets Max know which CRM records to write to (PATCH /api-v1/sales/{id}).
    await cc("PUT", "/subscriber/set-user-fields-by-name", {
      user_ns: userNs,
      data: [{ name: "crm_customer_id", value: cust.id }, { name: "crm_sale_id", value: sale.id }],
    }).catch(() => null);
  }
  await note(admin, "sale", sale.id, `נשלחה הודעת וואטסאפ פתיחה מהסוכן (תבנית ${tpl.name}).`);
  return { result: "sent", user_ns: userNs || null, template: tpl.name, stage_changed: !!salePatch.stage };
}

// ------------------------------------------------------------------ sync
// saleIds: re-check specific sales (still only those in "נשלחה הודעה"),
// regardless of the 30-day window. Without it: the 40 newest sends of the
// last 30 days (CloudChat history API reaches back about a month).
async function sync(admin: SupabaseClient, saleIds?: string[]) {
  const cfg = await settings(admin);
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  let q = admin.from("sales")
    .select("id, customer_id, owner_id, business_unit, ai_message_sent_at, ai_noreply_task_at, customers!inner(id, cloudchat_user_ns, whatsapp_opt_out)")
    .eq("ai_chat_status", STATUS_SENT).is("deleted_at", null);
  q = saleIds && saleIds.length ? q.in("id", saleIds.slice(0, 40)) : q.gte("ai_message_sent_at", since);
  const { data: rows, error } = await q.order("ai_message_sent_at", { ascending: false }).limit(40);
  if (error) throw new Error(error.message);
  const out = { checked: 0, replied: 0, failed: 0, opted_out: 0, noreply_tasks: 0, errors: [] as string[] };
  const now = Date.now() / 1000;

  for (const s of rows || []) {
    const c: any = (s as any).customers;
    const sentTs = Math.floor(new Date(s.ai_message_sent_at as string).getTime() / 1000);
    try {
      if (c?.cloudchat_user_ns) {
        out.checked++;
        const msgs = (await chatMessages(c.cloudchat_user_ns, 100)).filter((m) => m.ts >= sentTs - 10);
        const firstOut = msgs.findIndex((m) => m.type === "out" || m.type === "agent");
        const nextOut = firstOut >= 0 ? msgs.findIndex((m, i) => i > firstOut && (m.type === "out" || m.type === "agent")) : -1;
        const window = firstOut >= 0 ? msgs.slice(firstOut + 1, nextOut > 0 ? nextOut : undefined) : [];
        const err = window.find((m) => m.msg_type === "error" && m.ts - msgs[firstOut].ts <= FAIL_WINDOW_SEC);
        const replies = msgs.filter((m) => m.type === "in");
        if (replies.length) {
          await admin.from("sales").update({ ai_chat_status: STATUS_REPLIED, ai_first_reply_at: new Date(replies[0].ts * 1000).toISOString() }).eq("id", s.id);
          out.replied++;
          if (!c.whatsapp_opt_out && replies.some((m) => OPT_OUT.test(m.text.trim()))) {
            await admin.from("customers").update({ whatsapp_opt_out: true }).eq("id", c.id);
            await note(admin, "customer", c.id, "הליד ביקש בוואטסאפ להפסיק לקבל הודעות. סומן \"לא לפנות בוואטסאפ\".");
            out.opted_out++;
          }
          continue;
        }
        if (err) {
          const e = errInfo(err);
          await admin.from("sales").update({ ai_chat_status: STATUS_FAILED, ai_send_error: e.text.slice(0, 500) }).eq("id", s.id);
          out.failed++;
          continue;
        }
      }
      // No reply within the window: one call task for the sales owner.
      if (!s.ai_noreply_task_at && now - sentTs >= cfg.noReplyHours * 3600) {
        await admin.from("tasks").insert({
          subject: "לא ענה למקס בוואטסאפ: להתקשר", related_type: "sale", related_id: s.id,
          assignee_id: s.owner_id, due_at: new Date().toISOString(), status: "פתוחה", priority: "רגילה",
          description: `הליד לא ענה להודעת הפתיחה בוואטסאפ תוך ${cfg.noReplyHours} שעות.`,
          business_unit: s.business_unit,
        });
        await admin.from("sales").update({ ai_noreply_task_at: new Date().toISOString() }).eq("id", s.id);
        out.noreply_tasks++;
      }
    } catch (e) {
      out.errors.push(`${s.id}: ${(e as Error).message}`);
    }
  }
  return out;
}

// ------------------------------------------------------------------ chat
async function chat(req: Request, body: any) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ error: "unauthorized" }, 401);

  let customerId = body.customer_id as string | undefined;
  if (!customerId && body.sale_id) {
    const { data: s } = await userClient.from("sales").select("customer_id").eq("id", body.sale_id).maybeSingle();
    customerId = s?.customer_id;
  }
  if (!customerId) return json({ error: "not found" }, 404);
  const { data: c } = await userClient.from("customers").select("id, mobile_phone, cloudchat_user_ns, cloudchat_chat_url").eq("id", customerId).maybeSingle();
  if (!c) return json({ error: "not found" }, 404);

  let userNs = c.cloudchat_user_ns as string | null;
  let linked = !!userNs;
  if (!userNs) {
    // Read-only lookup by phone: shows a chat the lead opened on his own,
    // without writing anything.
    const d = digits(c.mobile_phone);
    if (d.length >= 11) {
      const info = await cc("GET", `/subscriber/get-info-by-user-id?user_id=${d}`);
      userNs = info.ok ? (info.data?.data?.user_ns || null) : null;
    }
  }
  if (!userNs) return json({ linked: false, user_ns: null, messages: [] });
  const msgs = await chatMessages(userNs, 100);
  return json({
    linked, user_ns: userNs, chat_url: c.cloudchat_chat_url || CHAT_URL(userNs),
    messages: msgs.map((m) => ({ id: m.id, type: m.type, msg_type: m.msg_type, ts: m.ts, text: m.text, username: m.username })),
  });
}

// ------------------------------------------------------------------ entry
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!CC_KEY) return json({ error: "TRAX_CLOUDCHAT_API_KEY is not set" }, 500);
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const action = body.action;
  try {
    if (action === "chat") return await chat(req, body);
    if (action === "send" || action === "sync") {
      if (!BRIDGE_SECRET || req.headers.get("x-bridge-secret") !== BRIDGE_SECRET) return json({ error: "unauthorized" }, 401);
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      if (action === "send") {
        if (!body.sale_id) return json({ error: "sale_id required" }, 400);
        return json(await send(admin, String(body.sale_id)));
      }
      return json(await sync(admin, Array.isArray(body.sale_ids) ? body.sale_ids.map(String) : undefined));
    }
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
