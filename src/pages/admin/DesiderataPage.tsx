import { useState, useMemo, useRef, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ClipboardList, AlertCircle, AlertTriangle, Save, RotateCcw, X, CalendarRange, Check } from 'lucide-react'
import { store } from '../../lib/store'
import { giorniDelMese, turnoSiApplica } from '../../lib/turniLogic'
import { isFestivo, isPrefestivo, isoDate } from '../../lib/holidays'
import { useStagedAssignments } from '../../hooks/useStagedAssignments'
import { useUnsaved } from '../../contexts/UnsavedContext'
import type { TurnoSchema, Turnista, Livello, ConfigVersione, Desiderata, DesiderataFinestra, TipoDesiderata } from '../../types'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const WD = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab']
const ROLE_COLOR: Record<Livello, { bg: string; fg: string }> = {
  admin:    { bg: '#fef3c7', fg: '#92400e' },
  turnista: { bg: '#dbeafe', fg: '#1e40af' },
  esterno:  { bg: '#dcfce7', fg: '#166534' },
}
const COL: Record<TipoDesiderata, { th: string; badge: string }> = {
  desiderata:      { th: '#15803d', badge: '#16a34a' },
  indisponibilita: { th: '#b91c1c', badge: '#dc2626' },
}
const thStyle: CSSProperties = { background: '#2b3c24', color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 10px', textAlign: 'left', border: '1px solid #1f2d18', position: 'sticky', top: 0, zIndex: 2 }
const tdBase: CSSProperties = { padding: '6px 10px', border: '1px solid #e5e7eb', verticalAlign: 'top' }

export function DesiderataPage() {
  const qc = useQueryClient()
  const { setHasUnsaved } = useUnsaved()
  const oggi = new Date()
  const [anno, setAnno] = useState(oggi.getFullYear())
  const [mese, setMese] = useState(oggi.getMonth() + 1)
  const meseKey = `${anno}-${String(mese).padStart(2, '0')}`

  const { data: versione, isLoading: loadingVer } = useQuery<ConfigVersione | null>({ queryKey: ['versione', meseKey], queryFn: () => store.getVersioneMese(meseKey) })
  const { data: schema = [] }   = useQuery<TurnoSchema[]>({ queryKey: ['schema', versione?.id], queryFn: () => store.getSchemaVersione(versione!.id), enabled: !!versione })
  const { data: turnisti = [] } = useQuery<Turnista[]>({ queryKey: ['turnisti'], queryFn: () => store.getTurnisti() })
  const { data: desiderata = [] } = useQuery<Desiderata[]>({ queryKey: ['desiderata', anno, mese], queryFn: () => store.getDesiderataMese(anno, mese) })
  const { data: finestra } = useQuery<DesiderataFinestra | null>({ queryKey: ['desiderata-finestra', meseKey], queryFn: () => store.getDesiderataFinestra(meseKey) })

  // serverMap: chiave `data|turnoId|turnistaId` → tipo ('desiderata'|'indisponibilita')
  const serverMap = useMemo(() => {
    const m = new Map<string, string>()
    desiderata.forEach(d => m.set(`${d.data}|${d.turno_schema_id}|${d.turnista_id}`, d.tipo))
    return m
  }, [desiderata])
  const { local, dirty, set, diff, discard } = useStagedAssignments(serverMap)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setHasUnsaved(dirty); return () => setHasUnsaved(false) }, [dirty, setHasUnsaved])
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const tById = useMemo(() => new Map(turnisti.map(t => [t.id, t])), [turnisti])
  // palette = TUTTI i turnisti (elenco completo), divisi per ruolo
  const gruppoTurnisti = useMemo(() => turnisti.filter(t => t.livello !== 'esterno').slice().sort((a, b) => a.nome.localeCompare(b.nome, 'it')), [turnisti])
  const gruppoEsterni  = useMemo(() => turnisti.filter(t => t.livello === 'esterno').slice().sort((a, b) => a.nome.localeCompare(b.nome, 'it')), [turnisti])
  const nomeTurnista = (id: string) => tById.get(id)?.nome ?? '—'

  // raggruppa il contenuto delle celle: `data|turnoId|tipo` → [turnistaId]
  const byCell = useMemo(() => {
    const m = new Map<string, string[]>()
    local.forEach((tipo, key) => {
      const i1 = key.indexOf('|'), i2 = key.indexOf('|', i1 + 1)
      const ds = key.slice(0, i1), turnoId = key.slice(i1 + 1, i2), tid = key.slice(i2 + 1)
      const ck = `${ds}|${turnoId}|${tipo}`
      const arr = m.get(ck); if (arr) arr.push(tid); else m.set(ck, [tid])
    })
    return m
  }, [local])

  const giorni = useMemo(() => giorniDelMese(anno, mese), [anno, mese])
  const righe = useMemo(() => {
    const out: { ds: string; d: Date; turno: TurnoSchema }[] = []
    giorni.forEach(d => schema.forEach(c => { if (turnoSiApplica(c, d)) out.push({ ds: isoDate(d), d, turno: c }) }))
    return out
  }, [giorni, schema])

  // ── drag&drop ──
  const dragSource = useRef<string | null>(null)
  const touchActive = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  // mini-elenco "clicca per aggiungere"
  const [picker, setPicker] = useState<{ ds: string; turnoId: string; tipo: TipoDesiderata; x: number; y: number } | null>(null)
  const pickerCandidati = useMemo(() => {
    if (!picker) return []
    const inCella = new Set(byCell.get(`${picker.ds}|${picker.turnoId}|${picker.tipo}`) ?? [])
    return turnisti.filter(t => !inCella.has(t.id)).slice().sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
  }, [picker, byCell, turnisti])

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

  function handleDrop(ds: string, turno: TurnoSchema, tipo: string) {
    const tid = dragSource.current; dragSource.current = null; setOverKey(null)
    if (!tid) return
    set(`${ds}|${turno.id}|${tid}`, tipo)   // sovrascrive l'eventuale altra colonna dello stesso turno
  }

  function cambiaMese(delta: number) {
    if (dirty && !window.confirm('Hai modifiche non salvate. Cambiare mese senza salvarle?')) return
    if (dirty) discard()
    let m = mese + delta, a = anno
    if (m < 1) { m = 12; a-- } else if (m > 12) { m = 1; a++ }
    setMese(m); setAnno(a); setPicker(null)
  }
  async function salva() {
    setSaving(true)
    try {
      for (const c of diff()) { const [data, turnoId, tid] = c.key.split('|'); await store.setDesiderata(data, turnoId, tid, c.value as TipoDesiderata | null) }
      await qc.invalidateQueries({ queryKey: ['desiderata', anno, mese] })
    } catch (e) { console.error('[Desiderata] salvataggio fallito:', e); alert('Errore nel salvataggio.') }
    finally { setSaving(false) }
  }

  // ── finestra di raccolta (periodo aperto ai turnisti) ──
  const [finDa, setFinDa] = useState(''); const [finA, setFinA] = useState('')
  const [finMsg, setFinMsg] = useState<string | null>(null)
  useEffect(() => { setFinDa(finestra?.aperta_da ?? ''); setFinA(finestra?.aperta_a ?? '') }, [finestra])
  async function salvaFinestra() {
    try {
      await store.setDesiderataFinestra(meseKey, finDa || null, finA || null)
      await qc.invalidateQueries({ queryKey: ['desiderata-finestra', meseKey] })
      setFinMsg('Periodo salvato'); setTimeout(() => setFinMsg(null), 2500)
    } catch (e) { console.error(e); alert('Errore nel salvataggio del periodo.') }
  }

  const Header = (
    <div className="flex items-center gap-3">
      <ClipboardList size={22} style={{ color: '#476540' }} />
      <h1 className="text-2xl font-bold" style={{ color: '#2b3c24' }}>Desiderata / Indisponibilità</h1>
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
      className="rounded-md px-2 py-1 text-xs font-medium select-none shadow-sm border border-white/60 transition-opacity"
      style={{ background: ROLE_COLOR[t.livello].bg, color: ROLE_COLOR[t.livello].fg, cursor: 'grab', opacity: draggingId === t.id ? 0.4 : 1, touchAction: 'none' }}
      title={`Trascina ${t.nome}`}>{t.nome}</div>
  )
  const Badge = (ds: string, turnoId: string, tid: string, tipo: TipoDesiderata) => (
    <span data-badge key={tid} className="relative rounded px-2 py-0.5 text-[11px] font-semibold shadow-sm" style={{ background: COL[tipo].badge, color: '#fff' }}>
      {nomeTurnista(tid)}
      <button onClick={() => set(`${ds}|${turnoId}|${tid}`, null)} title="Togli" className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center shadow" style={{ background: '#fff', color: COL[tipo].badge, lineHeight: 1 }}><X size={10} strokeWidth={3} /></button>
    </span>
  )
  const dropStyle = (key: string): CSSProperties => ({
    ...tdBase, width: '50%', minWidth: 170, cursor: 'copy',
    border: overKey === key ? '2px dashed #2e7d32' : '1px solid #e5e7eb',
    background: overKey === key ? '#eaf6ea' : '#fff',
    boxShadow: overKey === key ? 'inset 0 0 0 2px rgba(46,125,50,0.25)' : undefined,
  })
  const Cella = (ds: string, turno: TurnoSchema, tipo: TipoDesiderata) => {
    const k = `${ds}|${turno.id}|${tipo}`
    const ids = byCell.get(k) ?? []
    return (
      <td data-data={ds} data-turno={turno.id} data-tipo={tipo}
        onDragOver={e => { e.preventDefault(); setOverKey(k) }} onDragLeave={() => setOverKey(p => p === k ? null : p)} onDrop={e => { e.preventDefault(); handleDrop(ds, turno, tipo) }}
        onClick={e => { if ((e.target as HTMLElement).closest('[data-badge]')) return; setPicker({ ds, turnoId: turno.id, tipo, x: e.clientX, y: e.clientY }) }}
        style={dropStyle(k)}>
        <div className="flex flex-wrap gap-2 items-start">
          {ids.map(tid => Badge(ds, turno.id, tid, tipo))}
          {!ids.length && <span className="text-[10px] text-stone-300 italic">trascina o clicca</span>}
        </div>
      </td>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {Header}

      {/* Finestra di raccolta */}
      <div className="card p-3 flex items-center gap-3 flex-wrap">
        <CalendarRange size={18} style={{ color: '#476540' }} />
        <span className="text-sm font-semibold" style={{ color: '#2b3c24' }}>Raccolta aperta ai turnisti</span>
        <label className="text-xs flex items-center gap-1" style={{ color: '#475569' }}>dal
          <input type="date" value={finDa} onChange={e => setFinDa(e.target.value)} className="border rounded px-2 py-1 text-xs" style={{ borderColor: '#d6d3cc' }} /></label>
        <label className="text-xs flex items-center gap-1" style={{ color: '#475569' }}>al
          <input type="date" value={finA} onChange={e => setFinA(e.target.value)} className="border rounded px-2 py-1 text-xs" style={{ borderColor: '#d6d3cc' }} /></label>
        <button onClick={salvaFinestra} className="btn-secondary text-xs py-1 px-2.5">Salva periodo</button>
        {finMsg && <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: '#166534' }}><Check size={13} /> {finMsg}</span>}
        <span className="text-[11px] text-stone-400 w-full">La pagina di compilazione lato-turnista userà questo periodo (in arrivo).</span>
      </div>

      {/* Barra azioni / salvataggio */}
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

        {/* Palette = elenco completo */}
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

        {/* Griglia turni */}
        <div className="flex-1 min-w-0 overflow-auto card">
          <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, left: 0, zIndex: 3, width: 1, whiteSpace: 'nowrap' }}>Turno</th>
                <th style={{ ...thStyle, background: COL.desiderata.th }}>Desiderata</th>
                <th style={{ ...thStyle, background: COL.indisponibilita.th }}>Indisponibilità</th>
              </tr>
            </thead>
            <tbody>
              {righe.map(({ ds, d, turno }) => {
                const fest = isFestivo(d), pref = isPrefestivo(d)
                const dayColor = fest ? '#b91c1c' : pref ? '#b45309' : '#2b3c24'
                const rowBg = fest ? '#fdecea' : pref ? '#fff5e6' : '#fff'
                return (
                  <tr key={`${ds}|${turno.id}`} style={{ background: rowBg }}>
                    <td style={{ ...tdBase, whiteSpace: 'nowrap', width: 1, position: 'sticky', left: 0, background: rowBg, zIndex: 1 }}>
                      <div className="flex items-center gap-1.5">
                        <span style={{ fontWeight: 700, color: dayColor }}>{d.getDate()} {WD[d.getDay()]}</span>
                        <span style={{ color: '#475569' }}>· {turno.nome || 'Turno'}</span>
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{turno.ora_inizio}–{turno.ora_fine}</div>
                    </td>
                    {Cella(ds, turno, 'desiderata')}
                    {Cella(ds, turno, 'indisponibilita')}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mini-elenco vicino al puntatore */}
      {picker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPicker(null)} />
          <div className="fixed z-50 card p-1.5 shadow-2xl" style={{ left: Math.max(8, Math.min(picker.x, window.innerWidth - 200)), top: Math.max(8, Math.min(picker.y, window.innerHeight - 270)), width: 190, maxHeight: 260, overflow: 'auto', animation: 'fadeSlideIn 120ms ease-out' }} onClick={e => e.stopPropagation()}>
            <p className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-1" style={{ color: COL[picker.tipo].th }}>
              {picker.tipo === 'desiderata' ? '＋ Desiderata' : '＋ Indisponibilità'}
            </p>
            {pickerCandidati.length ? pickerCandidati.map(t => (
              <button key={t.id} onClick={() => { set(`${picker.ds}|${picker.turnoId}|${t.id}`, picker.tipo); setPicker(null) }}
                className="flex items-center gap-1.5 w-full text-left px-1.5 py-1 rounded hover:bg-stone-100 text-xs">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ROLE_COLOR[t.livello].fg }} />
                <span className="truncate">{t.nome}</span>
              </button>
            )) : <p className="text-xs text-stone-400 px-1.5 py-1">tutti già inseriti</p>}
          </div>
        </>
      )}
    </div>
  )
}
