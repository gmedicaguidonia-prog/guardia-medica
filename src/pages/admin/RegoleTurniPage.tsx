import { useState, useMemo, useRef, useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ListChecks, AlertCircle, AlertTriangle, Plus, X, Trash2, Save, RotateCcw, Infinity as InfinityIcon, Moon, Sun } from 'lucide-react'
import { store } from '../../lib/store'
import { nomeCompleto, gruppiPerLivello } from '../../types'
import { turnoApplicabileGiorno, prossimoInizio, fineEffettiva } from '../../lib/turniLogic'
import { GIORNI_SETTIMANA } from '../../lib/constants'
import { useStagedAssignments } from '../../hooks/useStagedAssignments'
import { useUnsaved } from '../../contexts/UnsavedContext'
import { usePostazione } from '../../contexts/PostazioneContext'
import { useMeseSelezionato } from '../../hooks/useMeseSelezionato'
import type { TurnoSchema, Turnista, Livello, ConfigVersione, RegolaVersione, RegolaTurno } from '../../types'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const meseLabel = (key: string) => { const [a, m] = key.split('-').map(Number); return `${MESI[m - 1]} ${a}` }
const ROLE_COLOR: Record<Livello, { bg: string; fg: string }> = {
  admin:        { bg: '#fee2e2', fg: '#b91c1c' },
  responsabile: { bg: '#fef3c7', fg: '#92400e' },
  turnista:     { bg: '#dbeafe', fg: '#1e40af' },
  esterno:      { bg: '#dcfce7', fg: '#166534' },
}
const thStyle = (corner: boolean): CSSProperties => ({
  background: '#2b3c24', color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 8px', textAlign: 'center',
  border: '1px solid #1f2d18', position: 'sticky', top: 0, zIndex: corner ? 3 : 2, left: corner ? 0 : undefined,
})

function ValiditaControls({ versione, onChange }: { versione: RegolaVersione; onChange: (v: string | null) => void }) {
  const perSempre = versione.valido_fino === null
  const [ey, em] = (versione.valido_fino ?? versione.valido_da).split('-').map(Number)
  const anni = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + i)
  return (
    <div className="card p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-sm font-semibold" style={{ color: '#2b3c24' }}>Validità regole:</span>
      <label className="flex items-center gap-1.5 text-sm cursor-pointer"><input type="radio" checked={perSempre} onChange={() => onChange(null)} style={{ accentColor: '#476540' }} /><InfinityIcon size={14} /> Per sempre</label>
      <label className="flex items-center gap-1.5 text-sm cursor-pointer"><input type="radio" checked={!perSempre} onChange={() => onChange(`${ey}-${String(em).padStart(2, '0')}`)} style={{ accentColor: '#476540' }} /> Fino a</label>
      {!perSempre && (
        <div className="flex items-center gap-1.5">
          <select value={em} onChange={e => onChange(`${ey}-${String(+e.target.value).padStart(2, '0')}`)} className="input text-sm py-1 w-32">{MESI.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select>
          <select value={ey} onChange={e => onChange(`${+e.target.value}-${String(em).padStart(2, '0')}`)} className="input text-sm py-1 w-24">{anni.map(a => <option key={a} value={a}>{a}</option>)}</select>
          <span className="text-xs text-stone-500">(compreso)</span>
        </div>
      )}
    </div>
  )
}

