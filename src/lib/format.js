// Global display-formatting helpers — date/time, numbers and currency.
// Every ad-hoc `toLocaleDateString`/`toLocaleString`/manual date format in
// the app should go through these instead, so formatting stays consistent
// app-wide. See also PhoneInput.jsx for phone number display/edit.

const pad2 = (n) => String(n).padStart(2, '0')

function toDate(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return isNaN(d.getTime()) ? null : d
}

// 'DD/MM/YYYY - HH:mm' — e.g. 31/08/2026 - 12:30
export function formatDateTime(value) {
  const d = toDate(value)
  if (!d) return '-'
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} - ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

// 'DD/MM/YYYY' — date-only fields
export function formatDate(value) {
  const d = toDate(value)
  if (!d) return '-'
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`
}

// Thousands separator — e.g. 10000 -> '10,000'
export function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '-'
  const n = Number(value)
  if (isNaN(n)) return '-'
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

// Seconds -> a short readable Hebrew duration.
// Under an hour: 'N דקות' (or 'פחות מדקה'). An hour or more: 'H:MM שעות'.
export function formatDuration(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined || totalSeconds === '') return '-'
  const s = Number(totalSeconds)
  if (isNaN(s) || s < 0) return '-'
  const minutes = Math.round(s / 60)
  if (minutes < 60) return minutes < 1 ? 'פחות מדקה' : `${minutes} דקות`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}:${pad2(mins)} שעות`
}

const CURRENCY_SYMBOLS = { ILS: '₪', USD: '$', EUR: '€' }

// Appends the right symbol next to the formatted number. ILS reads with the
// symbol after the number ("10,000 ₪"); USD/EUR read naturally before it
// ("$10,000" / "€10,000") — matches how these are normally written.
export function formatCurrency(value, currency = 'ILS') {
  if (value === null || value === undefined || value === '') return '-'
  const num = formatNumber(value)
  if (num === '-') return '-'
  const symbol = CURRENCY_SYMBOLS[currency] || currency || ''
  if (!symbol) return num
  return currency === 'ILS' ? `${num} ${symbol}` : `${symbol}${num}`
}
