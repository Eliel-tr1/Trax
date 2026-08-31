import EditField from './EditField'
import UserAvatar from './UserAvatar'
import { formatDateTime } from '../lib/format'

// Shared content for every record-detail page's "שדות מערכת" FieldTabs tab:
// created/updated at+by, last-status-change timestamp (when the table has a
// status_changed_at column — see data/011_status_tab_and_shared_views.sql;
// undefined on the record for tables that don't, e.g. meetings/phone_calls,
// so that row is simply skipped) and the execution_url link for
// automation-created rows. First built inline for SaleDetail.jsx, pulled
// out here so every other *Detail.jsx page renders the identical fields the
// identical way instead of re-deriving the created_by/updated_by lookup.
export default function SystemFieldsTab({ record, users }) {
  const userFor = (id) => (id ? users?.find(u => u.id === id) : null)
  const byLine = (id) => id
    ? <UserAvatar user={userFor(id)} showName />
    : <span className="muted">מערכת</span>

  return (
    <>
      <EditField label="נוצר בתאריך" value={record.created_at} display={formatDateTime(record.created_at)}
        readOnly readOnlyReason="נחתם אוטומטית ביצירת הרשומה" />
      <div className="ef">
        <span className="ef-label">נוצר על ידי</span>
        <span className="ef-val">{byLine(record.created_by)}</span>
      </div>
      <EditField label="עודכן בתאריך" value={record.updated_at} display={formatDateTime(record.updated_at)}
        readOnly readOnlyReason="מתעדכן אוטומטית בכל שינוי" />
      <div className="ef">
        <span className="ef-label">עודכן על ידי</span>
        <span className="ef-val">{byLine(record.updated_by)}</span>
      </div>
      {'status_changed_at' in record && (
        <EditField label="תאריך עדכון סטטוס אחרון" value={record.status_changed_at} display={formatDateTime(record.status_changed_at)}
          readOnly readOnlyReason="מתעדכן אוטומטית כשסטטוס/שלב הרשומה משתנה" />
      )}
      {record.execution_url && (
        <EditField label="הרצת אוטומציה" value={record.execution_url} type="link"
          readOnly readOnlyReason="הרשומה נוצרה או עודכנה על ידי אוטומציה חיצונית (למשל n8n)" />
      )}
    </>
  )
}
