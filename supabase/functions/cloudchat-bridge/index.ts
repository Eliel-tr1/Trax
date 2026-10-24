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
//   link  {customer_id | sale_id | all:true}  find or CREATE the CloudChat
//         contact by phone and store cloudchat_user_ns + chat link. Never sends.
//   journey {registration_id}       "ברוך הבא למסע": seat-reserved / welcome
//         template to the customer and every passenger with a phone, once per
//         (registration, kind, phone). Called by n8n "TRAX - ברוך הבא למסע" on
//         the CRM 'registration.changed' webhook (docs/decisions/0011).
//         Auth: header x-bridge-secret.
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
// Agent portal (portal.cloudchat.co.il) outbound log: the portal builds its
// conversation view from its own events, so messages the CRM sends straight
// through CloudChat must be reported to it with the rendered text. Optional:
// skipped when the two secrets are not set.
const PORTAL_OUTBOUND_URL = Deno.env.get("TRAX_PORTAL_OUTBOUND_URL") || "";
const PORTAL_OUTBOUND_KEY = Deno.env.get("TRAX_PORTAL_OUTBOUND_KEY") || "";
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
    raw: s,
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
  return { namespace: t.namespace || t.name_space || "", name: t.name, lang: t.language || t.lang || lang, vars, bodyText };
}
const safeJson = (s: string) => { try { return JSON.parse(s); } catch { return null; } };

function fill(tpl: string, ctx: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => ctx[k] ?? "");
}

function renderBody(tpl: any, params: Record<string, string>) {
  return tpl?.bodyText ? String(tpl.bodyText).replace(/\{\{(\d+)\}\}/g, (_: string, n: string) => params[`BODY_{{${n}}}`] ?? "") : "";
}

