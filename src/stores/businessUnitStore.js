import { create } from 'zustand'

/* Global business-unit filter — TRAX / Xcon.

   This is THE cross-cutting rule in the spec (docs/architecture.md): nothing
   in one business unit may ever show data from the other. Every list screen
   filters on it, every create-form defaults to it. Persisted to
   localStorage so a reload doesn't silently drop back to showing both. */
const STORAGE_KEY = 'trax_business_unit'
const VALID = ['TRAX', 'Xcon']

const stored = (() => {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return VALID.includes(v) ? v : 'TRAX'
  } catch { return 'TRAX' }
})()

export const useBusinessUnitStore = create((set) => ({
  unit: stored,
  setUnit: (unit) => {
    if (!VALID.includes(unit)) return
    try { localStorage.setItem(STORAGE_KEY, unit) } catch { /* ignore */ }
    set({ unit })
  },
}))
