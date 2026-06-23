import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null; info: string | null }

/**
 * Cattura gli errori di rendering di React: invece della pagina bianca,
 * mostra un messaggio leggibile con l'errore e un tasto per ricaricare.
 * Senza questo, qualsiasi eccezione in un componente smonta tutto l'albero
 * e lascia lo schermo vuoto.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
    this.setState({ info: info.componentStack ?? null })
  }
  handleReload = () => {
    const base = import.meta.env.BASE_URL || '/'
    window.location.replace(`${base}?_r=${Date.now()}`)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f1ea', padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ maxWidth: 480, width: '100%', background: '#fff', borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.12)', padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 6 }}>⚠️</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#2b3c24', margin: '0 0 8px' }}>Qualcosa è andato storto</h1>
          <p style={{ fontSize: 14, color: '#57534e', margin: '0 0 16px' }}>
            Si è verificato un errore imprevisto. Ricarica l'app; se il problema continua, segnala il testo qui sotto.
          </p>
          <pre style={{ fontSize: 11, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 10, textAlign: 'left', overflow: 'auto', maxHeight: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {error.message}{this.state.info ? `\n${this.state.info}` : ''}
          </pre>
          <button onClick={this.handleReload}
            style={{ marginTop: 16, background: '#2e7d32', color: '#fff', border: 0, borderRadius: 10, padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Ricarica l'app
          </button>
        </div>
      </div>
    )
  }
}
