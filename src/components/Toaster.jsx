import { useEffect, useState } from 'react'

// Tiny global toast: window.dispatchEvent(new CustomEvent('toast', { detail: { text, kind } }))
export function toast(text, kind = 'ok') {
  window.dispatchEvent(new CustomEvent('toast', { detail: { text, kind } }))
}

export default function Toaster() {
  const [items, setItems] = useState([])
  useEffect(() => {
    const h = (e) => {
      const id = Math.random().toString(36).slice(2)
      setItems(list => [...list.slice(-2), { id, ...e.detail }])
      setTimeout(() => setItems(list => list.filter(x => x.id !== id)), 2200)
    }
    window.addEventListener('toast', h)
    return () => window.removeEventListener('toast', h)
  }, [])
  if (!items.length) return null
  return (
    <div style={{ position: 'fixed', bottom: 22, insetInlineStart: '50%', transform: 'translateX(50%)', zIndex: 200, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      {items.map(t => (
        <div key={t.id} className="toast-item" style={{
          background: t.kind === 'err' ? 'var(--err)' : 'var(--dp)', color: '#fff',
          borderRadius: 50, padding: '8px 18px', fontSize: '0.85rem', fontWeight: 600, boxShadow: 'var(--sh2)',
        }}>{t.text}</div>
      ))}
    </div>
  )
}
