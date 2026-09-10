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