// n8n Code node "נרמול CDR" in workflow Trax Calls - Voicenter (QqOrRlWGBANByx2C). Source of truth copy; paste into n8n when changed. See docs/decisions/0009.
// Normalize a Voicenter CDR Notification (POST JSON or form-urlencoded)
// into the voicenter-call-sync contract. Field names per
// https://www.voicenter.com/API/CDR-Notification-System-API
// TRAX own numbers (DIDs / outbound caller IDs), digits only, e.g. '972722776772'.
// EMPTY until confirmed from the first real CDR; extensions (SIP codes) are
// already excluded by the "at least 9 digits" rule.
const OWN_NUMBERS = [];

function parseMaybeJson(v) {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (!(s.startsWith('{') || s.startsWith('['))) return v;
  try { return JSON.parse(s); } catch (e) { return v; }
}
const digits = (v) => String(v ?? '').replace(/\D/g, '');
const isPhone = (v) => digits(v).length >= 9;
const sameNum = (a, b) => {
  const x = digits(a).replace(/^972/, '0'), y = digits(b).replace(/^972/, '0');
  return x && y && x.replace(/^0/, '') === y.replace(/^0/, '');
};
const isOwn = (v) => OWN_NUMBERS.some((n) => sameNum(n, v));

// Voicenter's `time` is Israel wall-clock encoded as if it were UTC (first
// real CDR 11/10/2026: ivruniqueid 20261011172723..., n8n received it at
// 14:30Z, time decoded to 17:27Z = 3h in the future). The ivruniqueid prefix
// YYYYMMDDHHmmss is the same Israel wall-clock; convert it to real UTC with
// the Asia/Jerusalem offset of that moment (DST-aware).
function jerusalemOffsetMs(utcMs) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utcMs;
}
function israelWallToIso(y, mo, d, h, mi, s) {
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  let utc = naive - jerusalemOffsetMs(naive);
  utc = naive - jerusalemOffsetMs(utc); // second pass settles DST edges
  return new Date(utc).toISOString();
}
function occurredAtFrom(b) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(String(b.ivruniqueid || ''));
  if (m) return israelWallToIso(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]);
  const t = Number(b.time);
  if (Number.isFinite(t) && t > 1e9) {
    const d = new Date(t * 1000);
    return israelWallToIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
  }
  return null;
}

