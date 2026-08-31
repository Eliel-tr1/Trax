import { useEffect, useState } from 'react'
import Icon from './Icon'

// Header icon toggle for light/dark. index.css already ships a full
// `:root[data-theme="dark"]` palette (feature audit item #1) — this is the
// only piece that was missing. main.jsx applies the saved value on load
// (`document.documentElement.dataset.theme = localStorage.getItem('theme')`),
// so this component only needs to flip it and persist the change; a second,
// labelled control lives in Settings ← תצוגה for anyone who doesn't spot the
// icon (see Settings.jsx's AppearanceTab).
export function applyTheme(t) {
  document.documentElement.dataset.theme = t
  try { localStorage.setItem('theme', t) } catch { /* ignore */ }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light')

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme || 'light')
  }, [])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  return (
    <button className="btn ghost sm" style={{ width: 36, padding: 0 }} title={theme === 'dark' ? 'עבור לתצוגה בהירה' : 'עבור לתצוגה כהה'} onClick={toggle}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
    </button>
  )
}
