import { useState, useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ListChecks, AlertCircle, Plus, Infinity as InfinityIcon } from 'lucide-react'
import { store } from '../../lib/store'
import { turnoApplicabileGiorno } from '../../lib/turniLogic'
import { GIORNI_SETTIMANA } from '../../lib/constants'
import type { TurnoSchema, Turnista, ConfigVersione, RegolaVersione, RegolaTurno } from '../../types'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const meseLabel = (key: string) => { const [a, m] = key.split('-').map(Number); return `${MESI[m - 1]} ${a}` }

const thStyle = (corner: boolean): CSSProperties => ({
  background: '#2b3c24', color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 8px', textAlign: 'center',
  border: '1px solid #1f2d18', position: 'sticky', top: 0, zIndex: corner ? 3 : 2, left: corner ? 0 : undefined,
})
const tdBase: CSSProperties = { padding: '3px 6px', border: '1px solid #e5e7eb', verticalAlign: 'middle', textAlign: 'center' }

function ValiditaControls({ versione, onChange }: { versione: RegolaVersione; onChange: (v: string | null) => void }) {
  const perSempre = versione.valido_fino === null
  const [ey, em] = (versione.valido_fino ?? versione.valido_da).split('-').map(Number)
  const anni = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + i)
  return (
    <div className="card p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-sm font-semibold" style={{ color: '#2b3c24' }}>Validità regole:</span>
      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
        <input type="radio" checked={perSempre} onChange={() => onChange(null)} style={{ accentColor: '#476540' }} />
        <InfinityIcon size={14} /> Per sempre
      </label>
      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
        <input type="radio" checked={!perSempre} onChange={() => onChange(`${ey}-${String(em).padStart(2, '0')}`)} style={{ accentColor: '#476540' }} />
        Fino a
      </label>
      {!perSempre && (
        <div className="flex items-center gap-1.5">
          <select value={em} onChange={e => onChange(`${ey}-${String(+e.target.value).padStart(2, '0')}`)} className="input text-sm py-1 w-32">
            {MESI.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={ey} onChange={e => onChange(`${+e.target.value}-${String(em).padStart(2, '0')}`)} className="input text-sm py-1 w-24">
            {anni.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <span className="text-xs text-stone-500">(compreso)</span>
        </div>
      )}
    </div>
  )
}

export function RegoleTurniPage() {
  const qc = useQueryClient()
  const oggi = new Date()
  const [anno, setAnno] = useState(oggi.getFullYear())
  const [mese, setMese] = useState(oggi.getMonth() + 1)
  const meseKey = `${anno}-${String(mese).padStart(2, '0')}`

  const { data: configVer, isLoading: loadingConfig } = useQuery<ConfigVersione | null>({ queryKey: ['versione', meseKey], queryFn: () => store.getVersioneMese(meseKey) })
  const { data: schema = [] } = useQuery<TurnoSchema[]>({ queryKey: ['schema', configVer?.id], queryFn: () => store.getSchemaVersione(configVer!.id), enabled: !!configVer })
  const { data: regoleVer, isLoading: loadingRegole } = useQuery<RegolaVersione | null>({ queryKey: ['regole-versione', meseKey], queryFn: () => store.getRegoleVersioneMese(meseKey) })
  const { data: regole = [] } = useQuery<RegolaTurno[]>({ queryKey: ['regole', regoleVer?.id], queryFn: () => store.getRegole(regoleVer!.id), enabled: !!regoleVer })
  const { data: turnisti = [] } = useQuery<Turnista[]>({ queryKey: ['turnisti'], queryFn: () => store.getTurnisti() })

  const mappa = useMemo(() => {
    const m = new Map<string, string>()
    regole.forEach(r => { if (r.turnista_id) m.set(`${r.giorno_settimana}|${r.turno_schema_id}|${r.slot}`, r.turnista_id) })
    return m
  }, [regole])

  function cambiaMese(delta: number) {
    let m = mese + delta, a = anno
    if (m < 1) { m = 12; a-- } else if (m > 12) { m = 1; a++ }
    setMese(m); setAnno(a)
  }
  async function configuraRegole() { await store.creaRegoleVersione(meseKey); await qc.invalidateQueries({ queryKey: ['regole-versione'] }) }
  async function cambiaValidita(v: string | null) { if (!regoleVer) return; await store.setValiditaRegoleVersione(regoleVer.id, v); await qc.invalidateQueries({ queryKey: ['regole-versione'] }) }
  async function setReg(giorno: number, schemaId: string, slot: number, turnistaId: string | null) {
    if (!regoleVer) return
    try { await store.setRegola(regoleVer.id, giorno, schemaId, slot, turnistaId); qc.invalidateQueries({ queryKey: ['regole', regoleVer.id] }) }
    catch (e) { console.error('[Regole] salvataggio fallito:', e) }
  }

  const Header = (
    <div className="flex items-start gap-3">
      <ListChecks size={22} style={{ color: '#476540' }} className="mt-1" />
      <div className="flex-1">
        <h1 className="text-2xl font-bold" style={{ color: '#2b3c24' }}>Regole Turni</h1>
        <p className="text-sm text-stone-600">Chi c'è <strong>sempre</strong> in ogni turno della settimana. Si applica nei mesi di validità.</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={() => cambiaMese(-1)} className="btn-secondary px-2 py-1"><ChevronLeft size={16} /></button>
        <span className="font-semibold text-sm text-center" style={{ color: '#3a3d30', minWidth: 130 }}>{MESI[mese - 1]} {anno}</span>
        <button onClick={() => cambiaMese(1)} className="btn-secondary px-2 py-1"><ChevronRight size={16} /></button>
      </div>
    </div>
  )

  const avviso = (testo: ReactNode) => (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      {Header}
      <div className="card p-5 flex items-start gap-3"><AlertCircle className="shrink-0 mt-0.5" style={{ color: '#b45309' }} size={18} /><p className="text-sm text-stone-600">{testo}</p></div>
    </div>
  )

  if (loadingConfig) return <div className="max-w-4xl mx-auto p-6 space-y-4">{Header}<p className="text-sm text-stone-500">Caricamento…</p></div>
  if (!configVer || schema.length === 0)
    return avviso(<>Nessun turno configurato per <strong>{MESI[mese - 1]} {anno}</strong>. Imposta prima i turni in <strong>Configurazione Turni</strong> (passo ①).</>)
  if (loadingRegole) return <div className="max-w-4xl mx-auto p-6 space-y-4">{Header}<p className="text-sm text-stone-500">Caricamento…</p></div>

  if (!regoleVer) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        {Header}
        <div className="card p-8 text-center">
          <ListChecks size={32} className="mx-auto mb-2" style={{ color: '#9ab488' }} />
          <p className="text-sm text-stone-600 mb-1">Nessuna regola fissa per <strong>{MESI[mese - 1]} {anno}</strong>.</p>
          <p className="text-xs text-stone-400 mb-4">Crea un periodo di regole valido da questo mese.</p>
          <button onClick={configuraRegole} className="btn-primary text-sm mx-auto"><Plus size={16} /> Imposta le regole per questo mese</button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {Header}
      <ValiditaControls versione={regoleVer} onChange={cambiaValidita} />
      <p className="text-xs text-stone-500">
        Regole valide da <strong>{meseLabel(regoleVer.valido_da)}</strong>
        {regoleVer.valido_fino ? <> a <strong>{meseLabel(regoleVer.valido_fino)}</strong></> : <> in poi (per sempre)</>}.
        Le caselle grigie = quel turno non è previsto in quel giorno.
      </p>

      {turnisti.length === 0 && (
        <div className="card p-3 text-sm" style={{ color: '#92400e', background: '#fef3c7' }}>Aggiungi prima dei turnisti nella sezione <strong>Turnisti</strong>.</div>
      )}

      <div className="overflow-auto card">
        <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
          <thead>
            <tr>
              <th style={thStyle(true)}>Giorno</th>
              {schema.map(c => (
                <th key={c.id} style={thStyle(false)}>
                  <div>{c.nome || 'Turno'}</div>
                  <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.85 }}>{c.ora_inizio}–{c.ora_fine}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GIORNI_SETTIMANA.map(g => (
              <tr key={g.num}>
                <td style={{ ...tdBase, fontWeight: 600, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#f4f1ea', zIndex: 1, color: '#374151' }}>{g.nome}</td>
                {schema.map(c => {
                  if (!turnoApplicabileGiorno(c, g.num)) return <td key={c.id} style={{ ...tdBase, background: '#f3f4f6' }} />
                  return (
                    <td key={c.id} style={tdBase}>
                      <div className="flex flex-col gap-1 items-stretch">
                        {Array.from({ length: c.n_turnisti }, (_, slot) => {
                          const val = mappa.get(`${g.num}|${c.id}|${slot}`) ?? ''
                          return (
                            <select key={slot} value={val} onChange={e => setReg(g.num, c.id, slot, e.target.value || null)}
                              className="input text-xs py-0.5" style={{ minWidth: 120, background: val ? '#eef5e9' : '#fff' }}>
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
