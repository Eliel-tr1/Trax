// A short, synthesized "success" chime — three ascending sine notes with a
// quick attack/decay envelope. Deliberately NOT a sourced audio file: no
// license to track, no asset to bundle, and it's easy to keep genuinely
// short and unobtrusive. Built entirely with the Web Audio API.
let ctx = null

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function note(ac, freq, start, duration, gainPeak = 0.18) {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(gainPeak, start + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain)
  gain.connect(ac.destination)
  osc.start(start)
  osc.stop(start + duration + 0.05)
}

// A bright major-triad-ish rise: C6 -> E6 -> G6, evoking a "level up" chime.
export function playSuccessChime() {
  try {
    const ac = getCtx()
    if (!ac) return
    const t = ac.currentTime
    note(ac, 1046.5, t, 0.28)
    note(ac, 1318.5, t + 0.09, 0.28)
    note(ac, 1568.0, t + 0.18, 0.42, 0.22)
  } catch { /* audio not available — celebration still plays silently */ }
}