async function reportToPortal(entry: { user_ns: string | null; phone: string; cloudchat_mid: string | null; template_name: string; rendered_text: string }) {
  if (!PORTAL_OUTBOUND_URL || !PORTAL_OUTBOUND_KEY) return;
  try {
    await fetch(PORTAL_OUTBOUND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${PORTAL_OUTBOUND_KEY}` },
      body: JSON.stringify({ ...entry, source: "crm", sent_at: new Date().toISOString() }),
    });
  } catch { /* the portal also reconciles from CloudChat; never fail a send on this */ }
}

async function note(admin: SupabaseClient, relatedType: string, relatedId: string, content: string) {
  await admin.from("notes").insert({ related_type: relatedType, related_id: relatedId, content });
}

// ------------------------------------------------------------------ link
// Make sure the customer has a CloudChat (WhatsApp) contact and store its id
// + chat link on the customer. Finds an existing subscriber by phone; if none,
// CREATES the contact (POST /subscriber/create, WhatsApp channel, verified
// 24/10 to send nothing and start no flow). Never sends a message. Runs at lead
// creation (n8n calls it before the 60 s wait), before every send, and as a
// backfill ({all:true}). Sahar 24/10: every customer with a WhatsApp number.
async function linkCustomer(admin: SupabaseClient, cust: any, create = true): Promise<string | null> {
  if (!cust || cust.cloudchat_user_ns) return cust?.cloudchat_user_ns || null;
  const phone = digits(cust.mobile_phone);
  if (phone.length < 11 || phone.length > 15 || phone.includes("*")) return null;
  const info = await cc("GET", `/subscriber/get-info-by-user-id?user_id=${phone}`);
  let ns: string = info.ok ? (info.data?.data?.user_ns || "") : "";
  if (!ns && create) {
    const last = cust.last_name === "-" ? "" : (cust.last_name || "");
    const r = await cc("POST", "/subscriber/create", {
      phone: "+" + phone, first_name: cust.first_name || "", last_name: last,
      name: [cust.first_name, last].filter(Boolean).join(" "),
    });
    ns = r.ok ? (r.data?.data?.user_ns || "") : "";
  }
  if (!ns) return null;
  await admin.from("customers").update({ cloudchat_user_ns: ns, cloudchat_chat_url: CHAT_URL(ns) }).eq("id", cust.id).is("cloudchat_user_ns", null);
  await cc("PUT", "/subscriber/set-user-fields-by-name", { user_ns: ns, data: [{ name: "crm_customer_id", value: cust.id }] }).catch(() => null);
  return ns;
}

async function link(admin: SupabaseClient, body: any) {
  let ids: string[] = [];
  if (body.sale_id) {
    const { data: s } = await admin.from("sales").select("customer_id").eq("id", body.sale_id).maybeSingle();
    if (s?.customer_id) ids = [s.customer_id];
  } else if (body.customer_id) ids = [String(body.customer_id)];
  let q = admin.from("customers").select("id, first_name, last_name, mobile_phone, cloudchat_user_ns").is("deleted_at", null).is("cloudchat_user_ns", null);
  if (ids.length) q = q.in("id", ids);
  else if (!body.all) return { error: "customer_id, sale_id or all required" };
  const lim = Math.min(Number(body.limit) || 100, 300);
  const off = Math.max(Number(body.offset) || 0, 0);
  const { data: rows } = await q.order("created_at", { ascending: false }).range(off, off + lim - 1);
  const out = { checked: 0, linked: 0, not_linked: 0 };
  for (const c of rows || []) {
    out.checked++;
    const ns = await linkCustomer(admin, c);
    if (ns) out.linked++; else out.not_linked++;
    if (body.all) await new Promise((r) => setTimeout(r, 500)); // CloudChat rate limit is shared with Max
  }
  return out;
}

// ------------------------------------------------------------------ send
async function send(admin: SupabaseClient, saleId: string) {
  const { data: sale } = await admin.from("sales").select("*").eq("id", saleId).maybeSingle();
  if (!sale) return { result: "skipped", reason: "sale_not_found" };
  const { data: cust } = await admin.from("customers").select("*").eq("id", sale.customer_id).maybeSingle();
  if (!cust) return { result: "skipped", reason: "customer_not_found" };
  const cfg = await settings(admin);
  const phone = digits(cust.mobile_phone);
  if (!cust.cloudchat_user_ns && !cust.deleted_at) {
    const ns = await linkCustomer(admin, cust).catch(() => null);
    if (ns) cust.cloudchat_user_ns = ns;
  }

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
  // Test phones skip the dedupe window so every test run sends (Sahar 24/10).
  if (recent && recent.length && !cfg.testPhones.includes(phone)) return { result: "skipped", reason: "dedupe", other_sale_id: recent[0].id };

  // A sale opened FROM a WhatsApp chat (channel "וואטסאפ": Max created it
  // while the lead was writing to him) must not get the opening template on
  // top of the live chat: link the chat and mark it "ענה לסוכן" instead.
  // Any other new sale (form, CRM screen, api-v1) always gets the template,
  // even if the same number chatted with Max earlier (Sahar 24/10: a lead
  // added in the CRM with the box checked must get the message).
  if (sale.channel === "וואטסאפ") {
    const info = await cc("GET", `/subscriber/get-info-by-user-id?user_id=${phone}`);
    const ns: string = info.ok ? (info.data?.data?.user_ns || "") : "";
    let inbound: Msg[] = [];
    if (ns) {
      try { inbound = (await chatMessages(ns, 50)).filter((m) => m.type === "in" && m.ts >= Date.now() / 1000 - 24 * 3600); } catch { inbound = []; }
    }
    if (ns) {
      await admin.from("customers").update({ cloudchat_user_ns: ns, cloudchat_chat_url: CHAT_URL(ns) }).eq("id", cust.id);
      const patch: Record<string, unknown> = { ai_chat_status: STATUS_REPLIED, ai_send_error: null };
      if (inbound.length) patch.ai_first_reply_at = new Date(inbound[0].ts * 1000).toISOString();
      await admin.from("sales").update(patch).eq("id", sale.id);
      await cc("PUT", "/subscriber/set-user-fields-by-name", {
        user_ns: ns, data: [{ name: "crm_customer_id", value: cust.id }, { name: "crm_sale_id", value: sale.id }],
      }).catch(() => null);
      await note(admin, "sale", sale.id, "הליד כבר בשיחה פעילה עם מקס בוואטסאפ, ולכן לא נשלחה הודעת פתיחה.");
      return { result: "skipped", reason: "already_in_conversation", user_ns: ns };
    }
  }

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

  await reportToPortal({ user_ns: userNs || null, phone, cloudchat_mid: r.data?.mid || null, template_name: tpl.name, rendered_text: renderBody(tpl, params) });

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

  // Meta rejections. Checked live 24/10: a rejected template does NOT always
  // leave an error row in the chat; it lands in /flow/error-logs with the
  // user_ns and "(#<code>) <text>". One call per run, mapped by user_ns.
  const flowErrors = new Map<string, { ts: number; text: string }[]>();
  const oldest = Math.min(...(rows || []).map((r) => Math.floor(new Date(r.ai_message_sent_at as string).getTime() / 1000)), Math.floor(now));
  const errSince = Math.min(oldest - 60, Math.floor(now) - 2 * 86400);
  const el = await cc("GET", `/flow/error-logs/data?limit=1000&start_time=${Math.max(errSince, Math.floor(now) - 29 * 86400)}&end_time=${Math.floor(now) + 60}`);
  for (const e of (Array.isArray(el.data?.data) ? el.data.data : [])) {
    if (!e.user_ns) continue;
    const list = flowErrors.get(e.user_ns) || [];
    list.push({ ts: Math.floor(new Date(e.created_at).getTime() / 1000), text: String(e.description || "") });
    flowErrors.set(e.user_ns, list);
  }

  // Journey messages (ADR 0011) rejected by Meta after the send was accepted.
  const { data: jm } = await admin.from("journey_messages").select("id, user_ns, sent_at")
    .eq("status", "sent").not("user_ns", "is", null).gte("sent_at", new Date(Date.now() - 2 * 86400_000).toISOString());
  for (const m of jm || []) {
    const sent = Math.floor(new Date(m.sent_at as string).getTime() / 1000);
    const e = (flowErrors.get(m.user_ns as string) || []).find((x) => x.ts >= sent - 10);
    if (e) {
      const code = /\(#(\d+)\)/.exec(e.text)?.[1] || null;
      await admin.from("journey_messages").update({ status: "failed", reason: [code ? META_ERR_HE[code] : null, e.text].filter(Boolean).join(": ").slice(0, 500), updated_at: new Date().toISOString() }).eq("id", m.id);
      (out as any).journey_failed = ((out as any).journey_failed || 0) + 1;
    }
  }

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
        const logged = (flowErrors.get(c.cloudchat_user_ns) || []).find((e) => e.ts >= sentTs - 10);
        if (!err && logged) {
          const code = /\(#(\d+)\)/.exec(logged.text)?.[1] || null;
          const text = [code ? META_ERR_HE[code] : null, logged.text].filter(Boolean).join(": ");
          await admin.from("sales").update({ ai_chat_status: STATUS_FAILED, ai_send_error: text.slice(0, 500) }).eq("id", s.id);
          out.failed++;
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

// ------------------------------------------------------------------ journey
const REG_KIND: Record<string, "seat_reserved" | "welcome"> = {
  "משוריין": "seat_reserved", "שולמה מקדמה": "welcome", "שולם במלואו": "welcome",
};
const KIND_HE = { seat_reserved: "שמירת מקום", welcome: "ברוך הבא למסע" };
const VAR_HE: Record<string, string> = {
  trip_name: "שם היציאה", destination: "יעד", start_date: "תאריך יציאה", end_date: "תאריך חזרה",
  participants: "מספר משתתפים", days_to_trip: "ימים עד היציאה", trip_url: "קישור לעמוד המסע", customer_first_name: "שם הלקוח",
};
const ddmmyyyy = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join(".") : "");

async function journey(admin: SupabaseClient, registrationId: string) {
  const { data: reg } = await admin.from("registrations").select("*").eq("id", registrationId).maybeSingle();
  if (!reg || reg.deleted_at) return { result: "skipped", reason: "registration_not_found" };
  const kind = REG_KIND[reg.status];
  if (!kind) return { result: "skipped", reason: "status_not_relevant", status: reg.status };
  const cfg = await settings(admin);
  const raw = cfg.raw;

  const [{ data: cust }, { data: trip }, { data: pax }, saleRes] = await Promise.all([
    admin.from("customers").select("*").eq("id", reg.customer_id).maybeSingle(),
    admin.from("journeys").select("*").eq("id", reg.journey_id).maybeSingle(),
    admin.from("registration_passengers").select("id, full_name, phone, is_primary").eq("registration_id", reg.id),
    reg.sale_id ? admin.from("sales").select("id, stage, owner_id, business_unit, participants_count").eq("id", reg.sale_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const sale: any = (saleRes as any).data;
  if (!cust) return { result: "skipped", reason: "customer_not_found" };
  if ((sale?.business_unit || cust.business_unit) !== "TRAX") return { result: "skipped", reason: "not_trax" };
  if ((raw.whatsapp_journey_require_sale_won || "true") !== "false" && sale && sale.stage !== "נסגר בהצלחה") {
    return { result: "skipped", reason: "sale_not_won", sale_stage: sale.stage };
  }

  // Recipients: the customer, then every passenger with a phone; one per number.
  const recipients: { phone: string; name: string; passengerId: string | null; isCustomer: boolean }[] = [];
  const seen = new Set<string>();
  const add = (phone: string | null, name: string, passengerId: string | null, isCustomer: boolean) => {
    const d = digits(phone);
    if (d.length < 11 || d.includes("*") || seen.has(d)) return;
    seen.add(d);
    recipients.push({ phone: d, name: (name || "").trim().split(/\s+/)[0] || "", passengerId, isCustomer });
  };
  add(cust.mobile_phone, cust.first_name, (pax || []).find((p: any) => p.is_primary)?.id || null, true);
  for (const p of pax || []) add(p.phone, p.full_name, p.id, false);
  if (!recipients.length) return { result: "skipped", reason: "no_phone" };

  const tplName = (raw[`whatsapp_${kind === "welcome" ? "welcome" : "reserved"}_template_name`] || "").trim();
  const tplLang = (raw[`whatsapp_${kind === "welcome" ? "welcome" : "reserved"}_template_lang`] || "he").trim();
  let mapping: Record<string, string> = {};
  try { mapping = JSON.parse(raw[`whatsapp_${kind === "welcome" ? "welcome" : "reserved"}_template_params`] || "{}") || {}; } catch { mapping = {}; }

  const daysToTrip = trip?.departure_date ? Math.ceil((new Date(trip.departure_date + "T00:00:00Z").getTime() - Date.now()) / 86400_000) : null;
  const participants = String(Math.max((pax || []).length, Number(sale?.participants_count || 0), 1));
  const baseCtx: Record<string, string> = {
    customer_first_name: cust.first_name || "",
    trip_name: trip?.name || "", destination: trip?.destination || "",
    start_date: ddmmyyyy(trip?.departure_date), end_date: ddmmyyyy(trip?.return_date),
    participants, days_to_trip: daysToTrip !== null ? String(Math.max(daysToTrip, 0)) : "",
    trip_url: trip?.page_url || "",
  };

  // Never send with an empty variable: required trip fields + every mapped one.
  const missing: string[] = [];
  if (!baseCtx.trip_name) missing.push("שם היציאה");
  if (!baseCtx.destination) missing.push("יעד");
  if (!baseCtx.start_date) missing.push("תאריך יציאה");
  for (const v of Object.values(mapping)) {
    for (const k of String(v).match(/\{(\w+)\}/g) || []) {
      const key = k.slice(1, -1);
      if (key in baseCtx && !baseCtx[key]) missing.push(VAR_HE[key] || key);
    }
  }

  const ownerId = sale?.owner_id || cust.account_manager_id || cust.owner_id || null;
  const mark = async (status: string, reason: string, r: typeof recipients[number]) => {
    const { data: ex } = await admin.from("journey_messages").select("id, status").eq("registration_id", reg.id).eq("kind", kind).eq("phone", r.phone).maybeSingle();
    if (ex?.status === "sent") return;
    if (ex) await admin.from("journey_messages").update({ status, reason, updated_at: new Date().toISOString() }).eq("id", ex.id);
    else await admin.from("journey_messages").insert({ registration_id: reg.id, kind, phone: r.phone, passenger_id: r.passengerId, recipient_name: r.name, status, reason });
  };

  if (missing.length) {
    const subject = "חסרים פרטי מסע: הודעת וואטסאפ למשתתפים לא נשלחה";
    const { data: open } = await admin.from("tasks").select("id").eq("related_type", "registration").eq("related_id", reg.id).eq("subject", subject).eq("status", "פתוחה").is("deleted_at", null).limit(1);
    if (!open?.length) {
      await admin.from("tasks").insert({
        subject, related_type: "registration", related_id: reg.id, assignee_id: ownerId, due_at: new Date().toISOString(),
        status: "פתוחה", priority: "דחופה", business_unit: "TRAX",
        description: `הודעת "${KIND_HE[kind]}" לא נשלחה כי חסר ביציאה "${trip?.name || ""}": ${[...new Set(missing)].join(", ")}. משלימים את הפרטים במסע, ואז מעדכנים שוב את סטטוס ההרשמה או פונים לצוות.`,
      });
      if (ownerId) await admin.from("notifications").insert({ user_id: ownerId, text: "חסרים פרטי מסע, הודעת וואטסאפ למשתתפים לא נשלחה", type: "automation", related_type: "registrations", related_id: reg.id });
    }
    for (const r of recipients) await mark("skipped", `חסר: ${[...new Set(missing)].join(", ")}`, r);
    return { result: "skipped", reason: "missing_data", missing: [...new Set(missing)] };
  }

  // Per-recipient gates first, so every row says why it was not sent.
  const out: any[] = [];
  const eligible: typeof recipients = [];
  for (const r of recipients) {
    if (r.isCustomer && cust.whatsapp_opt_out) { await mark("skipped", "הלקוח ביקש לא לפנות בוואטסאפ", r); out.push({ phone: r.phone, result: "opt_out" }); continue; }
    if (cfg.testMode && !cfg.testPhones.includes(r.phone)) { await mark("skipped", "מצב בדיקה", r); out.push({ phone: r.phone, result: "test_mode" }); continue; }
    if (kind === "seat_reserved") {
      const { data: w } = await admin.from("journey_messages").select("id").eq("registration_id", reg.id).eq("kind", "welcome").eq("phone", r.phone).eq("status", "sent").limit(1);
      if (w?.length) { out.push({ phone: r.phone, result: "welcome_already_sent" }); continue; }
    }
    eligible.push(r);
  }
  if (!eligible.length) return { result: "done", kind, recipients: out };

  let tpl: any = null;
  if (!tplName) {
    for (const r of eligible) await mark("skipped", "לא הוגדרה תבנית", r);
    return { result: "skipped", reason: "no_template", kind, recipients: out.concat(eligible.map((r) => ({ phone: r.phone, result: "no_template" }))) };
  }
  tpl = await resolveTemplate(tplName, tplLang);
  if (tpl.error) {
    for (const r of eligible) await mark("skipped", tpl.error, r);
    return { result: "skipped", reason: "template_unavailable", error: tpl.error };
  }

  const sentLines: string[] = [];
  for (const r of eligible) {
    const { data: claimId } = await admin.rpc("claim_journey_message", {
      p_registration_id: reg.id, p_kind: kind, p_phone: r.phone, p_passenger_id: r.passengerId, p_name: r.name,
    });
    if (!claimId) { out.push({ phone: r.phone, result: "already_sent" }); continue; }

    const ctx = { ...baseCtx, first_name: r.name, full_name: r.name };
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(mapping)) params[k] = fill(String(v), ctx);
    if (!Object.keys(params).length && tpl.vars >= 1) params["BODY_{{1}}"] = ctx.first_name;

    const res = await cc("POST", "/subscriber/send-whatsapp-template-by-user-id", {
      user_id: r.phone, create_if_not_found: "yes",
      content: { namespace: tpl.namespace, name: tpl.name, lang: tpl.lang, params },
      contact: { first_name: r.name },
    });
    const ok = res.ok && res.data && res.data.status !== "error" && res.data.success !== false;
    if (!ok) {
      await admin.from("journey_messages").update({ status: "failed", reason: `CloudChat HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 300)}`, template: tpl.name, updated_at: new Date().toISOString() }).eq("id", claimId);
      out.push({ phone: r.phone, result: "failed" });
      continue;
    }
    const info = await cc("GET", `/subscriber/get-info-by-user-id?user_id=${r.phone}`);
    const userNs = info.data?.data?.user_ns || null;
    await admin.from("journey_messages").update({ status: "sent", reason: null, template: tpl.name, user_ns: userNs, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", claimId);
    if (userNs) {
      if (r.isCustomer) await admin.from("customers").update({ cloudchat_user_ns: userNs, cloudchat_chat_url: CHAT_URL(userNs) }).eq("id", cust.id).is("cloudchat_user_ns", null);
      await cc("PUT", "/subscriber/set-user-fields-by-name", {
        user_ns: userNs,
        data: [
          { name: "crm_customer_id", value: cust.id },
          { name: "crm_registration_id", value: reg.id },
          { name: "crm_journey_name", value: baseCtx.trip_name },
          { name: "crm_registration_status", value: reg.status },
        ],
      }).catch(() => null);
    }
    const body = renderBody(tpl, params);
    await reportToPortal({ user_ns: userNs, phone: r.phone, cloudchat_mid: res.data?.mid || null, template_name: tpl.name, rendered_text: body });
    sentLines.push(`${r.name || "-"} (${r.phone})${r.isCustomer ? "" : ", נוסע נוסף"}`);
    out.push({ phone: r.phone, result: "sent" });
    if (body && sentLines.length === 1) sentLines.unshift(`נוסח: ${body}`);
  }

  if (out.some((o) => o.result === "sent")) {
    await note(admin, "customer", cust.id, `נשלחה הודעת וואטסאפ "${KIND_HE[kind]}" (תבנית ${tpl.name}) להרשמה ${reg.registration_name || ""}:\n${sentLines.join("\n")}`);
    if (cust.status !== "לקוח פעיל") await admin.from("customers").update({ status: "לקוח פעיל" }).eq("id", cust.id);
  }
  return { result: "done", kind, recipients: out };
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
    if (action === "send" || action === "sync" || action === "journey" || action === "link") {
      if (!BRIDGE_SECRET || req.headers.get("x-bridge-secret") !== BRIDGE_SECRET) return json({ error: "unauthorized" }, 401);
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      if (action === "send") {
        if (!body.sale_id) return json({ error: "sale_id required" }, 400);
        return json(await send(admin, String(body.sale_id)));
      }
      if (action === "link") return json(await link(admin, body));
      if (action === "journey") {
        if (!body.registration_id) return json({ error: "registration_id required" }, 400);
        return json(await journey(admin, String(body.registration_id)));
      }
      return json(await sync(admin, Array.isArray(body.sale_ids) ? body.sale_ids.map(String) : undefined));
    }
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
