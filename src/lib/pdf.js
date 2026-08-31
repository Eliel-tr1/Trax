import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { formatDate, formatDateTime, formatNumber } from './format'

// Journey PDF export (JourneyDetail's "ייצא PDF" button).
//
// jsPDF's built-in fonts (Helvetica etc.) only cover WinAnsi — they can't
// render Hebrew glyphs at all. Embedding a Hebrew font instead would bloat
// the bundle by hundreds of KB. So instead of drawing text with jsPDF's
// text API, this renders a plain HTML fragment (the browser's own font
// stack, which already handles Hebrew correctly) into a canvas via
// html2canvas, then drops that canvas into the PDF as a paginated image.
// Slightly heavier than pure vector text, but the only realistic way to
// get correct, readable Hebrew out of jsPDF without shipping a font file.
const fmtDate = formatDate
const fmtDateTime = formatDateTime
const CURRENCY_LABEL = { EUR: 'יורו', ILS: 'שקל', USD: 'דולר' }

function esc(v) {
  if (v === null || v === undefined || v === '') return '-'
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildHtml(journey, groups) {
  const totalPassengers = groups.reduce((n, g) => n + g.passengers.length, 0)
  const rows = groups.map(g => {
    const regHeader = `
      <tr class="reg-row">
        <td colspan="7">${esc(g.registration.registration_name || 'הרשמה')}, סטטוס: ${esc(g.registration.status)}${g.registration.amount_paid != null ? ` · שולם: ${esc(formatNumber(g.registration.amount_paid))} ${CURRENCY_LABEL[g.registration.currency] || g.registration.currency || ''}` : ''}</td>
      </tr>`
    const passengerRows = g.passengers.length
      ? g.passengers.map(p => `
        <tr>
          <td>${p.is_primary ? '<span class="tag">לקוח</span> ' : ''}${esc(p.full_name)}</td>
          <td dir="ltr">${esc(p.phone)}</td>
          <td dir="ltr">${esc(p.email)}</td>
          <td>${esc(p.age)}</td>
          <td>${esc(p.gender)}</td>
          <td>${esc(p.medical_notes)}</td>
          <td>${esc(p.dietary_notes)}</td>
        </tr>`).join('')
      : `<tr><td colspan="7" class="muted">אין נוסעים רשומים</td></tr>`
    return regHeader + passengerRows
  }).join('')

  return `
    <div style="direction:rtl; font-family: Arial, 'Segoe UI', sans-serif; width: 740px; padding: 24px; color:#1a1a1a; background:#fff;">
      <div style="font-size:20px; font-weight:700; margin-bottom:4px;">${esc(journey.name)}</div>
      <div style="font-size:12px; color:#555; margin-bottom:16px;">דוח מסע, הופק ב-${fmtDateTime(new Date())}</div>

      <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:20px;">
        <tbody>
          <tr><td style="padding:4px 8px; font-weight:700; width:130px;">יעד</td><td style="padding:4px 8px;">${esc(journey.destination)}</td>
              <td style="padding:4px 8px; font-weight:700; width:130px;">יחידה עסקית</td><td style="padding:4px 8px;">${esc(journey.business_unit)}</td></tr>
          <tr><td style="padding:4px 8px; font-weight:700;">תאריך יציאה</td><td style="padding:4px 8px;">${fmtDate(journey.departure_date)}</td>
              <td style="padding:4px 8px; font-weight:700;">תאריך חזרה</td><td style="padding:4px 8px;">${fmtDate(journey.return_date)}</td></tr>
          <tr><td style="padding:4px 8px; font-weight:700;">סטטוס יציאה</td><td style="padding:4px 8px;">${esc(journey.status)}</td>
              <td style="padding:4px 8px; font-weight:700;">מספר מקומות</td><td style="padding:4px 8px;">${esc(journey.seats_total)}</td></tr>
          <tr><td style="padding:4px 8px; font-weight:700;">מחיר לאדם</td><td style="padding:4px 8px;">${journey.price_per_person != null ? esc(journey.price_per_person) + ' ' + (CURRENCY_LABEL[journey.currency] || journey.currency || '') : '-'}</td>
              <td style="padding:4px 8px; font-weight:700;">נוסעים סה"כ</td><td style="padding:4px 8px;">${totalPassengers}</td></tr>
        </tbody>
      </table>

      <div style="font-size:15px; font-weight:700; margin-bottom:8px;">נוסעים לפי הרשמה</div>
      <table style="width:100%; border-collapse:collapse; font-size:11.5px;">
        <thead>
          <tr style="background:#f0f0f0;">
            <th style="text-align:right; padding:6px 8px; border-bottom:1px solid #ccc;">שם מלא</th>
            <th style="text-align:right; padding:6px 8px; border-bottom:1px solid #ccc;">טלפון</th>
            <th style="text-align:right; padding:6px 8px; border-bottom:1px solid #ccc;">אימייל</th>
            <th style="text-align:right; padding:6px 8px; border-bottom:1px solid #ccc;">גיל</th>
            <th style="text-align:right; padding:6px 8px; border-bottom:1px solid #ccc;">מין</th>
            <th style="text-align:right; padding:6px 8px; border-bottom:1px solid #ccc;">מגבלות רפואיות/פיזיות</th>
            <th style="text-align:right; padding:6px 8px; border-bottom:1px solid #ccc;">העדפות תזונה</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <style>
        .reg-row td { padding:10px 8px 4px; font-weight:700; background:#fafafa; border-top:1px solid #ddd; }
        td { padding:6px 8px; border-bottom:1px solid #eee; vertical-align:top; }
        .tag { display:inline-block; background:#e8dfff; color:#5b2ea6; border-radius:4px; padding:1px 6px; font-size:10.5px; font-weight:700; }
        .muted { color:#999; padding:8px; }
      </style>
    </div>`
}

export async function exportJourneyPdf(journey, groups) {
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '-10000px'
  container.style.left = '0'
  container.style.zIndex = '-1'
  container.innerHTML = buildHtml(journey, groups)
  document.body.appendChild(container)

  try {
    const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff' })
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const imgWidth = pageWidth
    const imgHeight = (canvas.height * imgWidth) / canvas.width

    let heightLeft = imgHeight
    let position = 0
    const imgData = canvas.toDataURL('image/png')

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight
    while (heightLeft > 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
    }

    pdf.save(`${journey.name || 'מסע'}.pdf`)
  } finally {
    document.body.removeChild(container)
  }
}
