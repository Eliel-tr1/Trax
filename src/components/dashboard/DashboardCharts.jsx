// Reusable chart primitives for the 3-tab Dashboard (src/pages/Dashboard.jsx).
// Built per the `dataviz` skill: categorical hues assigned in FIXED order
// (never cycled/re-ranked when a filter changes survivors), thin marks with
// rounded data-ends, a legend for >=2 series, a hover tooltip on every mark,
// and an entrance animation that only plays once per mount/tab-switch (not
// on every filter change — see the `animKey` prop threaded from Dashboard).
//
// Palette: the dataviz skill's validated default categorical 8-hue set
// (references/palette.md), reproduced verbatim as CSS vars scoped to
// `.dviz` — light values below, dark values re-pointed under
// :root[data-theme="dark"] .dviz. This is the *pre-validated* instance from
// the skill, so no separate validator run was needed for these exact hexes.
import { useEffect, useRef, useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

export const CAT_COLORS = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)', 'var(--cat-7)', 'var(--cat-8)']

// Stable color assignment: a given label always gets the same hue, in the
// order it was first seen — so filtering never repaints survivors.
const labelColorMap = new Map()
export function colorFor(label) {
  if (!labelColorMap.has(label)) labelColorMap.set(label, CAT_COLORS[labelColorMap.size % CAT_COLORS.length])
  return labelColorMap.get(label)
}

export function DvizRoot({ children, className = '' }) {
  return <div className={`dviz ${className}`}>{children}</div>
}

// Hook: true once the element has mounted for the current `animKey` (tab
// switch / first paint), used to gate the CSS entrance transition so it
// fires once and never replays on a filter-driven data refresh.
export function useEntrance(animKey) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setReady(false)
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)))
    return () => cancelAnimationFrame(t)
  }, [animKey])
  return ready
}

