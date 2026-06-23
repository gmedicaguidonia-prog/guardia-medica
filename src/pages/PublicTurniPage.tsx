import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Clock, Moon, Sun, Info } from 'lucide-react'
import { store } from '../lib/store'
import { RICORRENZE } from '../types'
import { GIORNI_SETTIMANA } from '../lib/constants'
import { usePostazione } from '../contexts/PostazioneContext'
import type { TurnoSchema } from '../types'

function ricorrenzaLabel(t: TurnoSchema): string {
  if (t.ricorrenza === 'custom') {
    const giorni = GIORNI_SETTIMANA.filter(g => t.giorni_custom.includes(g.num)).map(g => g.abbr)
    return giorni.length ? giorni.join(', ') : 'Nessun giorno'
  }
  return RICORRENZE.find(r => r.value === t.ricorrenza)?.label ?? t.ricorrenza
}

export function PublicTurniPage() {
  const { postazioneId } = usePostazione()
  const meseKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const { data: versione } = useQuery({ queryKey: ['versione', postazioneId, meseKey], queryFn: () => store.getVersioneMese(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: schema = [] } = useQuery<TurnoSchema[]>({
    queryKey: ['schema', versione?.id],
    queryFn: () => store.getSchemaVersione(versione!.id),
    enabled: !!versione,
  })

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-1">
        <CalendarDays size={22} style={{ color: '#476540' }} />
        <h1 className="text-2xl font-bold" style={{ color: '#2b3c24' }}>I miei turni</h1>
      </div>
      <p className="text-sm text-stone-600 mb-6">
        Qui vedrai i turni che ti vengono assegnati, mese per mese.
      </p>

      {/* Placeholder finché non c'è la generazione dei turni */}
      <div className="card p-4 mb-6 flex items-start gap-3" style={{ background: '#f0f4ee' }}>
        <Info size={18} className="shrink-0 mt-0.5" style={{ color: '#476540' }} />
        <p className="text-sm" style={{ color: '#3a4a30' }}>
          La generazione dei turni dal calendario non è ancora attiva (arriverà nella prossima fase).
          Per ora qui sotto vedi lo <strong>schema dei turni</strong> impostato dall'amministratore.
        </p>
      </div>

      {/* Schema turni in sola lettura */}
      <h2 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: '#476540' }}>
        Schema turni
      </h2>
      {schema.length === 0 ? (
        <p className="text-sm text-stone-500 italic">Nessun turno ancora definito.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {schema.map(t => {
            const overnight = t.ora_fine <= t.ora_inizio
            return (
              <div key={t.id} className="card p-4">
                <div className="flex items-center gap-2 mb-2">
                  {overnight ? <Moon size={16} style={{ color: '#476540' }} /> : <Sun size={16} style={{ color: '#476540' }} />}
                  <span className="font-bold" style={{ color: '#2b3c24' }}>{t.nome}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-stone-600">
                  <Clock size={14} /> {t.ora_inizio}–{t.ora_fine}
                  {overnight && <span className="text-xs text-stone-400">(notturno)</span>}
                </div>
                <div className="text-xs text-stone-500 mt-1">
                  {t.n_turnisti} turnist{t.n_turnisti === 1 ? 'a' : 'i'} · {ricorrenzaLabel(t)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
