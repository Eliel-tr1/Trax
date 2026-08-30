import { useEffect } from 'react'
import Icon from './Icon'

// Reusable modal overlay. Close on backdrop click or Esc.
export default function Modal({ title, icon = 'plus', onClose, children, maxWidth = 460 }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,10,40,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth, boxShadow: 'var(--sh3)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center' }}>
          <Icon name={icon} /> <span style={{ flex: 1 }}>{title}</span>
          <button className="btn subtle sm" onClick={onClose} style={{ padding: '3px 7px' }}><Icon name="x" size={15} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
