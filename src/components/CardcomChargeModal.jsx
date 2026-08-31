import { useEffect, useState } from 'react'
import { loadSystemSetting } from '../lib/api'
import { DEFAULT_CARDCOM_PAYMENT_URL } from '../lib/constants'
import Modal from './Modal'

// "חיוב לקוח באשראי" — opens the Cardcom hosted payment page inside an
// iframe. The URL lives in system_settings.cardcom_payment_url (Settings >
// פרטי מערכת) so swapping the placeholder for the real client link later is
// a one-line DB edit, not a code change — DEFAULT_CARDCOM_PAYMENT_URL is
// only a fallback if that row is ever missing.
// Cardcom's page is cross-origin: we can only embed it, never read its
// state (success/failure) from here — the iframe is otherwise fully
// interactive (the user fills in the card form themselves), the modal
// itself is just the closeable frame around it.
export default function CardcomChargeModal({ onClose }) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    let live = true
    loadSystemSetting('cardcom_payment_url').then(v => { if (live) setUrl(v || DEFAULT_CARDCOM_PAYMENT_URL) })
    return () => { live = false }
  }, [])

  return (
    <Modal title="חיוב לקוח באשראי" icon="money" onClose={onClose} maxWidth={640}>
      <div style={{ height: '70vh', minHeight: 420, marginTop: 4 }}>
        {url ? (
          <iframe
            src={url}
            title="חיוב אשראי - Cardcom"
            style={{ width: '100%', height: '100%', border: '1px solid var(--border-soft)', borderRadius: 'var(--rs)' }}
          />
        ) : (
          <div className="empty"><span className="spinner" /></div>
        )}
      </div>
    </Modal>
  )
}
