import { Component } from 'react'

/* App-wide error boundary: a render crash anywhere previously blanked the
   whole SPA (white screen) with zero diagnostics. This catches it, shows a
   readable recovery card, and logs the stack to the console. */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) { return { error } }

  componentDidCatch(error, info) {
    console.error('[TRAX] render crash:', error, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, maxWidth: 560, margin: '80px auto', textAlign: 'center' }}>
          <h2 style={{ marginBottom: 12 }}>משהו השתבש</h2>
          <p className="muted" style={{ marginBottom: 20 }}>
            שגיאה בהצגת המסך. רענון בדרך כלל פותר; אם זה חוזר, דווח דרך "דיווח תקלה" בתפריט.
          </p>
          <pre dir="ltr" className="small" style={{ textAlign: 'start', background: 'var(--surface-2)', padding: 12, borderRadius: 8, overflow: 'auto', maxHeight: 180 }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button className="btn" style={{ marginTop: 16 }} onClick={() => window.location.assign(window.location.origin + window.location.pathname + '#/')}>
            חזרה לדשבורד
          </button>
        </div>
      )
    }
    return this.props.children
  }
}