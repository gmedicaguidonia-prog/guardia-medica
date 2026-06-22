import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ArrowRightLeft, CalendarDays } from 'lucide-react'
import { store } from '../../lib/store'
import type { ConfigVersione } from '../../types'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
function meseKeyOffset(off: number): string {
  const d = new Date()
  const x = new Date(d.getFullYear(), d.getMonth() + off, 1)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`
}
function meseLabel(key: string): string { const [a, m] = key.split('-').map(Number); return `${MESI[m - 1]} ${a}` }
function copre(v: ConfigVersione, mese: string): boolean {
  return v.valido_da <= mese && (v.valido_fino == null || mese <= v.valido_fino)
}

interface Avviso { testo: string; cta?: string; azione?: () => void }

function PlaceholderCard({ Icon, titolo, descr }: { Icon: typeof ArrowRightLeft; titolo: string; descr: string }) {
  return (
    <div className="card p-4 opacity-70">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} style={{ color: '#9ca3af' }} />
        <span className="font-semibold text-sm text-stone-600">{titolo}</span>
        <span className="ml-auto text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: '#e5e7eb', color: '#6b7280' }}>prossimamente</span>
      </div>
      <p className="text-xs text-stone-500">{descr}</p>
    </div>
  )
}

export function AdminHomePage() {
  const navigate = useNavigate()
  const { data: versioni = [] } = useQuery<ConfigVersione[]>({ queryKey: ['versioni-all'], queryFn: () => store.getVersioni() })

  const avvisi = useMemo<Avviso[]>(() => {
    const out: Avviso[] = []
    const mesi = [0, 1, 2].map(meseKeyOffset)   // corrente + 2

    // Mesi imminenti senza configurazione
    mesi.forEach(mk => {
      if (!versioni.some(v => copre(v, mk))) {
        out.push({ testo: `Nessuna configurazione turni per ${meseLabel(mk)}.`, cta: 'Configura', azione: () => navigate('/admin/schema') })
      }
    })
    // Configurazione attiva in scadenza entro il mese prossimo
    const corrente = versioni.filter(v => copre(v, mesi[0])).sort((a, b) => b.valido_da.localeCompare(a.valido_da))[0]
    if (corrente?.valido_fino && corrente.valido_fino <= mesi[1]) {
      out.push({ testo: `La configurazione turni scade a ${meseLabel(corrente.valido_fino)}: ricordati di riconfigurare i turni.`, cta: 'Configura', azione: () => navigate('/admin/schema') })
    }
    return out
  }, [versioni, navigate])

  return (
    <div className="relative min-h-full">
      {/* Logo filigrana, fuso con lo sfondo */}
      <img src={`${import.meta.env.BASE_URL}icon-512.png`} alt="" aria-hidden draggable={false}
        className="pointer-events-none select-none"
        style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(50%, 320px)', opacity: 0.06 }} />

      <div className="relative max-w-3xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-bold" style={{ color: '#2b3c24' }}>Riepilogo</h1>

        {/* Promemoria e scadenze */}
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">Promemoria e scadenze</h2>
          {avvisi.length === 0 ? (
            <div className="card p-4 flex items-center gap-2 text-sm" style={{ color: '#166534' }}>
              <CheckCircle2 size={18} /> Tutto in regola: nessuna scadenza imminente.
            </div>
          ) : avvisi.map((a, i) => (
            <div key={i} className="card p-4 flex items-center gap-3" style={{ borderLeft: '4px solid #f59e0b' }}>
              <AlertTriangle size={18} style={{ color: '#d97706' }} className="shrink-0" />
              <span className="text-sm flex-1" style={{ color: '#3a3d30' }}>{a.testo}</span>
              {a.cta && <button onClick={a.azione} className="btn-primary text-xs py-1 px-2.5 shrink-0">{a.cta}</button>}
            </div>
          ))}
        </section>

        {/* Funzioni in arrivo (placeholder) */}
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">In arrivo</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <PlaceholderCard Icon={ArrowRightLeft} titolo="Cambi turno" descr="Avvisi delle richieste e dei cambi turno effettuati dai turnisti." />
            <PlaceholderCard Icon={CalendarDays} titolo="Desiderata e indisponibilità" descr="Apertura e scadenza del calendario per le preferenze dei turnisti." />
          </div>
        </section>
      </div>
    </div>
  )
}