export function StatTile({ label, value, sub, tooltip }) {
  const el = (
    <div className="dviz-tile">
      <div className="dviz-tile-label">{label}</div>
      <div className="dviz-tile-value">{value}</div>
      {sub && <div className="dviz-tile-sub">{sub}</div>}
    </div>
  )
  if (!tooltip) return el
  return (
    <Tooltip>
      <TooltipTrigger asChild><div>{el}</div></TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

// Horizontal bar list — categorical identity per label, direct value label,
// hover tooltip with the exact breakdown, animated width draw-in gated by
// `animate`.
export function BarChart({ items, animate = true, unit = '', formatValue, showLegend = false }) {
  const max = Math.max(...items.map(i => i.value), 1)
  const fmt = formatValue || ((v) => `${v}${unit}`)
  if (!items.length) return <div className="dviz-empty">אין נתונים</div>
  return (
    <div className="dviz-barlist">
      {items.map((it, i) => {
        const color = it.color || colorFor(it.label)
        const pct = max ? (it.value / max) * 100 : 0
        return (
          <Tooltip key={it.label ?? i}>
            <TooltipTrigger asChild>
              <div className="dviz-bar-row">
                <span className="dviz-bar-label">{it.label}</span>
                <div className="dviz-bar-track">
                  <div
                    className="dviz-bar-fill"
                    style={{ width: animate ? `${pct}%` : 0, background: color, transitionDelay: `${i * 40}ms` }}
                  />
                </div>
                <span className="dviz-bar-value">{fmt(it.value)}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <b>{it.label}</b>: {fmt(it.value)}{it.detail ? ` · ${it.detail}` : ''}
            </TooltipContent>
          </Tooltip>
        )
      })}
      {showLegend && (
        <div className="dviz-legend">
          {items.map((it, i) => (
            <span className="dviz-legend-item" key={it.label ?? i}>
              <span className="dviz-legend-dot" style={{ background: it.color || colorFor(it.label) }} />
              {it.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// Funnel: each stage is a full-width row whose FILL width is proportional to
// its own count relative to the first stage (the "top of funnel"), so drop-off
// reads as shrinking bar width, not court height. Sequential blue ramp
// (magnitude, not identity — see dataviz skill's color-formula: identity is
// categorical, magnitude/progress is sequential).
export function FunnelChart({ stages, animate = true }) {
  const top = stages[0]?.value || 1
  if (!stages.length) return <div className="dviz-empty">אין נתונים</div>
  return (
    <div className="dviz-funnel">
      {stages.map((s, i) => {
        const pct = top ? Math.max((s.value / top) * 100, s.value > 0 ? 3 : 0) : 0
        const dropFromPrev = i > 0 && stages[i - 1].value ? Math.round((1 - s.value / stages[i - 1].value) * 100) : null
        return (
          <Tooltip key={s.label}>
            <TooltipTrigger asChild>
              <div className="dviz-funnel-row">
                <span className="dviz-funnel-label">{s.label}</span>
                <div className="dviz-funnel-track">
                  <div
                    className="dviz-funnel-fill"
                    style={{ width: animate ? `${pct}%` : 0, transitionDelay: `${i * 60}ms` }}
                  />
                </div>
                <span className="dviz-funnel-value">{s.value}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <b>{s.label}</b>: {s.value} עסקאות
              {dropFromPrev !== null && <><br />ירידה משלב קודם: {dropFromPrev}%</>}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

// Progress bar for journey occupancy — single-hue sequential fill (magnitude:
// seats sold vs total), color shifts to status "warning"/"critical" only via
// the caller passing a status tone, never re-using categorical hues here.
export function ProgressBar({ value, total, tone = 'default', animate = true, label }) {
  const pct = total ? Math.min((value / total) * 100, 100) : 0
  const el = (
    <div className="dviz-progress-track">
      <div
        className={`dviz-progress-fill tone-${tone}`}
        style={{ width: animate ? `${pct}%` : 0 }}
      />
    </div>
  )
  if (!label) return el
  return (
    <Tooltip>
      <TooltipTrigger asChild><div>{el}</div></TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

// Styles — scoped under .dviz, theme-aware via the app's existing
// [data-theme="dark"] convention. Colors are the dataviz skill's validated
// default categorical/sequential/status hexes (references/palette.md).
export function DvizStyles() {
  return (
    <style>{`
      .dviz {
        --cat-1: #2a78d6; --cat-2: #eb6834; --cat-3: #1baf7a; --cat-4: #eda100;
        --cat-5: #e87ba4; --cat-6: #008300; --cat-7: #4a3aa7; --cat-8: #e34948;
        --seq-100: #cde2fb; --seq-400: #3987e5; --seq-500: #256abf; --seq-700: #0d366b;
        --dviz-good: #0ca30c; --dviz-warn: #fab219; --dviz-critical: #d03b3b;
        --dviz-track: var(--surface-2);
      }
      :root[data-theme="dark"] .dviz {
        --cat-1: #3987e5; --cat-2: #d95926; --cat-3: #199e70; --cat-4: #c98500;
        --cat-5: #d55181; --cat-6: #008300; --cat-7: #9085e9; --cat-8: #e66767;
      }

      .dviz-tile { display: flex; flex-direction: column; gap: 4px; }
      .dviz-tile-label { font-size: 0.8rem; color: var(--text-2); font-weight: 600; }
      .dviz-tile-value { font-size: 1.7rem; font-weight: 900; color: var(--heading); font-variant-numeric: normal; line-height: 1.15; }
      .dviz-tile-sub { font-size: 0.74rem; color: var(--text-3); }

      .dviz-empty { text-align: center; padding: 24px; color: var(--text-3); font-size: 0.85rem; }

      .dviz-barlist { display: flex; flex-direction: column; gap: 9px; }
      .dviz-bar-row { display: flex; align-items: center; gap: 10px; cursor: default; }
      .dviz-bar-label { width: 150px; flex-shrink: 0; text-align: end; font-size: 0.82rem; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dviz-bar-track { flex: 1; background: var(--dviz-track); border-radius: 5px; height: 14px; position: relative; overflow: hidden; }
      .dviz-bar-fill { height: 100%; border-radius: 5px; min-width: 3px; transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1); }
      .dviz-bar-value { width: 54px; flex-shrink: 0; font-size: 0.82rem; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
      .dviz-legend { display: flex; flex-wrap: wrap; gap: 10px 16px; margin-top: 4px; padding-top: 8px; border-top: 1px solid var(--border-soft); }
      .dviz-legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 0.78rem; color: var(--text-2); }
      .dviz-legend-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex-shrink: 0; }

      .dviz-funnel { display: flex; flex-direction: column; gap: 8px; }
      .dviz-funnel-row { display: flex; align-items: center; gap: 10px; cursor: default; }
      .dviz-funnel-label { width: 180px; flex-shrink: 0; text-align: end; font-size: 0.8rem; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dviz-funnel-track { flex: 1; background: var(--dviz-track); border-radius: 5px; height: 20px; position: relative; overflow: hidden; }
      .dviz-funnel-fill { height: 100%; border-radius: 5px; min-width: 3px; background: linear-gradient(90deg, var(--seq-400), var(--seq-500)); transition: width 0.7s cubic-bezier(0.22, 1, 0.36, 1); }
      .dviz-funnel-value { width: 40px; flex-shrink: 0; font-size: 0.82rem; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }

      .dviz-progress-track { background: var(--dviz-track); border-radius: 5px; height: 12px; position: relative; overflow: hidden; }
      .dviz-progress-fill { height: 100%; border-radius: 5px; background: var(--seq-400); transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1); }
      .dviz-progress-fill.tone-warning { background: var(--dviz-warn); }
      .dviz-progress-fill.tone-critical { background: var(--dviz-critical); }
      .dviz-progress-fill.tone-good { background: var(--dviz-good); }

      .dviz-fade-in { animation: dviz-fade-in 0.4s ease both; }
      @keyframes dviz-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    `}</style>
  )
}
