// Small inline logo for lead-source (מקור הגעה) values — Sahar 10.09:
// show the arrival-channel logo (Facebook / Instagram / blue globe for
// אתר TRAX + דף נחיתה) next to the value in BOTH the tables and the record
// screens, as a tiny icon that doesn't change the field's size.
// Pure inline SVG (no network, no icon package) — matches the app's
// self-contained badge/lock icon pattern (EditField's ro-lock).
// Sources without a logo (גוגל, המלצה, אחר) render text only.
import { useId } from 'react'

// Duplicate <radialGradient id> across many rows on one page breaks SVG
// gradients: all url(#id) refs resolve to the FIRST matching element in the
// document, and if that instance's SVG is hidden (e.g. an unmounted tab
// panel) the gradient can resolve empty and the rect renders invisible.
// useId() gives every instance its own gradient id.
export default function LeadSourceIcon({ value }) {
  const gid = useId()
  const ICONS = {
    'פייסבוק': (
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="#1877F2" />
        <path fill="#fff" d="M16.4 15.5l.5-3.2h-3.1v-2.1c0-.9.4-1.7 1.8-1.8h1.4V5.7s-1.3-.2-2.5-.2c-2.6 0-4.3 1.6-4.3 4.4v2.4H7.5v3.2h2.7V23a11 11 0 0 0 3.4 0v-7.5h2.7z" />
      </svg>
    ),
    'אינסטגרם': (
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <radialGradient id={gid} cx="0.3" cy="1.1" r="1.3">
            <stop offset="0" stopColor="#FDC468" />
            <stop offset="0.45" stopColor="#DF4996" />
            <stop offset="1" stopColor="#7A3DD8" />
          </radialGradient>
        </defs>
        <rect x="1" y="1" width="22" height="22" rx="6" fill={`url(#${gid})`} />
        <circle cx="12" cy="12" r="4.6" fill="none" stroke="#fff" strokeWidth="1.9" />
        <circle cx="17.2" cy="6.8" r="1.3" fill="#fff" />
      </svg>
    ),
    'גוגל': (
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="#fff" />
        <circle cx="12" cy="12" r="11" fill="none" stroke="#e8eaed" strokeWidth="1" />
        <path fill="#4285F4" d="M21.35 12.2c0-.7-.06-1.36-.18-2H12v3.8h5.24a4.49 4.49 0 0 1-1.95 2.95v2.45h3.16c1.85-1.7 2.9-4.22 2.9-7.2z" />
        <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.45-2.43l-3.16-2.45c-.88.59-2 .94-2.84.94-2.34 0-4.32-1.58-5.03-3.7H3.7v2.53A9 9 0 0 0 12 22z" />
        <path fill="#FBBC05" d="M6.97 14.36a5.4 5.4 0 0 1 0-3.45V8.38H3.7a9 9 0 0 0 0 8.1l3.27-2.12z" />
        <path fill="#EA4335" d="M12 5.5c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 3.7 8.38l3.27 2.53C7.68 8.8 9.66 5.37 12 5.37z" />
      </svg>
    ),
    'אתר TRAX': (
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="#1E7BE0" />
        <g fill="none" stroke="#fff" strokeWidth="1.5">
          <circle cx="12" cy="12" r="8" />
          <ellipse cx="12" cy="12" rx="3.6" ry="8" />
          <path d="M4.3 9.5h15.4M4.3 14.5h15.4" />
        </g>
      </svg>
    ),
    'דף נחיתה': (
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="#1E7BE0" />
        <g fill="none" stroke="#fff" strokeWidth="1.5">
          <circle cx="12" cy="12" r="8" />
          <ellipse cx="12" cy="12" rx="3.6" ry="8" />
          <path d="M4.3 9.5h15.4M4.3 14.5h15.4" />
        </g>
      </svg>
    ),
  }
  const icon = ICONS[value]
  if (!icon) return null
  return (
    <span className="ls-icon" style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      {icon}
    </span>
  )
}

// Icon + text in one compact line (nowrap so a tight saved column width
// never wraps the label under the icon). Used for table cells + record
// field displays.
export function LeadSourceLabel({ value }) {
  if (!value) return '-'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
      <LeadSourceIcon value={value} />
      {value}
    </span>
  )
}