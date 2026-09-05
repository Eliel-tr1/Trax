import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { deleteConfirmDialog } from './Dialogs'
import Icon from './Icon'

/* מקס — floating AI assistant, bottom-left (per spec, mirrors Notifications'
   bottom-right chrome but as its own persistent launcher rather than a
   header icon). This app is RTL, and the Sidebar primitive (see AppSidebar's
   side="left" comment) renders its logical "start" edge on the visual RIGHT
   — so `insetInlineStart` here previously put Max on the visual right too,
   stacking it on top of the sidebar's own profile/logout footer. Use
   insetInlineEnd instead, which is the visual LEFT in RTL, to keep Max clear
   of the sidebar entirely (verified live 2026-09-01 via getBoundingClientRect
   on both elements — no overlap at any width the sidebar can occupy). All
   data reads happen server-side in the max-chat Edge
   Function via a fixed tool allow-list — this component only ever sends
   free-text messages and renders whatever comes back; it has no query logic
   of its own and no way to reach the DB directly except the max_sessions/
   max_messages tables (session list + history), which RLS already scopes to
   the signed-in user. */

const THINKING_STEP_MS = 550

export default function MaxAssistant() {
  const user = useAuthStore(s => s.user)
  const [open, setOpen] = useState(false)
  const [showSessions, setShowSessions] = useState(false)
  const [sessions, setSessions] = useState([])
  const [sessionId, setSessionId] = useState(() => {
    // Persist the active session across refreshes and navigation (Goldi:
    // "the chat must stay open when I refresh or move between screens").
    try { return sessionStorage.getItem('max_session_id') || null } catch { return null }
  })
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [thinking, setThinking] = useState([]) // transient trail lines shown while waiting
  const scrollRef = useRef(null)
  const panelRef = useRef(null)

  useEffect(() => {
    try {
      if (sessionId) sessionStorage.setItem('max_session_id', sessionId)
      else sessionStorage.removeItem('max_session_id')
    } catch { /* ignore */ }
  }, [sessionId])

  // Reload the persisted session's messages on mount — so a refresh or a
  // navigation away-and-back restores the exact conversation, not the list.
  useEffect(() => {
    if (sessionId) {
      (async () => {
        const { data } = await supabase.from('max_messages').select('id, role, content, trail, created_at')
          .eq('session_id', sessionId).order('created_at', { ascending: true })
        setMessages(data || [])
      })()
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  useEffect(() => {
    if (open && user) loadSessions()
  }, [open, user])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, thinking])

  async function loadSessions() {
    const { data } = await supabase.from('max_sessions').select('id, title, updated_at')
      .order('updated_at', { ascending: false })
    setSessions(data || [])
  }

  async function openSession(id) {
    setSessionId(id)
    setShowSessions(false)
    const { data } = await supabase.from('max_messages').select('id, role, content, trail, created_at')
      .eq('session_id', id).order('created_at', { ascending: true })
    setMessages(data || [])
  }

  function startNewSession() {
    setSessionId(null)
    setMessages([])
    setShowSessions(false)
  }

  async function deleteSession(id, e) {
    e.stopPropagation()
    if (!await deleteConfirmDialog('בטוח שנרצה למחוק את השיחה עם מקס?')) return
    await supabase.from('max_sessions').delete().eq('id', id)
    if (id === sessionId) startNewSession()
    loadSessions()
  }

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setSending(true)
    setMessages(m => [...m, { id: 'tmp-' + Date.now(), role: 'user', content: text }])

    const { data, error } = await supabase.functions.invoke('max-chat', {
      body: { session_id: sessionId, message: text },
    })

    if (error || !data) {
      setThinking([])
      setMessages(m => [...m, { id: 'err-' + Date.now(), role: 'assistant', content: 'תקלה בתקשורת עם מקס, נסה שוב.' }])
      setSending(false)
      return
    }

    if (!sessionId) { setSessionId(data.session_id); loadSessions() }

    // Play the thinking trail sequentially, then reveal the real answer —
    // the server already computed everything, this is purely the "visible
    // search trail before the final answer" UX from the spec.
    const trail = data.trail || []
    for (let i = 0; i < trail.length; i++) {
      setThinking(trail.slice(0, i + 1))
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, THINKING_STEP_MS))
    }
    setThinking([])
    setMessages(m => [...m, { id: 'a-' + Date.now(), role: 'assistant', content: data.reply, trail }])
    setSending(false)
    loadSessions()
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  if (!user) return null

  return (
    <div style={{ position: 'fixed', insetInlineEnd: 20, bottom: 20, zIndex: 60 }}>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="מקס — העוזר של TRAX"
          style={{
            width: 54, height: 54, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, var(--mp), var(--lp))', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--sh2)', transition: 'var(--t)',
          }}
        >
          <Icon name="sparkles" size={24} />
        </button>
      )}

      {open && (
        <div ref={panelRef} style={{
          width: 360, maxWidth: 'calc(100vw - 40px)', height: 520, maxHeight: 'calc(100vh - 100px)',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
          boxShadow: 'var(--sh3)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
            borderBottom: '1px solid var(--border-soft)', background: 'var(--surface-2)',
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, var(--mp), var(--lp))',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0,
            }}>
              <Icon name="sparkles" size={16} />
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text)' }}>מקס</div>
            <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 4 }}>
              <button className="qa-btn icon-only" title="שיחות שמורות" onClick={() => setShowSessions(s => !s)}>
                <Icon name="inbox" size={15} />
              </button>
              <button className="qa-btn icon-only" title="שיחה חדשה" onClick={startNewSession}>
                <Icon name="plus" size={15} />
              </button>
              <button className="qa-btn icon-only" title="סגירה" onClick={() => setOpen(false)}>
                <Icon name="x" size={15} />
              </button>
            </div>
          </div>

          {/* Session switcher */}
          {showSessions && (
            <div style={{ borderBottom: '1px solid var(--border-soft)', maxHeight: 180, overflowY: 'auto' }}>
              {sessions.length === 0 && <div className="empty small" style={{ padding: 10 }}>אין שיחות שמורות</div>}
              {sessions.map(s => (
                <div key={s.id} onClick={() => openSession(s.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', cursor: 'pointer',
                    background: s.id === sessionId ? 'var(--surface-2)' : 'transparent', fontSize: '0.82rem',
                  }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{s.title}</span>
                  <button className="qa-btn icon-only danger" title="מחיקה" onClick={(e) => deleteSession(s.id, e)} style={{ height: 26, width: 26 }}>
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 && !sending && (
              <div className="small" style={{ color: 'var(--text-3)', textAlign: 'center', marginTop: 30 }}>
                תשאל אותי משהו על הלידים, המכירות או המסעות.
              </div>
            )}
            {messages.map(m => {
              // Max references records with [type|id|label] tokens. They may
              // appear on a dedicated "קישורים:" line OR inline mid-sentence —
              // parse BOTH: extract every token from the whole message body,
              // replace each with a clickable chip inline, and drop the
              // redundant "קישורים:" line if present.
              const ROUTE = { לקוח: 'customers', מכירה: 'sales', מסע: 'journeys', 'הרשמה': 'registrations', פגישה: 'meetings', משימה: 'tasks', שיחה: 'phone-calls', נוסע: null, משתמש: null, הערה: null }
              // Max sometimes emits 2-part tokens ([type|id], no display label)
              // despite the 3-part instruction — accept BOTH or those land as
              // raw text (Sahar 09-05: "he shows IDs instead of links").
              const TOKEN = /\[(לקוח|מכירה|מסע|הרשמה|פגישה|משימה|שיחה|נוסע|משתמש|הערה)\|([0-9a-f-]{36})(?:\|([^\]]+))?\]/g
              const FALLBACK_LABEL = { לקוח: 'לקוח', מכירה: 'מכירה', מסע: 'מסע', הרשמה: 'הרשמה', פגישה: 'פגישה', משימה: 'משימה', שיחה: 'שיחה', נוסע: 'נוסע', משתמש: 'משתמש', הערה: 'הערה' }
              let body = m.content
              // Dedicated links line: remove entirely (its tokens are picked up below)
              body = body.replace(/קישורים:\s*\n?((?:\[[^\]]+\]\s*)+)$/gm, '').trim()
              if (m.role !== 'assistant') return (
                <div key={m.id} style={{
                  alignSelf: 'flex-end', maxWidth: '85%', background: 'var(--mp)',
                  color: '#fff', borderRadius: 'var(--rs)', padding: '8px 11px', fontSize: '0.87rem', lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                }}>
                  {body}
                </div>
              )
              // Split on tokens: parts alternate [text, token, text, token, ...]
              const parts = []
              let last = 0, mm
              TOKEN.lastIndex = 0
              while ((mm = TOKEN.exec(body)) !== null) {
                if (mm.index > last) parts.push({ text: body.slice(last, mm.index) })
                parts.push({ token: { type: mm[1], id: mm[2], label: mm[3] || FALLBACK_LABEL[mm[1]] } })
                last = mm.index + mm[0].length
              }
              if (last < body.length) parts.push({ text: body.slice(last) })
              return (
                <div key={m.id} style={{
                  alignSelf: 'flex-start', maxWidth: '85%', background: 'var(--surface-2)',
                  color: 'var(--text)', borderRadius: 'var(--rs)', padding: '8px 11px', fontSize: '0.87rem', lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                }}>
                  {parts.map((p, i) => p.text != null
                    ? <span key={i}>{p.text}</span>
                    : (() => {
                        const route = ROUTE[p.token.type]
                        return route
                          ? <a key={i} href={`#/${route}/${p.token.id}`}
                              onClick={e => { e.preventDefault(); setOpen(false); window.location.hash = `#/${route}/${p.token.id}` }}
                              style={{ color: 'var(--mp)', textDecoration: 'underline', fontWeight: 700, cursor: 'pointer' }}>
                              {p.token.label} ↗
                            </a>
                          : <span key={i} className="badge gray" style={{ fontSize: '0.75rem' }}>{p.token.label}</span>
                      })()
                  )}
                </div>
              )
            })}
            {thinking.length > 0 && (
              <div style={{ alignSelf: 'flex-start', maxWidth: '85%' }}>
                {thinking.map((line, i) => (
                  <div key={i} className="small" style={{ color: 'var(--text-3)', fontStyle: 'italic', padding: '2px 4px' }}>
                    {line}
                  </div>
                ))}
              </div>
            )}
            {sending && thinking.length === 0 && (
              <div className="small" style={{ color: 'var(--text-3)', fontStyle: 'italic', padding: '2px 4px' }}>חושב…</div>
            )}
          </div>

          {/* Input */}
          <div style={{ borderTop: '1px solid var(--border-soft)', padding: 8, display: 'flex', gap: 6 }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="שאל את מקס…"
              rows={1}
              disabled={sending}
              style={{
                flex: 1, resize: 'none', border: '1px solid var(--border)', borderRadius: 'var(--rs)',
                padding: '8px 10px', fontSize: '0.87rem', fontFamily: 'inherit', background: 'var(--surface)',
                color: 'var(--text)', maxHeight: 80,
              }}
            />
            <button className="qa-btn icon-only" onClick={send} disabled={sending || !input.trim()} title="שליחה">
              <Icon name="reply" size={16} style={{ transform: 'scaleX(-1)' }} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
