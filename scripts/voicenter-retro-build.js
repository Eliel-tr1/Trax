// Retro import of Voicenter calls (Sahar 12/10/2026). Run by an operator: pull the Call Log API (https://api.voicenter.com/hub/cdr/, code = VOICENTER_TRAX_API_CODE, server IP must be allowed in Voicenter) into $TMPDIR/vc_all.json, then run this to build CDR-shaped bodies, then POST each to the n8n webhook (same path as live calls; dedupe by ivruniqueid makes re-runs safe).
// Build CDR-notification-shaped bodies from Voicenter Call Log rows and run them through the real n8n normalizer.
const fs = require('fs')
const L = JSON.parse(fs.readFileSync(process.env.TMPDIR + '/vc_all.json')).CDR_LIST
const src = fs.readFileSync('scripts/n8n/voicenter-normalize-cdr.js', 'utf8')
const fn = new Function('$input', '$workflow', '$execution', src)
const bodies = L.map(c => ({
  caller: c.CallerNumber, target: c.TargetNumber, time: Math.round(c.DateEpoch / 1000), duration: c.Duration,
  ivruniqueid: c.CallID, type: c.Type, status: c.DialStatus, did: c.DID, record: c.RecordURL || '',
  callerextension: c.Callerextension, targetextension: c.Targetextension, dialtime: c.RingTime,
  representative_name: c.RepresentativeName, queuename: c.QueueName, source: 'voicenter-call-log-retro',
}))
const norm = bodies.map(b => fn({ all: () => [{ json: { body: b, headers: {} } }] }, { id: 'W' }, { id: 'E' })[0].json)
fs.writeFileSync(process.env.TMPDIR + '/retro_bodies.json', JSON.stringify(bodies))
fs.writeFileSync(process.env.TMPDIR + '/retro_norm.json', JSON.stringify(norm.map(n => ({ id: n.ivruniqueid, dir: n.direction, cust: n.customer_phone_raw, trax: n.trax_number_raw, res: n.result, at: n.occurred_at, rep: n.representative_name }))))
const C = (k) => norm.reduce((m, n) => (m[n[k]] = (m[n[k]] || 0) + 1, m), {})
console.log('dir', C('direction'), 'result', C('result'))
console.log('no customer phone:', norm.filter(n => !n.customer_phone_raw).length, 'no trax number:', norm.filter(n => !n.trax_number_raw).length)
console.log('time check (Call Log Date vs occurred_at):', L.slice(0, 3).map((c, i) => c.Date + ' -> ' + norm[i].occurred_at).join(' | '))
console.log('trax numbers', C('trax_number_raw'))
