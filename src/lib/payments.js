// TRAX-specific payment/registration helpers (Wave 2 uses this; Wave 1
// doesn't have registration screens yet, but the schema and seat-count
// triggers already exist — see data/001_init_schema.sql).
//
// Deliberately NOT a port of bina-crm's lib/finance.js (that file encodes
// bina's specific financing/instalment math, which doesn't apply here).
import { REGISTRATION_STATUSES } from './constants'
import { formatCurrency } from './format'

// Registration payment status progression: משוריין → שולמה מקדמה → שולם במלואו (→ בוטל any time).
export const REGISTRATION_STATUS_ORDER = ['משוריין', 'שולמה מקדמה', 'שולם במלואו']

export function nextRegistrationStatus(current) {
  const i = REGISTRATION_STATUS_ORDER.indexOf(current)
  if (i === -1 || i === REGISTRATION_STATUS_ORDER.length - 1) return current
  return REGISTRATION_STATUS_ORDER[i + 1]
}

export function isActiveRegistrationStatus(status) {
  return status !== 'בוטל'
}

// Multi-currency display — NEVER sum amounts across currencies (per spec,
// domain-model.md "Dashboards": "never summed across currencies without an
// explicit conversion"). Each amount is formatted with its own symbol.
export function formatMoney(amount, currency) {
  return formatCurrency(amount, currency)
}

// Group a set of currency-tagged amounts by currency and sum WITHIN each
// currency only — the one safe way to aggregate money in this app.
export function sumByCurrency(rows, amountField = 'amount_paid', currencyField = 'currency') {
  const totals = {}
  for (const r of rows || []) {
    const cur = r[currencyField] || 'ללא מטבע'
    const amt = Number(r[amountField]) || 0
    totals[cur] = (totals[cur] || 0) + amt
  }
  return totals // { EUR: 1200, ILS: 300, ... }
}

export function formatMoneyTotals(totals) {
  return Object.entries(totals)
    .map(([cur, amt]) => formatMoney(amt, cur))
    .join(' + ')
}

export { REGISTRATION_STATUSES }