export function RegoleTurniPage() {
  const qc = useQueryClient()
  const { setHasUnsaved } = useUnsaved()
  const { postazioneId, postazioneAttiva } = usePostazione()
  const oggi = new Date()
  const { anno, mese, meseKey, setMeseAnno } = useMeseSelezionato()

  const { data: configVer, isLoading: loadingConfig } = useQuery<ConfigVersione | null>({ queryKey: ['versione', postazioneId, meseKey], queryFn: () => store.getVersioneMese(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: schema = [] } = useQuery<TurnoSchema[]>({ queryKey: ['schema', configVer?.id], queryFn: () => store.getSchemaVersione(configVer!.id), enabled: !!configVer })
  const { data: regoleVer, isLoading: loadingRegole } = useQuery<RegolaVersione | null>({ queryKey: ['regole-versione', postazioneId, meseKey], queryFn: () => store.getRegoleVersioneMese(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: regole = [] } = useQuery<RegolaTurno[]>({ queryKey: ['regole', regoleVer?.id], queryFn: () => store.getRegole(regoleVer!.id), enabled: !!regoleVer })
  const { data: turnisti = [] } = useQuery<Turnista[]>({ queryKey: ['turnisti', postazioneId], queryFn: () => store.getTurnisti(postazioneId!), enabled: !!postazioneId })
  const { data: tutteVer = [] } = useQuery<RegolaVersione[]>({ queryKey: ['regole-versioni-all', postazioneId], queryFn: () => store.getRegoleVersioni(postazioneId!), enabled: !!postazioneId })

  const serverMap = useMemo(() => {
    const m = new Map<string, string>()
    regole.forEach(r => { if (r.turnista_id) m.set(`${r.giorno_settimana}|${r.turno_schema_id}|${r.slot}`, r.turnista_id) })
    return m
  }, [regole])
  const { local, dirty, set, diff, discard } = useStagedAssignments(serverMap)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setHasUnsaved(dirty); return () => setHasUnsaved(false) }, [dirty, setHasUnsaved])
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])
  useEffect(() => { setOreMin(regoleVer?.ore_min_settimana != null ? String(regoleVer.ore_min_settimana) : '') }, [regoleVer?.id, regoleVer?.ore_min_settimana])

  const tById = useMemo(() => new Map(turnisti.map(t => [t.id, t])), [turnisti])
  const paletteGruppi = useMemo(() => gruppiPerLivello(turnisti), [turnisti])
  const nomeTurnista = (id: string) => { const t = tById.get(id); return t ? nomeCompleto(t) : '—' }
  const coloreTurnista = (id: string) => ROLE_COLOR[tById.get(id)?.livello ?? 'turnista']

  // drag&drop
  const dragSource = useRef<string | null>(null)
  const touchActive = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [oreMin, setOreMin] = useState('')
  const [warn, setWarn] = useState<string | null>(null)
  const warnTimer = useRef<number | null>(null)
  function showWarn(msg: string) { setWarn(msg); if (warnTimer.current) clearTimeout(warnTimer.current); warnTimer.current = window.setTimeout(() => setWarn(null), 3500) }
  useEffect(() => () => { if (warnTimer.current) clearTimeout(warnTimer.current) }, [])
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onMove = (e: TouchEvent) => {
      if (!touchActive.current) return
      e.preventDefault()
      const t = e.touches[0]
      const td = (document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null)?.closest('[data-giorno][data-turno]') as HTMLElement | null
      setOverKey(td ? `${td.dataset.giorno}|${td.dataset.turno}` : null)
    }
    el.addEventListener('touchmove', onMove, { passive: false })
    return () => el.removeEventListener('touchmove', onMove)
  }, [])

  function cellaSlots(giorno: number, turno: TurnoSchema): (string | null)[] {
    return Array.from({ length: turno.n_turnisti }, (_, slot) => local.get(`${giorno}|${turno.id}|${slot}`) ?? null)
  }
  function handleDrop(giorno: number, turno: TurnoSchema) {
    const tid = dragSource.current
    dragSource.current = null; setOverKey(null)
    if (!tid || !turnoApplicabileGiorno(turno, giorno)) return
    const slots = cellaSlots(giorno, turno)
    if (slots.includes(tid)) { showWarn(`${nomeTurnista(tid)} è già in questo turno (${GIORNI_SETTIMANA[giorno - 1].nome}).`); return }
    const free = slots.findIndex(s => s === null)
    if (free === -1) { showWarn(`Per il turno “${turno.nome || 'senza nome'}” bastano ${turno.n_turnisti} turnist${turno.n_turnisti === 1 ? 'a' : 'i'}.`); return }
    set(`${giorno}|${turno.id}|${free}`, tid)
  }

  function cambiaMese(delta: number) {
    if (dirty && !window.confirm('Hai modifiche non salvate. Cambiare mese senza salvarle?')) return
    if (dirty) discard()
    let m = mese + delta, a = anno
    if (m < 1) { m = 12; a-- } else if (m > 12) { m = 1; a++ }
    setMeseAnno(a, m)
  }
  async function configuraRegole() { await store.creaRegoleVersione(postazioneId!, meseKey); await qc.invalidateQueries({ queryKey: ['regole-versione'] }); await qc.invalidateQueries({ queryKey: ['regole-versioni-all'] }) }
  async function cambiaValidita(v: string | null) { if (!regoleVer) return; await store.setValiditaRegoleVersione(regoleVer.id, v); await qc.invalidateQueries({ queryKey: ['regole-versione'] }); await qc.invalidateQueries({ queryKey: ['regole-versioni-all'] }) }
  async function cancellaRegole() {
    if (!regoleVer) return
    if (!window.confirm(`Cancellare le regole valide da ${meseLabel(regoleVer.valido_da)}? Non è reversibile.`)) return
    await store.deleteRegoleVersione(regoleVer.id)
    await qc.invalidateQueries({ queryKey: ['regole-versione'] }); await qc.invalidateQueries({ queryKey: ['regole-versioni-all'] })
  }
  async function salvaOreMin() {
    if (!regoleVer) return
    const n = oreMin.trim() === '' ? null : Math.max(0, parseInt(oreMin) || 0)
    if (n === (regoleVer.ore_min_settimana ?? null)) return
    await store.setOreMinSettimana(regoleVer.id, n)
    await qc.invalidateQueries({ queryKey: ['regole-versione'] }); await qc.invalidateQueries({ queryKey: ['regole-versioni-all'] })
  }
  async function salvaCambioAuto(on: boolean) {
    if (!regoleVer) return
    await store.setCambioAuto(regoleVer.id, on)
    await qc.invalidateQueries({ queryKey: ['regole-versione'] }); await qc.invalidateQueries({ queryKey: ['regole-versioni-all'] })
  }
  async function salva() {
    if (!regoleVer) return
    setSaving(true)
    try {
      for (const c of diff()) { const [giorno, turnoId, slot] = c.key.split('|'); await store.setRegola(regoleVer.id, +giorno, turnoId, +slot, c.value) }
      await qc.invalidateQueries({ queryKey: ['regole', regoleVer.id] })
    } catch (e) { console.error('[Regole] salvataggio fallito:', e); alert('Errore nel salvataggio.') }
    finally { setSaving(false) }
  }

  const Header = (
    <div className="flex items-start gap-3">
      <ListChecks size={22} style={{ color: '#476540' }} className="mt-1" />
      <div className="flex-1">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold" style={{ color: '#2b3c24' }}>Regole Turni{postazioneAttiva ? ` - ${postazioneAttiva.nome}` : ''}</h1>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => cambiaMese(-1)} className="btn-secondary px-2 py-1"><ChevronLeft size={16} /></button>
            <span className="font-bold text-lg text-center" style={{ color: '#3a3d30', minWidth: 130 }}>{MESI[mese - 1]} {anno}</span>
            <button onClick={() => cambiaMese(1)} className="btn-secondary px-2 py-1"><ChevronRight size={16} /></button>
          </div>
        </div>
        <p className="text-sm text-stone-600">Trascina i turnisti dalla colonna sinistra nelle celle. Ricordati di premere <strong>Salva</strong>.</p>
      </div>
    </div>
  )
  const avviso = (testo: ReactNode) => (<div className="max-w-4xl mx-auto p-6 space-y-4">{Header}<div className="card p-5 flex items-start gap-3"><AlertCircle className="shrink-0 mt-0.5" style={{ color: '#b45309' }} size={18} /><p className="text-sm text-stone-600">{testo}</p></div></div>)

  if (!postazioneId) return <div className="max-w-4xl mx-auto p-6 space-y-4">{Header}<p className="text-sm text-stone-500">Caricamento postazione…</p></div>
  if (loadingConfig) return <div className="max-w-4xl mx-auto p-6 space-y-4">{Header}<p className="text-sm text-stone-500">Caricamento…</p></div>
  if (!configVer || schema.length === 0) return avviso(<>Nessun turno configurato per <strong>{MESI[mese - 1]} {anno}</strong>. Imposta prima i turni in <strong>Configurazione Turni</strong> (passo ①).</>)
  if (loadingRegole) return <div className="max-w-4xl mx-auto p-6 space-y-4">{Header}<p className="text-sm text-stone-500">Caricamento…</p></div>
  if (!regoleVer) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-4">{Header}
        <div className="card p-8 text-center">
          <ListChecks size={32} className="mx-auto mb-2" style={{ color: '#9ab488' }} />
          <p className="text-sm text-stone-600 mb-1">Nessuna regola fissa per <strong>{MESI[mese - 1]} {anno}</strong>.</p>
          <p className="text-xs text-stone-400 mb-4">Crea un periodo di regole valido da questo mese.</p>
          <button onClick={configuraRegole} className="btn-primary text-sm mx-auto"><Plus size={16} /> Imposta le regole per questo mese</button>
        </div>
      </div>
    )
  }

  const eff = fineEffettiva(regoleVer, tutteVer)
  const nxt = prossimoInizio(regoleVer, tutteVer)
  const PaletteBadge = (t: Turnista) => (
    <div key={t.id} draggable={true}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'copyMove'; e.dataTransfer.setData('text/plain', t.id); dragSource.current = t.id; setDraggingId(t.id) }}
      onDragEnd={() => { setDraggingId(null); setOverKey(null); dragSource.current = null }}
      onTouchStart={() => { dragSource.current = t.id; touchActive.current = true; setDraggingId(t.id) }}
      className="rounded-md px-2 py-1 text-xs font-medium select-none shadow-sm border border-white/60 truncate transition-opacity"
      style={{ background: ROLE_COLOR[t.livello].bg, color: ROLE_COLOR[t.livello].fg, cursor: 'grab', opacity: draggingId === t.id ? 0.4 : 1, touchAction: 'none' }}
      title={`Trascina ${nomeCompleto(t)} in una cella`}>{nomeCompleto(t)}</div>
  )

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {Header}
      <ValiditaControls versione={regoleVer} onChange={cambiaValidita} />

      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs text-stone-500 flex-1">
          Valide da <strong>{meseLabel(regoleVer.valido_da)}</strong>{eff ? <> a <strong>{meseLabel(eff)}</strong></> : <> in poi (per sempre)</>}
          {nxt && <span className="text-amber-700"> · dal {meseLabel(nxt)} subentra un periodo più recente</span>}.
        </p>
        <button onClick={cancellaRegole} className="btn-danger text-xs py-1 px-2 shrink-0"><Trash2 size={13} /> Cancella queste regole</button>
      </div>

      {/* Barra salvataggio */}
      <div className="flex items-center gap-2 flex-wrap">
        {dirty && <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24' }}><AlertTriangle size={13} /> Modifiche non salvate</span>}
        <div className="ml-auto flex items-center gap-2">
          {dirty && <button onClick={discard} className="btn-secondary text-xs py-1.5 px-3"><RotateCcw size={13} /> Annulla</button>}
          <button onClick={salva} disabled={!dirty || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:cursor-default"
            style={dirty ? { background: '#2e7d32', color: '#fff' } : { background: '#f3f4f6', color: '#9ca3af' }}>
            <Save size={15} /> {saving ? 'Salvo…' : 'Salva'}
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex gap-3 items-start"
        onTouchEnd={e => {
          if (!touchActive.current) return
          touchActive.current = false; setOverKey(null); setDraggingId(null)
          const t = e.changedTouches[0]
          const td = (document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null)?.closest('[data-giorno][data-turno]') as HTMLElement | null
          if (td?.dataset.giorno && td.dataset.turno) { const turno = schema.find(s => s.id === td!.dataset.turno); if (turno) handleDrop(+td.dataset.giorno, turno) }
          else dragSource.current = null
        }}>

        <aside className="w-40 sm:w-44 shrink-0 space-y-3">
          {paletteGruppi.length ? paletteGruppi.map(g => (
            <div key={g.liv} className="card p-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider px-1 mb-1.5" style={{ color: ROLE_COLOR[g.liv].fg }}>{g.label}</h3>
              <div className="flex flex-col gap-1.5">{g.items.map(PaletteBadge)}</div>
            </div>
          )) : <div className="card p-2"><span className="text-xs text-stone-400 px-1">Nessun turnista.</span></div>}
        </aside>

        <div className="flex-1 min-w-0 overflow-auto card">
          <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
            <thead>
              <tr>
                <th style={thStyle(true)}>Giorno</th>
                {schema.map(c => (<th key={c.id} style={thStyle(false)}><div className="inline-flex items-center justify-center gap-1">{c.ora_fine <= c.ora_inizio ? <Moon size={12} style={{ color: '#cbd5e1' }} /> : <Sun size={12} style={{ color: '#fbbf24' }} />}{c.nome || 'Turno'}</div><div style={{ fontSize: 10, fontWeight: 400, opacity: 0.85 }}>{c.ora_inizio}–{c.ora_fine} · {c.n_turnisti}</div></th>))}
              </tr>
            </thead>
            <tbody>
              {GIORNI_SETTIMANA.map(g => (
                <tr key={g.num}>
                  <td style={{ padding: '3px 8px', border: '1px solid #e5e7eb', fontWeight: 600, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#f4f1ea', zIndex: 1, color: '#374151' }}>{g.nome}</td>
                  {schema.map(c => {
                    if (!turnoApplicabileGiorno(c, g.num)) return <td key={c.id} style={{ border: '1px solid #e5e7eb', background: '#f3f4f6' }} />
                    const key = `${g.num}|${c.id}`
                    const slots = cellaSlots(g.num, c)
                    const vuota = slots.every(s => s === null)
                    return (
                      <td key={c.id} data-giorno={g.num} data-turno={c.id}
                        onDragOver={e => { e.preventDefault(); setOverKey(key) }}
                        onDragLeave={() => setOverKey(k => (k === key ? null : k))}
                        onDrop={e => { e.preventDefault(); handleDrop(g.num, c) }}
                        style={{ padding: '8px', verticalAlign: 'top', minWidth: 110, border: overKey === key ? '2px dashed #2e7d32' : '1px solid #e5e7eb', background: overKey === key ? '#eaf6ea' : '#fff', boxShadow: overKey === key ? 'inset 0 0 0 2px rgba(46,125,50,0.25)' : undefined, transition: 'background 0.1s' }}>
                        <div className="flex flex-col gap-2 items-start">
                          {slots.map((tid, slot) => tid ? (
                            <span key={slot} className="relative rounded px-2 py-0.5 text-[11px] font-medium shadow-sm" style={{ background: coloreTurnista(tid).bg, color: coloreTurnista(tid).fg }}>
                              {nomeTurnista(tid)}
                              <button onClick={() => set(`${g.num}|${c.id}|${slot}`, null)} title="Togli" className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center shadow" style={{ background: '#dc2626', color: '#fff', lineHeight: 1 }}><X size={10} strokeWidth={3} /></button>
                            </span>
                          ) : null)}
                          {vuota && <span className="text-[10px] text-stone-300 italic">trascina qui</span>}
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

      {/* Impostazione: ore minime settimanali per turnista */}
      <div className="card p-3 flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium" htmlFor="ore-min" style={{ color: '#3a3d30' }}>Numero di ore minimo a settimana per un turnista:</label>
        <input id="ore-min" type="number" min={0} value={oreMin} onChange={e => setOreMin(e.target.value)} onBlur={salvaOreMin}
          className="input text-sm w-24" placeholder="es. 36" />
        <span className="text-sm text-stone-500">ore</span>
        <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ background: '#e7efe1', color: '#476540' }} title="Tolleranza fissa">± 2 ore</span>
      </div>

      {/* Impostazione: cambio turno (approvazione automatica / del responsabile) */}
      {(() => {
        const auto = regoleVer?.cambio_auto ?? true
        return (
          <div className="card p-3 flex items-start gap-3">
            <button onClick={() => salvaCambioAuto(!auto)} role="switch" aria-checked={auto} title="Attiva/disattiva l'approvazione automatica"
              className="relative shrink-0 rounded-full transition-colors mt-0.5" style={{ width: 44, height: 24, background: auto ? '#2e7d32' : '#cbd5e1' }}>
              <span className="absolute top-0.5 rounded-full bg-white shadow transition-all" style={{ width: 20, height: 20, left: auto ? 22 : 2 }} />
            </button>
            <p className="text-sm font-medium leading-snug flex-1" style={{ color: '#3a3d30' }}>
              Cambio Turno: <strong style={{ color: auto ? '#166534' : '#b45309' }}>{auto ? 'automaticamente approvato' : 'soggetto ad approvazione'}</strong>{' '}
              <span className="text-stone-500 font-normal">({auto ? 'i turnisti fanno il cambio ed il sistema lo aggiorna in automatico' : 'è necessario che un Responsabile autorizzi o neghi il cambio che non sarà visibile fino all’approvazione'})</span>
            </p>
          </div>
        )
      })()}

      {warn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-4" role="alert">
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl shadow-2xl pointer-events-auto" style={{ background: '#fef3c7', borderLeft: '5px solid #d97706', color: '#78350f', maxWidth: 460, animation: 'fadeSlideIn 180ms ease-out' }}>
            <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: '#b45309' }} />
            <span className="text-sm font-medium leading-snug flex-1">{warn}</span>
            <button onClick={() => setWarn(null)} className="shrink-0 hover:opacity-70" style={{ color: '#92400e' }}><X size={16} /></button>
          </div>
        </div>
      )}
    </div>
  )
}
