import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, MousePointerClick, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { Button } from './ui/button'

/* Guided tour for a new TRAX user — mechanism ported from bina-crm's
   Onboarding.jsx (spotlight highlighting drawn as four dim panels around the
   target so it stays genuinely clickable, info steps the user advances vs.
   action steps that wait for a real click), with entirely new steps written
   for TRAX's own screens (see docs/bina-crm-feature-audit.md item 7):
   welcome -> sidebar -> business-unit switcher (the single most important
   concept in the app) -> click into לקוחות -> list features -> open a real
   customer -> record features (related chips / feed / audit footer) ->
   profile/settings entry point. */

const EVT = 'trax:onboarding'
export const startOnboarding = () => window.dispatchEvent(new CustomEvent(EVT))

const hash = () => window.location.hash.replace(/^#/, '') || '/'
const onCustomerRecord = () => /^\/customers\/[0-9a-f-]{8,}/i.test(hash())

const STEPS = [
  {
    title: 'ברוכים הבאים ל-TRAX CRM',
    body: 'סיור קצר שבו תפעילו את המערכת בעצמכם. בשלבים המסומנים בכתום - הלחיצה שלכם היא זו שמקדמת את הסיור. אפשר לצאת בכל רגע ולהריץ שוב מהפרופיל.',
  },
  {
    target: '[data-slot="sidebar"]',
    title: 'תפריט הצד',
    body: 'כל המסכים מסודרים כאן לפי קבוצות: מכירות, מסעות, ופעילות. סדר הפריטים ואילו יופיעו ניתנים להתאמה אישית מהפרופיל שלכם.',
  },
  {
    target: '[data-tour="bu-switcher"]',
    title: 'יחידה עסקית - הדבר הכי חשוב במערכת',
    body: 'TRAX ו-Xcon הן שתי יחידות עסקיות נפרדות לגמרי. הבורר הזה קובע איזו יחידה רואים בכל מסך רשימה ובכל טופס יצירה - שום נתון של יחידה אחת לא אמור להופיע כשבוחרים את השנייה. תזכרו את זה לפני כל חיפוש שנראה "חסר תוצאות".',
  },

  // ---- from here the user drives ----
  {
    action: true,
    target: '[data-tour-nav="/customers"]',
    fallbackTarget: '[data-slot="sidebar"]',
    title: 'עכשיו אתם',
    body: 'לחצו על "לקוחות" בתפריט הצד, תחת קבוצת "מכירות".',
    done: () => hash() === '/customers',
  },
  {
    target: 'main',
    title: 'מסך רשימה',
    body: 'כל מסכי הרשימה עובדים אותו דבר: סינון מהיר, חיפוש חופשי, מיון בלחיצה על כותרת עמודה, ובחירת עמודות להצגה מכפתור העמודות. עריכה בתא בודד אפשרית ישירות מתוך הטבלה.',
  },
  {
    target: '[data-tour="new-record"]',
    title: 'פתיחת לקוח חדש',
    body: 'הכפתור הזה פותח לקוח חדש: ממלאים פרטים, שומרים - והמערכת פותחת את הכרטיס. אותו כפתור קיים בכל מסך רשימה שתומך ביצירה.',
  },
  {
    action: true,
    // The name cell, not the whole row: TRAX's DataTable's first column is
    // the row-select checkbox, so the second is the real content column.
    target: '.rl-table table tbody tr:first-child td:nth-child(2)',
    fallbackTarget: 'main',
    title: 'פתחו כרטיס',
    body: 'לחצו על שם הלקוח המסומן כדי לפתוח את הכרטיס שלו. אם אין עדיין אף לקוח ביחידה הזו, לחצו "דילוג על השלב" למטה.',
    done: onCustomerRecord,
  },
  {
    target: '[data-tour="rec-related"]',
    title: 'אובייקטים מקושרים',
    body: 'לרוב הרשומות יש רשומות קשורות: ללקוח יש מכירות ואנשי קשר, למכירה עשוי להיות מסע ורישום. השבבים כאן מראים כמה יש מכל סוג, לחיצה קופצת אליהם, וכפתור ה-+ פותח חדש שכבר מקושר לרשומה הזו.',
    when: onCustomerRecord,
  },
  {
    target: '[data-tour="rec-fields"]',
    title: 'שדות הרשומה',
    body: 'לחיצה על ערך פותחת אותו לעריכה במקום, והשינוי נשמר מיד - אין מצב "עריכה" נפרד ואין כפתור שמירה נפרד לכל שדה.',
    when: onCustomerRecord,
  },
  {
    target: '[data-tour="rec-composer"]',
    title: 'איך כותבים הערה',
    body: 'כותבים בתיבה ולוחצים "פרסם". אפשר לצרף קובץ, ואפשר להחליף ל"משימה" - אז מוסיפים תאריך יעד, עדיפות ואחראי, והמשימה תופיע אצלו במסך "המשימות שלי".',
    when: onCustomerRecord,
  },
  {
    target: '[data-tour="rec-feed"]',
    title: 'יומן הפעילות',
    body: 'כל מה שקרה לרשומה במקום אחד: הערות, משימות וקבצים מצורפים, לפי סדר כרונולוגי. בתחתית כל רשומה (מתחת לשדות) מופיע גם תיעוד מי יצר ומי עדכן לאחרונה.',
    when: onCustomerRecord,
  },
  {
    target: '[data-tour="sidebar-user"]',
    title: 'הפרופיל וההגדרות שלכם',
    body: 'השם והתמונה בתחתית התפריט הם הכניסה לפרופיל האישי: שם, טלפון, תמונה, סיסמה, סדר התפריט, והפעלה חוזרת של הסיור הזה. הגדרות המערכת (תפקידים, שדות מותאמים, מפתחות API ועוד) נמצאות תחת "הגדרות" בתחתית התפריט.',
  },
  {
    title: 'זהו, אתם מוכנים',
    body: 'הסיור זמין תמיד מהפרופיל שלכם. בהצלחה!',
  },
]

export default function Onboarding() {
  const { rep, user, fetchRep } = useAuthStore()
  const [active, setActive] = useState(false)
  const [i, setI] = useState(0)
  const [box, setBox] = useState(null)
  const [pos, setPos] = useState(null)
  const started = useRef(false)
  const cardRef = useRef(null)
  const timers = useRef([])

  const steps = STEPS
  const step = steps[i]

  useEffect(() => {
    const on = () => { setI(0); setActive(true) }
    window.addEventListener(EVT, on)
    return () => window.removeEventListener(EVT, on)
  }, [])

  // First login only, tracked via app_users.prefs.onboardingDone.
  useEffect(() => {
    if (started.current || !rep) return
    started.current = true
    if (!rep.prefs?.onboardingDone) { setI(0); setActive(true) }
  }, [rep])

  useEffect(() => {
    if (!active || !step) return
    setBox(null); setPos(null)
    let tries = 0
    const tick = () => {
      const sel = step.target
      if (!sel) { setBox('center'); return }
      const el = document.querySelector(sel)
      if (el) {
        const r = el.getBoundingClientRect()
        if (r.width && r.height && r.bottom > 0 && r.top < window.innerHeight) {
          setBox({ top: r.top, left: r.left, width: r.width, height: r.height }); return
        }
      }
      if (tries > 12 && step.fallbackTarget) {
        const fb = document.querySelector(step.fallbackTarget)
        if (fb) {
          const r = fb.getBoundingClientRect()
          setBox({ top: r.top, left: r.left, width: r.width, height: r.height }); return
        }
      }
      if (++tries > 30) { setBox('center'); return }
      timers.current.push(setTimeout(tick, 150))
    }
    timers.current.push(setTimeout(tick, 250))
    return () => { timers.current.forEach(clearTimeout); timers.current = [] }
  }, [active, i])

  useEffect(() => {
    if (!active || !step?.action || !step.done) return
    if (step.done()) { setI(x => x + 1); return }
    const id = setInterval(() => { if (step.done()) { clearInterval(id); setI(x => x + 1) } }, 250)
    return () => clearInterval(id)
  }, [active, i, step])

  useEffect(() => {
    if (!active || !step?.when) return
    const id = setInterval(() => { if (!step.when()) { clearInterval(id); setI(x => x + 1) } }, 400)
    return () => clearInterval(id)
  }, [active, i, step])

  useLayoutEffect(() => {
    if (!active || !box) return
    const card = cardRef.current
    if (!card) return
    const cw = card.offsetWidth || 360
    const ch = card.offsetHeight || 180
    const vw = window.innerWidth, vh = window.innerHeight
    const gap = 14, edge = 8

    if (box === 'center') {
      setPos({ top: Math.round((vh - ch) / 2), left: Math.round((vw - cw) / 2) })
      return
    }
    const below = vh - (box.top + box.height) - gap
    const above = box.top - gap
    const rightGap = vw - (box.left + box.width) - gap
    const leftGap = box.left - gap

    let top, left
    if (below >= ch) { top = box.top + box.height + gap; left = box.left + box.width / 2 - cw / 2 }
    else if (above >= ch) { top = box.top - gap - ch; left = box.left + box.width / 2 - cw / 2 }
    else if (rightGap >= cw) { left = box.left + box.width + gap; top = box.top + box.height / 2 - ch / 2 }
    else if (leftGap >= cw) { left = box.left - gap - cw; top = box.top + box.height / 2 - ch / 2 }
    else { top = (vh - ch) / 2; left = (vw - cw) / 2 }

    setPos({
      top: Math.round(Math.min(Math.max(edge, top), vh - ch - edge)),
      left: Math.round(Math.min(Math.max(edge, left), vw - cw - edge)),
    })
  }, [active, box, i])

  useEffect(() => {
    if (!active || !step?.target) return
    const sync = () => {
      const el = document.querySelector(step.target)
      if (!el) return
      const r = el.getBoundingClientRect()
      if (r.width && r.height) setBox({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, true)
    return () => { window.removeEventListener('resize', sync); window.removeEventListener('scroll', sync, true) }
  }, [active, i, step])

  const finish = async () => {
    setActive(false)
    if (rep) {
      await supabase.from('app_users')
        .update({ prefs: { ...(rep.prefs || {}), onboardingDone: true } }).eq('id', rep.id)
      await fetchRep(user)
    }
  }

  if (!active || !step || !box) return null

  const pad = 6
  const spot = box === 'center' ? null : (() => {
    const top = Math.max(box.top, 0)
    const left = Math.max(box.left, 0)
    return {
      top, left,
      height: Math.min(box.top + box.height, window.innerHeight) - top,
      width: Math.min(box.left + box.width, window.innerWidth) - left,
    }
  })()
  const last = i === steps.length - 1

  return (
    <div className="pointer-events-none fixed inset-0 z-[100]" role="dialog" aria-modal="false" aria-label="סיור הדרכה">
      {spot ? (
        <>
          <div className="pointer-events-auto absolute inset-x-0 top-0 bg-black/60" style={{ height: Math.max(0, spot.top - pad) }} />
          <div className="pointer-events-auto absolute inset-x-0 bottom-0 bg-black/60" style={{ top: spot.top + spot.height + pad }} />
          <div className="pointer-events-auto absolute bg-black/60"
            style={{ top: spot.top - pad, height: spot.height + pad * 2, left: 0, width: Math.max(0, spot.left - pad) }} />
          <div className="pointer-events-auto absolute bg-black/60"
            style={{ top: spot.top - pad, height: spot.height + pad * 2, left: spot.left + spot.width + pad, right: 0 }} />
          <div className={`pointer-events-none absolute rounded-lg ring-2 ${step.action ? 'animate-pulse ring-amber-300' : 'ring-white'}`}
            style={{ top: spot.top - pad, left: spot.left - pad, width: spot.width + pad * 2, height: spot.height + pad * 2 }} />
        </>
      ) : <div className="pointer-events-auto absolute inset-0 bg-black/60" />}

      <div ref={cardRef} dir="rtl"
        className="bg-popover text-popover-foreground pointer-events-auto absolute w-[360px] rounded-xl p-4 shadow-2xl"
        style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}>
        <div className="mb-1 flex items-start gap-2">
          <h3 className="flex-1 text-base font-semibold">{step.title}</h3>
          <Button variant="ghost" size="icon" className="-mt-1 size-7" aria-label="סגירה" onClick={finish}>
            <X className="size-4" />
          </Button>
        </div>
        <p className="text-muted-foreground mb-3 text-sm leading-relaxed">{step.body}</p>

        {step.action && (
          <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            <MousePointerClick className="size-3.5 shrink-0" /> הסיור ימשיך אחרי שתלחצו
          </p>
        )}

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">{i + 1} / {steps.length}</span>
          <div className="flex-1" />
          {i > 0 && (
            <Button variant="outline" size="sm" onClick={() => setI(i - 1)}>
              <ArrowRight className="size-3.5" /> הקודם
            </Button>
          )}
          {step.action ? (
            <Button variant="ghost" size="sm" onClick={() => setI(i + 1)}>דילוג על השלב</Button>
          ) : last ? (
            <Button size="sm" onClick={finish}>סיום</Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={finish}>יציאה</Button>
              <Button size="sm" onClick={() => setI(i + 1)}>הבא <ArrowLeft className="size-3.5" /></Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
