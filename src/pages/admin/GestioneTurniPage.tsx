import { useState, useMemo, useRef, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, CalendarDays, AlertCircle, AlertTriangle, Save, RotateCcw, X, Phone } from 'lucide-react'
import { store } from '../../lib/store'
import { giorniDelMese, turnoSiApplica } from '../../lib/turniLogic'
import { isFestivo, isPrefestivo, isoDate } from '../../lib/holidays'
import { useStagedAssignments } from '../../hooks/useStagedAssignments'
import { useUnsaved } from '../../contexts/UnsavedContext'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmModal } from '../../components/ConfirmModal'
import type { TurnoSchema, Turnista, Turno, Livello, ConfigVersione } from '../../types'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const WD = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab']
const REP_SLOT = -1   // slot speciale per il reperibile
const ROLE_COLOR: Record<Livello, { bg: string; fg: string }> = {
  admin:    { bg: '#fef3c7', fg: '#92400e' },
  turnista: { bg: '#dbeafe', fg: '#1e40af' },
  esterno:  { bg: '#dcfce7', fg: '#166534' },
}
const thStyle: CSSProperties = { background: '#2b3c24', color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 10px', textAlign: 'left', border: '1px solid #1f2d18', position: 'sticky', top: 0, zIndex: 2 }
const tdBase: CSSProperties = { padding: '6px 10px', border: '1px solid #e5e7eb', verticalAlign: 'top' }

export function GestioneTurniPage() {
  const qc = useQueryClient()
  const { setHasUnsaved } = useUnsaved()
  const { confirm, confirmState } = useConfirm()
  const oggi = new Date()
  const [anno, setAnno] = useState(oggi.getFullYear())
  const [mese, setMese] = useState(oggi.getMonth() + 1)
  const [mostraRepMesi, setMostraRepMesi] = useState<Set<string>>(new Set())
  const meseKey = `${anno}-${String(mese).padStart(2, '0')}`

  const { data: versione, isLoading: loadingVer } = useQuery<ConfigVersione | null>({ queryKey: ['versione', meseKey], queryFn: () => store.getVersioneMese(meseKey) })
  const { data: schema = [] }   = useQuery<TurnoSchema[]>({ queryKey: ['schema', versione?.id], queryFn: () => store.getSchemaVersione(versione!.id), enabled: !!versione })
  const { data: turnisti = [] } = useQuery<Turnista[]>({ queryKey: ['turnisti'], queryFn: () => store.getTurnisti() })
  const { data: turni = [] }    = useQuery<Turno[]>({ queryKey: ['turni', anno, mese], queryFn: () => store.getTurniMese(anno, mese) })

  const serverMap = useMemo(() => {
    const m = new Map<string, string>()
    turni.forEach(t => { if (t.turnista_id) m.set(`${t.data}|${t.turno_schema_id}|${t.slot}`, t.turnista_id) })
    return m
  }, [turni])
  const { local, dirty, set, diff, discard } = useStagedAssignments(serverMap)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setHasUnsaved(dirty); return () => setHasUnsaved(false) }, [dirty, setHasUnsaved])
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const tById = useMemo(() => new Map(turnisti.map(t => [t.id, t])), [turnisti])
  const gruppoTurnisti = useMemo(() => turnisti.filter(t => t.livello !== 'esterno').slice().sort((a, b) => a.nome.localeCompare(b.nome, 'it')), [turnisti])
  const gruppoEsterni  = useMemo(() => turnisti.filter(t => t.livello === 'esterno').slice().sort((a, b) => a.nome.localeCompare(b.nome, 'it')), [turnisti])
  const nomeTurnista = (id: string) => tById.get(id)?.nome ?? '—'
  const coloreTurnista = (id: string) => ROLE_COLOR[tById.get(id)?.livello ?? 'turnista']

  const giorni = useMemo(() => giorniDelMese(anno, mese), [anno, mese])
  // Righe = ogni (giorno, turno applicabile)
  const righe = useMemo(() => {
    const out: { ds: string; d: Date; turno: TurnoSchema }[] = []
    giorni.forEach(d => schema.forEach(c => { if (turnoSiApplica(c, d)) out.push({ ds: isoDate(d), d, turno: c }) }))
    return out
  }, [giorni, schema])

  const hasRep = useMemo(() => [...local.keys()].some(k => k.endsWith(`|${REP_SLOT}`)), [local])
  const showRep = mostraRepMesi.has(meseKey) || hasRep

  // ── drag&drop ──
  const dragSource = useRef<string | null>(null)
  const touchActive = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
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
      const td = (document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null)?.closest('[data-data][data-turno][data-tipo]') as HTMLElement | null
      setOverKey(td ? `${td.dataset.data}|${td.dataset.turno}|${td.dataset.tipo}` : null)
    }
    el.addEventListener('touchmove', onMove, { passive: false })
    return () => el.removeEventListener('touchmove', onMove)
  }, [])

  function turnistiSlots(ds: string, turno: TurnoSchema): (string | null)[] {
    return Array.from({ length: turno.n_turnisti }, (_, slot) => local.get(`${ds}|${turno.id}|${slot}`) ?? null)
  }
  function handleDrop(ds: string, turno: TurnoSchema, tipo: string) {
    const tid = dragSource.current; dragSource.current = null; setOverKey(null)
    if (!tid) return
    if (tipo === 'reperibile') { set(`${ds}|${turno.id}|${REP_SLOT}`, tid); return }
    const slots = turnistiSlots(ds, turno)
    if (slots.includes(tid)) { showWarn(`${nomeTurnista(tid)} è già in questo turno.`); return }
    const free = slots.findIndex(s => s === null)
    if (free === -1) { showWarn(`Per il turno “${turno.nome || 'senza nome'}” bastano ${turno.n_turnisti} turnist${turno.n_turnisti === 1 ? 'a' : 'i'}.`); return }
    set(`${ds}|${turno.id}|${free}`, tid)
  }

  function cambiaMese(delta: number) {
    if (dirty && !window.confirm('Hai modifiche non salvate. Cambiare mese senza salvarle?')) return
    if (dirty) discard()
    let m = mese + delta, a = anno
    if (m < 1) { m = 12; a-- } else if (m > 12) { m = 1; a++ }
    setMese(m); setAnno(a)
  }
  async function aggiungiReperibile() {
    const ok = await confirm({ title: 'Aggiungi reperibile', message: 'Aggiungere la colonna “Reperibile” per assegnare un reperibile a ogni turno?', confirmLabel: 'Aggiungi' })
    if (ok) setMostraRepMesi(prev => { const n = new Set(prev); n.add(meseKey); return n })
  }
  async function salva() {
    setSaving(true)
    try {
      for (const c of diff()) { const [data, turnoId, slot] = c.key.split('|'); await store.setAssegnazione(data, turnoId, +slot, c.value) }
      await qc.invalidateQueries({ queryKey: ['turni', anno, mese] })
    } catch (e) { console.error('[Turni] salvataggio fallito:', e); alert('Errore nel salvataggio.') }
    finally { setSaving(false) }
  }

  const Header = (
    <div className="flex items-center gap-3">
      <CalendarDays size={22} style={{ color: '#476540' }} />
      <h1 className="text-2xl font-bold" style={{ color: '#2b3c24' }}>Turni del Mese</h1>
      <div className="ml-auto flex items-center gap-2">
        <button onClick={() => cambiaMese(-1)} className="btn-secondary px-2 py-1"><ChevronLeft size={16} /></button>
        <span className="font-semibold text-sm text-center" style={{ color: '#3a3d30', minWidth: 140 }}>{MESI[mese - 1]} {anno}</span>
        <button onClick={() => cambiaMese(1)} className="btn-secondary px-2 py-1"><ChevronRight size={16} /></button>
      </div>
    </div>
  )

  if (loadingVer) return <div className="max-w-5xl mx-auto p-6">{Header}<p className="text-sm text-stone-500 mt-4">Caricamento…</p></div>
  if (!versione || schema.length === 0) {
    return (
      <div className="max-w-5xl mx-auto p-6">{Header}
        <div className="card p-5 flex items-start gap-3 mt-4"><AlertCircle className="shrink-0 mt-0.5" style={{ color: '#b45309' }} size={18} />
          <p className="text-sm text-stone-600">Nessuna configurazione turni per <strong>{MESI[mese - 1]} {anno}</strong>. Impostala prima in <strong>Configurazione Turni</strong> (passo ①).</p>
        </div>
      </div>
    )
  }

  const PaletteBadge = (t: Turnista) => (
    <div key={t.id} draggable={true}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'copyMove'; e.dataTransfer.setData('text/plain', t.id); dragSource.current = t.id; setDraggingId(t.id) }}
      onDragEnd={() => { setDraggingId(null); setOverKey(null); dragSource.current = null }}
      onTouchStart={() => { dragSource.current = t.id; touchActive.current = true; setDraggingId(t.id) }}
      className="rounded-md px-2 py-1 text-xs font-medium select-none shadow-sm border border-white/60 truncate transition-opacity"
      style={{ background: ROLE_COLOR[t.livello].bg, color: ROLE_COLOR[t.livello].fg, cursor: 'grab', opacity: draggingId === t.id ? 0.4 : 1, touchAction: 'none' }}
      title={`Trascina ${t.nome}`}>{t.nome}</div>
  )
  const Chip = (tid: string, onX: () => void) => (
    <span className="relative rounded px-2 py-0.5 text-[11px] font-medium shadow-sm" style={{ background: coloreTurnista(tid).bg, color: coloreTurnista(tid).fg }}>
      {nomeTurnista(tid)}
      <button onClick={onX} title="Togli" className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center shadow" style={{ background: '#dc2626', color: '#fff', lineHeight: 1 }}><X size={10} strokeWidth={3} /></button>
    </span>
  )
  const dropStyle = (key: string): CSSProperties => ({
    ...tdBase, minWidth: 150,
    border: overKey === key ? '2px dashed #2e7d32' : '1px solid #e5e7eb',
    background: overKey === key ? '#eaf6ea' : '#fff',
    boxShadow: overKey === key ? 'inset 0 0 0 2px rgba(46,125,50,0.25)' : undefined,
  })

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />
      {Header}

      {/* Barra azioni / salvataggio */}
      <div className="flex items-center gap-2 flex-wrap">
        {!showRep && <button onClick={aggiungiReperibile} className="btn-secondary text-sm py-1.5 px-3"><Phone size={14} /> Aggiungi Reperibile</button>}
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

      {turnisti.length === 0 && <div className="card p-3 text-sm" style={{ color: '#92400e', background: '#fef3c7' }}>Aggiungi prima dei turnisti nella pagina <strong>Turnisti</strong>.</div>}

      <div ref={containerRef} className="flex gap-3 items-start"
        onTouchEnd={e => {
          if (!touchActive.current) return
          touchActive.current = false; setOverKey(null); setDraggingId(null)
          const t = e.changedTouches[0]
          const td = (document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null)?.closest('[data-data][data-turno][data-tipo]') as HTMLElement | null
          if (td?.dataset.data && td.dataset.turno && td.dataset.tipo) { const turno = schema.find(s => s.id === td!.dataset.turno); if (turno) handleDrop(td.dataset.data, turno, td.dataset.tipo) }
          else dragSource.current = null
        }}>

        {/* Palette */}
        <aside className="w-40 sm:w-44 shrink-0 space-y-3" style={{ position: 'sticky', top: 8 }}>
          <div className="card p-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider px-1 mb-1.5" style={{ color: '#476540' }}>Turnisti</h3>
            <div className="flex flex-col gap-1.5">{gruppoTurnisti.length ? gruppoTurnisti.map(PaletteBadge) : <span className="text-xs text-stone-400 px-1">nessuno</span>}</div>
          </div>
          <div className="card p-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider px-1 mb-1.5" style={{ color: '#166534' }}>Esterni</h3>
            <div className="flex flex-col gap-1.5">{gruppoEsterni.length ? gruppoEsterni.map(PaletteBadge) : <span className="text-xs text-stone-400 px-1">nessuno</span>}</div>
          </div>
        </aside>

        {/* Lista turni */}
        <div className="flex-1 min-w-0 overflow-auto card">
          <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, left: 0, zIndex: 3 }}>Turno</th>
                <th style={thStyle}>Turnisti</th>
                {showRep && <th style={thStyle}>Reperibile</th>}
              </tr>
            </thead>
            <tbody>
              {righe.map(({ ds, d, turno }) => {
                const fest = isFestivo(d), pref = isPrefestivo(d)
                const dayColor = fest ? '#b91c1c' : pref ? '#b45309' : '#2b3c24'
                const rowBg = fest ? '#fdecea' : pref ? '#fff5e6' : '#fff'
                const kT = `${ds}|${turno.id}|turnisti`, kR = `${ds}|${turno.id}|reperibile`
                const slots = turnistiSlots(ds, turno)
                const rep = local.get(`${ds}|${turno.id}|${REP_SLOT}`) ?? null
                return (
                  <tr key={`${ds}|${turno.id}`} style={{ background: rowBg }}>
                    <td style={{ ...tdBase, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: rowBg, zIndex: 1 }}>
                      <span style={{ fontWeight: 700, color: dayColor }}>{d.getDate()} {WD[d.getDay()]}</span>
                      <span style={{ color: '#475569' }}> · {turno.nome || 'Turno'}</span>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{turno.ora_inizio}–{turno.ora_fine}</div>
                    </td>
                    <td data-data={ds} data-turno={turno.id} data-tipo="turnisti"
                      onDragOver={e => { e.preventDefault(); setOverKey(kT) }} onDragLeave={() => setOverKey(k => k === kT ? null : k)} onDrop={e => { e.preventDefault(); handleDrop(ds, turno, 'turnisti') }}
                      style={dropStyle(kT)}>
                      <div className="flex flex-wrap gap-2 items-start">
                        {slots.map((tid, slot) => tid ? <span key={slot}>{Chip(tid, () => set(`${ds}|${turno.id}|${slot}`, null))}</span> : null)}
                        {slots.every(s => s === null) && <span className="text-[10px] text-stone-300 italic">trascina qui</span>}
                      </div>
                    </td>
                    {showRep && (
                      <td data-data={ds} data-turno={turno.id} data-tipo="reperibile"
                        onDragOver={e => { e.preventDefault(); setOverKey(kR) }} onDragLeave={() => setOverKey(k => k === kR ? null : k)} onDrop={e => { e.preventDefault(); handleDrop(ds, turno, 'reperibile') }}
                        style={dropStyle(kR)}>
                        {rep ? Chip(rep, () => set(`${ds}|${turno.id}|${REP_SLOT}`, null)) : <span className="text-[10px] text-stone-300 italic">trascina qui</span>}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

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
