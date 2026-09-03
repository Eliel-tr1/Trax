import { useState } from 'react'
import Modal from './Modal'
import { usePermissionStore } from '../stores/permissionStore'

/* Hidden diagnostics overlay — opened via the tiny 'i' chip in the bottom
   corner. Shows the reload forensics log (who reloaded the tab and when)
   + environment facts, so "it still reloads" reports come with evidence
   instead of guesswork. */
export default function DiagnosticsOverlay() {
  const [open, setOpen] = useState(false)
  const [log, setLog] = useState([])
  const [copied, setCopied] = useState(false)

  const read = () => {
    try { setLog(JSON.parse(localStorage.getItem('trax_reload_forensics') || '[]')) }
    catch { setLog([{ t: new Date().toISOString(), type: 'parse-error' }]) }
  }

  if (!open) {
    return (
      <button
        aria-label="אבחון"
        title="אבחון רענונים (Alt+Shift+D)"
        onClick={() => { read(); setOpen(true) }}
        onKeyDown={e => { /* noop */ }}
        style={{ position: 'fixed', bottom: 4, insetInlineStart: 4, width: 14, height: 14, opacity: 0.25, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', zIndex: 2147483000, fontSize: 8, color: 'var(--muted-foreground)', padding: 0 }}
      >i</button>
    )
  }

  return (
    <Modal open onClose={() => setOpen(false)} title="אבחון רענונים">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          <div><b>build:</b> <code style={{ fontSize: 11 }}>{(localStorage.getItem('trax_build') || '?')}</code></div>
          <div><b>service worker:</b> {navigator.serviceWorker?.controller ? 'פעיל (!) — צריך להיות כבוי' : 'כבוי (תקין)'}</div>
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {Object.entries(usePermissionStore.getState().matrix).map(([res, p]) => (
              <span key={res} style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 4,
                background: p.view ? 'color-mix(in srgb, #22c55e 18%, transparent)' : 'color-mix(in srgb, #ef4444 18%, transparent)',
                color: p.view ? '#15803d' : '#b91c1c',
              }} title={`scope=${p.scope} view=${p.view} edit=${p.edit}`}>{res}{p.view ? ' ✓' : ' ✗'}</span>
            ))}
          </div>
        </div>
        <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', direction: 'ltr', textAlign: 'left' }}>
            <thead><tr style={{ opacity: 0.6 }}><th style={{ textAlign: 'left' }}>time</th><th>event</th><th>sw?</th></tr></thead>
            <tbody>
              {log.slice().reverse().map((e, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '2px 6px' }}>{(e.t || '').slice(11, 19)}</td>
                  <td style={{ padding: '2px 6px' }}>{e.ev === 'visibility' ? `tab ${e.state}` : (e.type || e.ev)}{e.type === 'reload' ? ' ← RELOAD!' : ''}</td>
                  <td style={{ padding: '2px 6px' }}>{e.swControlled ? 'YES' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start' }}>
          <button className="btn btn-outline" onClick={() => {
            navigator.clipboard?.writeText(JSON.stringify(log, null, 1)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
          }}>{copied ? 'הועתק ✓' : 'העתק לשיתוף'}</button>
          <button className="btn" onClick={() => setOpen(false)}>סגור</button>
        </div>
      </div>
    </Modal>
  )
}
