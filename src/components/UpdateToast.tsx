import { useState } from 'react'
import { RefreshCw, X } from 'lucide-react'

/**
 * Toast centrato sulla pagina che avvisa quando è uscita una nuova versione.
 * Lo sfondo lascia passare i click (pointer-events-none); solo il riquadro è
 * cliccabile. La X lo nasconde, ma il badge arancione nella navbar resta.
 */
export function UpdateToast({ onReload }: { onReload: () => void }) {
  const [hidden, setHidden] = useState(false)
  if (hidden) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none p-4" role="alert">
      <div className="pointer-events-auto flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl max-w-md"
        style={{ background: '#fffbeb', border: '2px solid #f59e0b', animation: 'fadeSlideIn 220ms ease-out' }}>
        <RefreshCw size={22} className="animate-spin shrink-0" style={{ color: '#d97706', animationDuration: '2.5s' }} />
        <div className="flex-1">
          <div className="font-bold text-sm" style={{ color: '#92400e' }}>Aggiornamento disponibile</div>
          <div className="text-xs" style={{ color: '#b45309' }}>È uscita una nuova versione dell'app.</div>
        </div>
        <button onClick={onReload}
          className="shrink-0 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ background: '#d97706' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#b45309')}
          onMouseLeave={e => (e.currentTarget.style.background = '#d97706')}>
          Ricarica ora
        </button>
        <button onClick={() => setHidden(true)} className="shrink-0 hover:opacity-70 transition-opacity"
          style={{ color: '#b45309' }} title="Nascondi">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
