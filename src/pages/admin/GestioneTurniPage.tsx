import { useState, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, CalendarDays, AlertCircle } from 'lucide-react'
import { store } from '../../lib/store'
import { giorniDelMese, turnoSiApplica } from '../../lib/turniLogic'
import { isFestivo, isPrefestivo, isoDate } from '../../lib/holidays'
import type { TurnoSchema, Turnista, Turno, ConfigVersione } from '../../types'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const WD = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab']  // indice = getDay()

const thStyle = (corner: boolean): CSSProperties => ({
  background: '#2b3c24', color: '#fff', fontWeight: 700, fontSize: 12,
  padding: '6px 8px', textAlign: 'center', border: '1px solid #1f2d18',
  position: 'sticky', top: 0, zIndex: corner ? 3 : 2, left: corner ? 0 : undefined,
})
const tdBase: CSSProperties = {
  padding: '3px 6px', border: '1px solid #e5e7eb', verticalAlign: 'middle', textAlign: 'center',
}

function Intestazione({ anno, mese, onPrev, onNext }: { anno: number; mese: number; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <CalendarDays size={22} style={{ color: '#476540' }} />
      <h1 className="text-2xl font-bold" style={{ color: '#2b3c24' }}>Turni del Mese</h1>
      <div className="ml-auto flex items-center gap-2">
        <button onClick={onPrev} className="btn-secondary px-2 py-1" title="Mese precedente"><ChevronLeft size={16} /></button>
        <span className="font-semibold text-sm text-center" style={{ color: '#3a3d30', minWidth: 140 }}>{MESI[mese - 1]} {anno}</span>
        <button onClick={onNext} className="btn-secondary px-2 py-1" title="Mese successivo"><ChevronRight size={16} /></button>
      </div>
    </div>
  )
}

export function GestioneTurniPage() {
  const qc = useQueryClient()
  const oggi = new Date()
  const [anno, setAnno] = useState(oggi.getFullYear())
  const [mese, setMese] = useState(oggi.getMonth() + 1)

  const meseKey = `${anno}-${String(mese).padStart(2, '0')}`
  const { data: versione, isLoading: loadingVer } = useQuery<ConfigVersione | null>({ queryKey: ['versione', meseKey], queryFn: () => store.getVersioneMese(meseKey) })
  const { data: schema = [] }   = useQuery<TurnoSchema[]>({ queryKey: ['schema', versione?.id], queryFn: () => store.getSchemaVersione(versione!.id), enabled: !!versione })
  const { data: turnisti = [] } = useQuery<Turnista[]>({   queryKey: ['turnisti'],  queryFn: () => store.getTurnisti() })
  const { data: turni = [] }    = useQuery<Turno[]>({      queryKey: ['turni', anno, mese], queryFn: () => store.getTurniMese(anno, mese) })

  const mappa = useMemo(() => {
    const m = new Map<string, string>()
    turni.forEach(t => { if (t.turnista_id) m.set(`${t.data}|${t.turno_schema_id}|${t.slot}`, t.turnista_id) })
    return m
  }, [turni])

  const giorni  = useMemo(() => giorniDelMese(anno, mese), [anno, mese])
  const colonne = useMemo(() => schema.filter(s => giorni.some(d => turnoSiApplica(s, d))), [schema, giorni])

  function cambiaMese(delta: number) {
    let m = mese + delta, a = anno
    if (m < 1) { m = 12; a-- } else if (m > 12) { m = 1; a++ }
    setMese(m); setAnno(a)
  }

  async function assegna(data: string, schemaId: string, slot: number, turnistaId: string | null) {
    try {
      await store.setAssegnazione(data, schemaId, slot, turnistaId)
      qc.invalidateQueries({ queryKey: ['turni', anno, mese] })
    } catch (e) { console.error('[Turni] assegnazione fallita:', e) }
  }

  const prev = () => cambiaMese(-1)
  const next = () => cambiaMese(1)

  if (loadingVer) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Intestazione anno={anno} mese={mese} onPrev={prev} onNext={next} />
        <p className="text-sm text-stone-500 mt-4">Caricamento…</p>
      </div>
    )
  }
  if (!versione || schema.length === 0) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Intestazione anno={anno} mese={mese} onPrev={prev} onNext={next} />
        <div className="card p-5 flex items-start gap-3 mt-4">
          <AlertCircle className="shrink-0 mt-0.5" style={{ color: '#b45309' }} size={18} />
          <p className="text-sm text-stone-600">
            Nessuna configurazione turni per <strong>{MESI[mese - 1]} {anno}</strong>. Impostala prima in <strong>Configurazione Turni</strong> (passo ①).
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <Intestazione anno={anno} mese={mese} onPrev={prev} onNext={next} />

      {turnisti.length === 0 && (
        <div className="card p-3 my-3 text-sm" style={{ color: '#92400e', background: '#fef3c7' }}>
          Aggiungi prima dei turnisti nella pagina <strong>Turnisti</strong>: serviranno per assegnare i turni.
        </div>
      )}

      <p className="text-xs text-stone-500 mt-1 mb-3">
        Le caselle grigie indicano che quel turno non è previsto in quel giorno (secondo lo schema).
        Domeniche e festivi in rosso, prefestivi in arancione.
      </p>

      <div className="overflow-auto card">
        <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
          <thead>
            <tr>
              <th style={thStyle(true)}>Giorno</th>
              {colonne.map(c => (
                <th key={c.id} style={thStyle(false)}>
                  <div>{c.nome || 'Turno'}</div>
                  <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.85 }}>{c.ora_inizio}–{c.ora_fine}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {giorni.map(d => {
              const ds = isoDate(d)
              const fest = isFestivo(d), pref = isPrefestivo(d)
              const rowBg = fest ? '#fdecea' : pref ? '#fff5e6' : '#ffffff'
              const dayColor = fest ? '#b91c1c' : pref ? '#b45309' : '#374151'
              return (
                <tr key={ds} style={{ background: rowBg }}>
                  <td style={{ ...tdBase, fontWeight: 600, color: dayColor, whiteSpace: 'nowrap',
                               position: 'sticky', left: 0, background: rowBg, zIndex: 1 }}>
                    {WD[d.getDay()]} {d.getDate()}
                  </td>
                  {colonne.map(c => {
                    if (!turnoSiApplica(c, d)) return <td key={c.id} style={{ ...tdBase, background: '#f3f4f6' }} />
                    return (
                      <td key={c.id} style={tdBase}>
                        <div className="flex flex-col gap-1 items-stretch">
                          {Array.from({ length: c.n_turnisti }, (_, slot) => {
                            const val = mappa.get(`${ds}|${c.id}|${slot}`) ?? ''
                            return (
                              <select key={slot} value={val}
                                onChange={e => assegna(ds, c.id, slot, e.target.value || null)}
                                className="input text-xs py-0.5"
                                style={{ minWidth: 120, background: val ? '#eef5e9' : '#fff' }}>
                                <option value="">— libero —</option>
                                {turnisti.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                              </select>
                            )
                          })}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
