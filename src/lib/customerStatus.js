import { supabase } from './supabase'

// Customer status auto-derivation from the customer's sales history
// (Sahar 10.09, client rules). Called after any sale stage change:
//
//   לקוח פעיל      — the customer has at least ONE sale ever closed as
//                    'נסגר בהצלחה' (won). Sticky: later lost deals never
//                    downgrade them.
//   עסקה הופסדה    — the customer has sales, and EVERY one of them is lost.
//                    Only reachable if they never won anything.
//   ליד חדש        — has at least one open (not-yet-decided) sale and never
//                    won. (Open sales + a past lost sale still = ליד חדש.)
//
// Other statuses (בטיפול / לקוח עבר / לא רלוונטי) are hand-set and this
// function never overwrites them — only the three derived ones above are
// written, and only when the derivation actually changes the value.
export const WON_STAGE = 'נסגר בהצלחה'
export const LOST_STAGE = 'עסקה הופסדה'

export async function recalcCustomerStatus(customerId) {
  if (!customerId) return
  const { data: sales, error } = await supabase
    .from('sales')
    .select('stage')
    .eq('customer_id', customerId)
    .is('deleted_at', null)
  if (error || !sales?.length) return

  const everWon = sales.some(s => s.stage === WON_STAGE)
  const allLost = sales.every(s => s.stage === LOST_STAGE)
  const hasOpen = sales.some(s => s.stage !== WON_STAGE && s.stage !== LOST_STAGE)

  let derived = null
  if (everWon) derived = 'לקוח פעיל'
  else if (allLost) derived = 'עסקה הופסדה'
  else if (hasOpen) derived = 'ליד חדש'
  // (a customer with only won sales = לקוח פעיל; can't reach here without sales)
  if (!derived) return

  const { data: cur, error: curErr } = await supabase
    .from('customers')
    .select('status')
    .eq('id', customerId)
    .single()
  if (curErr || !cur) return
  // never downgrade a hand-set operational status; only move between the
  // three derived ones (or from any status INTO לקוח פעיל — winning is
  // definitive regardless of what the rep had set).
  const handSet = ['בטיפול', 'לקוח עבר', 'לא רלוונטי']
  if (handSet.includes(cur.status) && derived !== 'לקוח פעיל') return
  if (cur.status === derived) return

  await supabase.from('customers').update({ status: derived }).eq('id', customerId)
}