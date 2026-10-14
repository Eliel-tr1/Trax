// voicenter-call-enrich: copy a Voicenter call's recording + AI data into the CRM.
//
// Voicenter Call History API (GET api-manager.voicenter.co/api-manager-v1/
// Call/History/{ivruniqueid}, Authorization: Bearer <JWT from Vault>) returns:
//   Data.cdr_data.callRecordURL   presigned S3 link to the ENCRYPTED mp3 (.enc)
//   Data.ai_data.transcript.transcript  hex AES ciphertext of the transcript JSON
//   Data.ai_data.insights.summary (+ questions), Data.encrypted_data.{record,ai}_decryption_data
// Decryption (verified 14/10/2026 on a real TRAX call): key = PBKDF2-SHA256(
// base64(decryptAESHash), base64(salt), 100000 iterations, 32 bytes), then
// AES-256-CBC with base64(iv), PKCS7 padding. Result: transcript JSON array of
// {speaker, text, startTime, endTime}, and a plain MP3.
//
// Writes: MP3 -> private bucket call-recordings/<ivruniqueid>.mp3 ->
// phone_calls.recording_path; transcript/summary only when present (never
// blanks); enriched_at stamped. Idempotent, safe to re-run.
//
// Body: { ivruniqueid: "..." }  one call
//       { missing: true, limit: 20 }  batch: calls never enriched (retro)
// See docs/decisions/0009 and data/051.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HISTORY_URL = "https://api-manager.voicenter.co/api-manager-v1/Call/History/";
const BUCKET = "call-recordings";

type Dec = { decryptAESHash: string; iv: string; salt: string };

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (s: string) => new Uint8Array((s.match(/../g) || []).map((h) => parseInt(h, 16)));

async function decrypt(d: Dec, data: Uint8Array): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey("raw", b64(d.decryptAESHash), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: b64(d.salt), iterations: 100000 },
    base, { name: "AES-CBC", length: 256 }, false, ["decrypt"],
  );
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv: b64(d.iv) }, key, data));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Same speaker labels as the live path (n8n normalizer): Speaker0 = rep.
function formatTranscript(t: unknown): string | null {
  if (!Array.isArray(t)) return typeof t === "string" && t.trim() ? t : null;
  const lines = t.map((s: { speaker?: string; text?: string }) =>
    `${s.speaker === "Speaker0" ? "נציג" : s.speaker === "Speaker1" ? "לקוח" : (s.speaker || "")}: ${s.text ?? ""}`);
  return lines.join("\n") || null;
}

// Same rule as the live path: AI summary + only TRAX-defined questions
// (Voicenter's inherited "support" category questions are noise).
function formatSummary(ins: any): string | null {
  if (!ins || typeof ins !== "object") return null;
  const parts: string[] = [];
  if (ins.summary) parts.push(String(ins.summary));
  for (const q of Array.isArray(ins.questions) ? ins.questions : []) {
    if (!q || q.source === "inherited_category" || /^keywords_/.test(q.key || "")) continue;
    if (Array.isArray(q.answer) && !q.answer.length) continue;
    if (q.answer !== undefined && q.answer !== null && q.answer !== "") {
      parts.push(`${q.key || q.question}: ${typeof q.answer === "string" ? q.answer : JSON.stringify(q.answer)}`);
    }
  }
  return parts.join("\n") || null;
}

async function enrichOne(admin: ReturnType<typeof createClient>, jwt: string, ivr: string) {
  const res = await fetch(HISTORY_URL + encodeURIComponent(ivr), { headers: { Accept: "application/json", Authorization: `Bearer ${jwt}` } });
  if (!res.ok) return { ivr, ok: false, reason: `history HTTP ${res.status}: ${(await res.text()).slice(0, 160)}` };
  const data = (await res.json())?.Data;
  if (!data) return { ivr, ok: false, reason: "history: no Data" };

  const update: Record<string, unknown> = { enriched_at: new Date().toISOString() };
  const out: Record<string, unknown> = { ivr, ok: true };

  // Transcript + summary
  const ai = data.ai_data;
  const aiDec: Dec | undefined = data.encrypted_data?.ai_decryption_data;
  if (ai?.transcript?.transcript && aiDec) {
    try {
      const plain = new TextDecoder().decode(await decrypt(aiDec, hex(ai.transcript.transcript)));
      const t = formatTranscript(JSON.parse(plain));
      if (t) { update.transcript = t; out.transcript_lines = t.split("\n").length; }
    } catch (e) { out.transcript_error = String(e).slice(0, 120); }
  }
  const summary = formatSummary(ai?.insights);
  if (summary) { update.summary = summary; out.summary = true; }

  // Recording
  const recUrl: string | undefined = data.cdr_data?.callRecordURL;
  const recDec: Dec | undefined = data.encrypted_data?.record_decryption_data;
  if (recUrl) {
    try {
      const r = await fetch(recUrl);
      if (!r.ok) throw new Error(`recording HTTP ${r.status}`);
      let bytes = new Uint8Array(await r.arrayBuffer());
      if (/\.enc(\?|$)/.test(recUrl)) {
        if (!recDec) throw new Error("encrypted recording without decryption data");
        bytes = await decrypt(recDec, bytes);
      }
      const path = `${ivr}.mp3`;
      const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
      if (error) throw new Error(`upload: ${error.message}`);
      update.recording_path = path;
      out.recording_bytes = bytes.length;
    } catch (e) { out.recording_error = String(e).slice(0, 160); }
  }

  // A recording that exists but failed (e.g. not ready yet right after the
  // call) leaves enriched_at empty, so the scheduled {missing:true} run retries.
  if (recUrl && !update.recording_path) delete update.enriched_at;
  const { error } = await admin.from("phone_calls").update(update).eq("external_call_id", ivr);
  if (error) return { ivr, ok: false, reason: `update: ${error.message}` };
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const body = await req.json().catch(() => ({}));
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: jwt, error: jErr } = await admin.rpc("get_voicenter_jwt");
  if (jErr || !jwt) return json({ ok: false, reason: `no Voicenter token in Vault: ${jErr?.message ?? "empty"}` }, 500);

  let ids: string[] = [];
  if (body.ivruniqueid) ids = [String(body.ivruniqueid)];
  else if (Array.isArray(body.ids)) ids = body.ids.map(String);
  else if (body.missing) {
    const { data, error } = await admin.from("phone_calls").select("external_call_id")
      .is("enriched_at", null).not("external_call_id", "is", null)
      .order("occurred_at", { ascending: false }).limit(Math.min(Number(body.limit) || 10, 25));
    if (error) return json({ ok: false, reason: error.message }, 500);
    ids = (data || []).map((r) => r.external_call_id as string);
  }
  if (!ids.length) return json({ ok: true, processed: 0, results: [] });

  const results = [];
  for (const id of ids) results.push(await enrichOne(admin, jwt as string, id));
  return json({ ok: true, processed: results.length, results });
});
