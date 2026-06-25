import { Infinity as InfinityIcon, Save, AlertTriangle } from 'lucide-react'
import type { ValiditaStaged } from '../hooks/useValiditaStaged'

const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

/**
 * Riquadro validità (per sempre / fino a mese-anno) con salvataggio ESPLICITO.
 * Pilotato da useValiditaStaged; quando ci sono modifiche mostra «Da salvare»
 * + il pulsante «Salva validità» (l'azione di salvataggio la fornisce la pagina).
 */
export function ValiditaRiquadro({ etichetta, val, salvando, onSalva }: {
  etichetta: string; val: ValiditaStaged; salvando: boolean; onSalva: () => void
}) {
  const anni = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + i)
  return (
    <div className="card p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-sm font-semibold" style={{ color: '#2b3c24' }}>{etichetta}</span>
      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
        <input type="radio" checked={!val.fino} onChange={val.perSempre} style={{ accentColor: '#476540' }} />
        <InfinityIcon size={14} /> Per sempre
      </label>
      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
        <input type="radio" checked={val.fino} onChange={val.scegliFino} style={{ accentColor: '#476540' }} /> Fino a
      </label>
      {val.fino && (
        <div className="flex items-center gap-1.5">
          <select value={val.selM} onChange={e => val.setMeseSel(+e.target.value)} className="input text-sm py-1 w-32">{MESI.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select>
          <select value={val.selY} onChange={e => val.setAnnoSel(+e.target.value)} className="input text-sm py-1 w-24">{anni.map(a => <option key={a} value={a}>{a}</option>)}</select>
          <span className="text-xs text-stone-500">(compreso)</span>
        </div>
      )}
      {val.dirty && (
        <div className="flex items-center gap-2 ml-auto">
          <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24' }}><AlertTriangle size={12} /> Da salvare</span>
          <button onClick={onSalva} disabled={salvando} className="flex items-center gap-1 text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors" style={{ background: '#2e7d32', color: '#fff' }}><Save size={14} /> {salvando ? 'Salvo…' : 'Salva validità'}</button>
        </div>
      )}
    </div>
  )
}
