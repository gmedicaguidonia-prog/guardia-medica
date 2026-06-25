import { AlertCircle, ArrowRight, Check } from 'lucide-react'

export interface PassoInfo { n: string; label: string; ok: boolean; to: string }

/** Avviso "completa prima i passi precedenti" con elenco di stato e tasto al primo mancante. */
export function PrerequisitiPassi({ titolo, passi, onVai }: { titolo: string; passi: PassoInfo[]; onVai: (to: string) => void }) {
  const primo = passi.find(p => !p.ok)
  return (
    <div className="card p-5 mt-2">
      <div className="flex items-start gap-3">
        <AlertCircle className="shrink-0 mt-0.5" style={{ color: '#b45309' }} size={18} />
        <div className="flex-1">
          <p className="text-sm font-semibold text-stone-700 mb-2">{titolo}</p>
          <ul className="space-y-1">
            {passi.map(p => (
              <li key={p.n} className="flex items-center gap-2 text-sm">
                {p.ok ? <Check size={15} style={{ color: '#16a34a' }} /> : <span className="inline-block" style={{ width: 15 }} />}
                <span style={{ color: p.ok ? '#166534' : '#92400e', fontWeight: p.ok ? 500 : 600 }}>{p.n} {p.label}</span>
                {!p.ok && <span className="text-xs text-amber-700">— da completare</span>}
              </li>
            ))}
          </ul>
          {primo && <button onClick={() => onVai(primo.to)} className="btn-primary text-sm mt-3 inline-flex items-center gap-1.5">Vai al passo {primo.n} <ArrowRight size={14} /></button>}
        </div>
      </div>
    </div>
  )
}