const out = [];
for (const item of $input.all()) {
  const j = item.json;
  let b = j.body;
  b = parseMaybeJson(b);
  if (typeof b === 'string') {
    // raw urlencoded string that n8n did not parse
    try { b = Object.fromEntries(new URLSearchParams(b)); } catch (e) { b = {}; }
  }
  if (!b || typeof b !== 'object') b = {};
  // some senders wrap the whole CDR in one form field (e.g. data=<json>)
  const keys = Object.keys(b);
  if (keys.length === 1 && typeof b[keys[0]] === 'string' && b[keys[0]].trim().startsWith('{')) {
    const inner = parseMaybeJson(b[keys[0]]);
    if (inner && typeof inner === 'object') b = inner;
  }
  // also accept a query-string-only delivery
  if (!b.ivruniqueid && j.query && j.query.ivruniqueid) b = { ...j.query, ...b };

  const ai = parseMaybeJson(b.aiData ?? b.AiData ?? b.aidata);
  const typeRaw = String(b.type ?? '');
  const typeKey = typeRaw.toLowerCase().replace(/[\s_]/g, '');
  const dirRaw = String(b.direction ?? '').toLowerCase();

  let skip_reason = null;
  if (dirRaw === 'internal') skip_reason = 'internal call';
  if (/leg1$/.test(typeKey) && (typeKey.includes('click2call') || typeKey.includes('productivecall') || typeKey.includes('attended'))) skip_reason = `leg1 of ${typeRaw} (leg2 carries the call + recording)`;

  const incomingTypes = ['incomingcall', 'queue', 'voicemail', 'click2ivrincoming', 'click2queueincoming', 'cc'];
  const outgoingTypes = ['extensionoutgoing', 'click2callleg2', 'productivecallleg2', 'click2ivr', 'scrubber'];
  let dir = null;
  if (dirRaw === 'incoming') dir = 'נכנסת';
  else if (dirRaw === 'outgoing') dir = 'יוצאת';
  else if (incomingTypes.includes(typeKey)) dir = 'נכנסת';
  else if (outgoingTypes.includes(typeKey)) dir = 'יוצאת';
  // A rep's extension on one side settles it: callerextension = the rep
  // dialed out (caller may be the rep's own mobile, e.g. "זרקוש - 0539694863").
  if (!dir && b.callerextension && !b.targetextension) dir = 'יוצאת';
  if (!dir && b.targetextension && !b.callerextension) dir = 'נכנסת';

  const caller = b.callerPhone || b.caller || '';
  const target = b.target || (b.dialerData && b.dialerData.Phone) || b.Phone || '';
  const did = b.did || '';
  const notOurs = (v) => isPhone(v) && !isOwn(v) && !(did && sameNum(v, did));
  let customer = null;
  if (dir === 'נכנסת') customer = notOurs(caller) ? caller : null;
  else if (dir === 'יוצאת') customer = notOurs(target) ? target : null;
  if (!customer) {
    // unknown direction or the expected side was ours: take the phone-like side that is not ours
    if (notOurs(caller) && !notOurs(target)) { customer = caller; dir = dir || 'נכנסת'; }
    else if (notOurs(target) && !notOurs(caller)) { customer = target; dir = dir || 'יוצאת'; }
  }

  const st = String(b.status ?? b.StatusName ?? '').toUpperCase();
  let result = null;
  if (String(b.isAnswer) === '1' || st === 'ANSWER') result = 'נענתה';
  else if (st === 'BUSY') result = 'תפוס';
  else if (st === 'VOICEMAIL' || typeKey === 'voicemail') result = 'השאיר הודעה';
  else if (st) result = 'לא נענתה';

  const occurred_at = occurredAtFrom(b);
  const durRaw = b.actualCallDuration ?? b.duration;
  const duration_seconds = durRaw === undefined || durRaw === '' || durRaw === null ? null : Number(durRaw);

  let transcript = null, summary = null;
  if (ai && typeof ai === 'object') {
    const tr = parseMaybeJson(ai.transcript);
    if (Array.isArray(tr)) {
      transcript = tr.map((s) => `${s.speaker === 'Speaker0' ? 'נציג' : s.speaker === 'Speaker1' ? 'לקוח' : (s.speaker || '')}: ${s.text ?? ''}`).join('\n') || null;
    } else if (typeof tr === 'string' && tr.trim()) transcript = tr;
    const ins = parseMaybeJson(ai.insights) || {};
    const parts = [];
    if (ins.summary) parts.push(String(ins.summary));
    else if (ai.summary) parts.push(String(ai.summary));
    // Only questions TRAX defined itself. Voicenter's built-in "support"
    // category questions (source inherited_category: keyword arrays, resolved
    // true/false, agent score) are noise for a sales rep (Sahar 11/10/2026).
    if (Array.isArray(ins.questions)) {
      for (const q of ins.questions) {
        if (!q || q.source === 'inherited_category' || /^keywords_/.test(q.key || '')) continue;
        if (Array.isArray(q.answer) && !q.answer.length) continue;
        if (q.answer !== undefined && q.answer !== null && q.answer !== '') {
          parts.push(`${q.key || q.question}: ${typeof q.answer === 'string' ? q.answer : JSON.stringify(q.answer)}`);
        }
      }
    }
    summary = parts.join('\n') || null;
  }

  out.push({ json: {
    ivruniqueid: b.ivruniqueid ? String(b.ivruniqueid) : null,
    direction: dir,
    skip_reason,
    customer_phone_raw: customer ? String(customer) : null,
    occurred_at,
    duration_seconds: Number.isFinite(duration_seconds) ? duration_seconds : null,
    result,
    recording_url: b.record || null,
    transcript,
    summary,
    representative_name: b.representative_name || null,
    voicenter_type: typeRaw || null,
    voicenter_status: st || null,
    execution_url: `https://n8n.srv1873970.hstgr.cloud/workflow/${$workflow.id}/executions/${$execution.id}`,
    content_type: (j.headers && j.headers['content-type']) || null,
    raw: b,
  } });
}
return out;
