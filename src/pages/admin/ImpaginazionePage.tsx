import { useState, useMemo, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, LayoutGrid, AlertCircle, AlertTriangle, Plus, X, Trash2, Moon, Sun, Save, RotateCcw, Infinity as InfinityIcon } from 'lucide-react'
import { store } from '../../lib/store'
import { fineEffettiva, prossimoInizio } from '../../lib/turniLogic'
import { usePostazione } from '../../contexts/PostazioneContext'
import { useMeseSelezionato } from '../../hooks/useMeseSelezionato'
import { useUnsaved } from '../../contexts/UnsavedContext'
import type { TurnoSchema, ConfigVersione, ImpaginazioneVersione, Foglio, FoglioTurno } from '../../types'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const meseLabel = (key: string) => { const [a, m] = key.split('-').map(Number); return `${MESI[m - 1]} ${a}` }
const FOGLIO_COLORI = [
  { bg: '#dbeafe', fg: '#1e40af', br: '#93c5fd' },
  { bg: '#dcfce7', fg: '#166534', br: '#86efac' },
  { bg: '#fef3c7', fg: '#92400e', br: '#fbbf24' },
  { bg: '#fae8ff', fg: '#86198f', br: '#e9a8f5' },
  { bg: '#ffe4e6', fg: '#9f1239', br: '#fda4af' },
  { bg: '#cffafe', fg: '#155e75', br: '#67e8f9' },
]
const coloreFoglio = (i: number) => FOGLIO_COLORI[((i % FOGLIO_COLORI.length) + FOGLIO_COLORI.length) % FOGLIO_COLORI.length]
type FoglioBozza = { id: string; nome: string; ordine: number }

function ValiditaControls({ versione, onChange }: { versione: ImpaginazioneVersione; onChange: (v: string | null) => void }) {
  const perSempre = versione.valido_fino === null
  const [ey, em] = (versione.valido_fino ?? versione.valido_da).split('-').map(Number)
  const anni = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + i)
  return (
    <div className="card p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-sm font-semibold" style={{ color: '#2b3c24' }}>Validità impaginazione:</span>
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

export function ImpaginazionePage() {
  const qc = useQueryClient()
  const { setHasUnsaved } = useUnsaved()
  const { postazioneId, postazioneAttiva } = usePostazione()
  const oggi = new Date()
  const { anno, mese, meseKey, setMeseAnno } = useMeseSelezionato()
  const [attivo, setAttivo] = useState<string | null>(null)   // foglio attivo

  const { data: configVer, isLoading: loadingConfig } = useQuery<ConfigVersione | null>({ queryKey: ['versione', postazioneId, meseKey], queryFn: () => store.getVersioneMese(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: schema = [] } = useQuery<TurnoSchema[]>({ queryKey: ['schema', configVer?.id], queryFn: () => store.getSchemaVersione(configVer!.id), enabled: !!configVer })
  const { data: impagVer, isLoading: loadingImpag } = useQuery<ImpaginazioneVersione | null>({ queryKey: ['impag-versione', postazioneId, meseKey], queryFn: () => store.getImpaginazioneVersioneMese(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: tutteVer = [] } = useQuery<ImpaginazioneVersione[]>({ queryKey: ['impag-versioni-all', postazioneId], queryFn: () => store.getImpaginazioneVersioni(postazioneId!), enabled: !!postazioneId })
  const { data: fogli = [] } = useQuery<Foglio[]>({ queryKey: ['fogli', impagVer?.id], queryFn: () => store.getFogli(impagVer!.id), enabled: !!impagVer })
  const { data: foglioTurni = [] } = useQuery<FoglioTurno[]>({ queryKey: ['foglio-turni', impagVer?.id], queryFn: () => store.getFoglioTurni(impagVer!.id), enabled: !!impagVer })

  // ── bozza locale (salvataggio ESPLICITO, niente autosave) ──
  const [draftFogli, setDraftFogli] = useState<FoglioBozza[]>([])
  const [draftAssegn, setDraftAssegn] = useState<Map<string, string>>(new Map())
  const [saving, setSaving] = useState(false)
  const editing = useRef(false)
  const tmpRef = useRef(0)

  // riallinea la bozza dal server quando non si sta editando
  useEffect(() => {
    if (editing.current) return
    setDraftFogli(fogli.map(f => ({ id: f.id, nome: f.nome, ordine: f.ordine })))
    setDraftAssegn(new Map(foglioTurni.map(ft => [ft.turno_schema_id, ft.foglio_id])))
  }, [fogli, foglioTurni])

  const serverNome = useMemo(() => new Map(fogli.map(f => [f.id, f.nome])), [fogli])
  const serverAssegn = useMemo(() => new Map(foglioTurni.map(ft => [ft.turno_schema_id, ft.foglio_id])), [foglioTurni])
  const dirty = useMemo(() => {
    if (draftFogli.length !== fogli.length) return true
    for (const f of draftFogli) { if (f.id.startsWith('tmp-')) return true; if (serverNome.get(f.id) !== f.nome) return true }
    if (draftAssegn.size !== serverAssegn.size) return true
    for (const [k, v] of draftAssegn) { if (serverAssegn.get(k) !== v) return true }
    return false
  }, [draftFogli, draftAssegn, fogli.length, serverNome, serverAssegn])

  useEffect(() => { if (!dirty) editing.current = false }, [dirty])
  useEffect(() => { setHasUnsaved(dirty); return () => setHasUnsaved(false) }, [dirty, setHasUnsaved])
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const indiceFoglio = useMemo(() => { const m = new Map<string, number>(); draftFogli.forEach((f, i) => m.set(f.id, i)); return m }, [draftFogli])
  const contaTurni = useMemo(() => { const m = new Map<string, number>(); draftAssegn.forEach(fid => m.set(fid, (m.get(fid) ?? 0) + 1)); return m }, [draftAssegn])

  const [warn, setWarn] = useState<string | null>(null)
  function showWarn(msg: string) { setWarn(msg); window.setTimeout(() => setWarn(null), 3000) }

  function cambiaMese(delta: number) {
    if (dirty && !window.confirm('Hai modifiche non salvate. Cambiare mese senza salvarle?')) return
    editing.current = false
    let m = mese + delta, a = anno; if (m < 1) { m = 12; a-- } else if (m > 12) { m = 1; a++ }
    setMeseAnno(a, m); setAttivo(null)
  }
  // operazioni sulla VERSIONE (immediate: creare/cancellare la versione, validità)
  async function configura() { await store.creaImpaginazioneVersione(postazioneId!, meseKey); await qc.invalidateQueries({ queryKey: ['impag-versione'] }); await qc.invalidateQueries({ queryKey: ['impag-versioni-all'] }) }
  async function cambiaValidita(v: string | null) { if (!impagVer) return; await store.setValiditaImpaginazioneVersione(impagVer.id, v); await qc.invalidateQueries({ queryKey: ['impag-versione'] }); await qc.invalidateQueries({ queryKey: ['impag-versioni-all'] }) }
  async function cancella() {
    if (!impagVer) return
    if (!window.confirm(`Cancellare l'impaginazione valida da ${meseLabel(impagVer.valido_da)}? Non è reversibile.`)) return
    editing.current = false; setAttivo(null)
    await store.deleteImpaginazioneVersione(impagVer.id)
    await qc.invalidateQueries({ queryKey: ['impag-versione'] }); await qc.invalidateQueries({ queryKey: ['impag-versioni-all'] })
  }

  // ── operazioni sulla BOZZA (no autosave: si applicano col Salva) ──
  function aggiungiFoglio() {
    editing.current = true
    const id = `tmp-${++tmpRef.current}`
    const ordine = draftFogli.reduce((mx, f) => Math.max(mx, f.ordine), 0) + 10
    setDraftFogli(prev => [...prev, { id, nome: `Turni ${prev.length + 1}`, ordine }])
    setAttivo(id)
  }
  function rinomina(id: string, nome: string) { editing.current = true; setDraftFogli(prev => prev.map(f => f.id === id ? { ...f, nome } : f)) }
  function elimina(id: string) {
    editing.current = true
    setDraftFogli(prev => prev.filter(f => f.id !== id))
    setDraftAssegn(prev => { const n = new Map(prev); for (const [k, v] of n) if (v === id) n.delete(k); return n })
    if (attivo === id) setAttivo(null)
  }
  function assegna(turnoId: string) {
    if (!attivo) { showWarn('Seleziona prima un foglio (o creane uno) a cui assegnare il turno.'); return }
    editing.current = true
    setDraftAssegn(prev => { const n = new Map(prev); if (n.get(turnoId) === attivo) n.delete(turnoId); else n.set(turnoId, attivo); return n })
  }
  function annulla() {
    editing.current = false
    setDraftFogli(fogli.map(f => ({ id: f.id, nome: f.nome, ordine: f.ordine })))
    setDraftAssegn(new Map(foglioTurni.map(ft => [ft.turno_schema_id, ft.foglio_id])))
    setAttivo(null)
  }
  async function salva() {
    if (!impagVer) return
    setSaving(true)
    try {
      const draftIds = new Set(draftFogli.map(f => f.id))
      for (const f of fogli) if (!draftIds.has(f.id)) await store.deleteFoglio(f.id)
      const idMap = new Map<string, string>()
      for (const f of draftFogli) {
        if (f.id.startsWith('tmp-')) { const nuovo = await store.addFoglio(impagVer.id, f.nome.trim() || 'Foglio'); idMap.set(f.id, nuovo.id) }
        else if (serverNome.get(f.id) !== f.nome) await store.renameFoglio(f.id, f.nome.trim() || 'Foglio')
      }
      const realId = (fid: string) => idMap.get(fid) ?? fid
      const finale = new Map<string, string>(); draftAssegn.forEach((fid, t) => finale.set(t, realId(fid)))
      const turni = new Set<string>([...finale.keys(), ...serverAssegn.keys()])
      for (const t of turni) {
        const nuovo = finale.get(t) ?? null
        const vecchio = serverAssegn.get(t) ?? null
        if (nuovo !== vecchio) await store.setFoglioTurno(impagVer.id, t, nuovo)
      }
      if (attivo && idMap.has(attivo)) setAttivo(idMap.get(attivo)!)
      editing.current = false
      store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'impaginazione', messaggio: `Impaginazione (fogli) di ${meseLabel(meseKey)} aggiornata · ${draftFogli.length} fogl${draftFogli.length === 1 ? 'io' : 'i'}.`, target: '/admin/impaginazione', perAdmin: true }).catch(() => {})
      await qc.invalidateQueries({ queryKey: ['fogli', impagVer.id] })
      await qc.invalidateQueries({ queryKey: ['foglio-turni', impagVer.id] })
    } catch (e) { console.error('[Impaginazione] salvataggio fallito:', e); alert('Errore nel salvataggio.') }
    finally { setSaving(false) }
  }

  const Header = (
    <div className="flex items-center gap-3 flex-wrap">
      <LayoutGrid size={22} style={{ color: '#476540' }} />
      <h1 className="text-2xl font-bold" style={{ color: '#2b3c24' }}>Impaginazione{postazioneAttiva ? ` - ${postazioneAttiva.nome}` : ''}</h1>
      <div className="flex items-center gap-2">
        <button onClick={() => cambiaMese(-1)} className="btn-secondary px-2 py-1"><ChevronLeft size={16} /></button>
        <span className="font-bold text-lg text-center" style={{ color: '#3a3d30', minWidth: 130 }}>{MESI[mese - 1]} {anno}</span>
        <button onClick={() => cambiaMese(1)} className="btn-secondary px-2 py-1"><ChevronRight size={16} /></button>
      </div>
    </div>
  )
  const wrap = (children: ReactNode) => <div className="p-4 sm:p-6 space-y-4">{Header}{children}</div>

  if (!postazioneId) return wrap(<p className="text-sm text-stone-500">Caricamento postazione…</p>)
  if (loadingConfig) return wrap(<p className="text-sm text-stone-500">Caricamento…</p>)
  if (!configVer || schema.length === 0) return wrap(<div className="card p-5 flex items-start gap-3"><AlertCircle className="shrink-0 mt-0.5" style={{ color: '#b45309' }} size={18} /><p className="text-sm text-stone-600">Nessun turno configurato per <strong>{MESI[mese - 1]} {anno}</strong>. Imposta prima i turni in <strong>Configurazione Turni</strong> (passo ①).</p></div>)
  if (loadingImpag) return wrap(<p className="text-sm text-stone-500">Caricamento…</p>)
  if (!impagVer) {
    return wrap(
      <div className="card p-8 text-center">
        <LayoutGrid size={32} className="mx-auto mb-2" style={{ color: '#9ab488' }} />
        <p className="text-sm text-stone-600 mb-1">Nessuna impaginazione per <strong>{MESI[mese - 1]} {anno}</strong>.</p>
        <p className="text-xs text-stone-400 mb-4">Crea un'impaginazione valida da questo mese: poi potrai dividere i turni in fogli. È necessaria per fare Desiderata e Turni del Mese.</p>
        <button onClick={configura} className="btn-primary text-sm mx-auto"><Plus size={16} /> Imposta l'impaginazione per questo mese</button>
      </div>
    )
  }

  const eff = fineEffettiva(impagVer, tutteVer)
  const nxt = prossimoInizio(impagVer, tutteVer)
  const nonAssegnati = schema.filter(s => !draftAssegn.has(s.id))
  const foglioAttivo = draftFogli.find(f => f.id === attivo)

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {Header}
      <ValiditaControls versione={impagVer} onChange={cambiaValidita} />
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs text-stone-500 flex-1">Valida da <strong>{meseLabel(impagVer.valido_da)}</strong>{eff ? <> a <strong>{meseLabel(eff)}</strong></> : <> in poi (per sempre)</>}{nxt && <span className="text-amber-700"> · dal {meseLabel(nxt)} subentra un periodo più recente</span>}.</p>
        <button onClick={cancella} className="btn-danger text-xs py-1 px-2 shrink-0"><Trash2 size={13} /> Cancella impaginazione</button>
      </div>

      {/* Barra salvataggio */}
      <div className="flex items-center gap-2 flex-wrap">
        {dirty && <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24' }}><AlertTriangle size={13} /> Modifiche non salvate</span>}
        <div className="ml-auto flex items-center gap-2">
          {dirty && <button onClick={annulla} className="btn-secondary text-xs py-1.5 px-3"><RotateCcw size={13} /> Annulla</button>}
          <button onClick={salva} disabled={!dirty || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:cursor-default"
            style={dirty ? { background: '#2e7d32', color: '#fff' } : { background: '#f3f4f6', color: '#9ca3af' }}>
            <Save size={15} /> {saving ? 'Salvo…' : 'Salva'}
          </button>
        </div>
      </div>

      <div className="flex gap-3 items-start flex-col sm:flex-row">
        {/* Fogli (dove c'era la palette) */}
        <aside className="w-full sm:w-56 shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold" style={{ color: '#2b3c24' }}>Fogli</h3>
            <button onClick={aggiungiFoglio} className="btn-secondary text-xs py-1 px-2"><Plus size={13} /> Aggiungi</button>
          </div>
          {draftFogli.length === 0 && <p className="text-xs text-stone-400">Nessun foglio. Aggiungine uno e poi assegna i turni.</p>}
          {draftFogli.map((f, i) => {
            const col = coloreFoglio(i)
            const act = attivo === f.id
            return (
              <div key={f.id} onClick={() => setAttivo(f.id)} className="card p-2 cursor-pointer transition-all" style={{ border: act ? `2px solid ${col.fg}` : '1px solid #e5e7eb', background: act ? col.bg : '#fff' }}>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: col.fg }} />
                  <input value={f.nome} onChange={e => rinomina(f.id, e.target.value)} onClick={e => e.stopPropagation()}
                    placeholder="Nome foglio" className="flex-1 min-w-0 bg-transparent text-sm font-semibold outline-none" style={{ color: '#2b3c24' }} />
                  <button onClick={e => { e.stopPropagation(); elimina(f.id) }} title="Elimina foglio" className="text-stone-400 hover:text-red-600 shrink-0"><Trash2 size={13} /></button>
                </div>
                <p className="text-[11px] text-stone-500 mt-0.5" style={{ marginLeft: 18 }}>{meseLabel(meseKey)} · {contaTurni.get(f.id) ?? 0} turni</p>
              </div>
            )
          })}
        </aside>

        {/* Turni del mese: clic per assegnarli al foglio attivo */}
        <div className="flex-1 min-w-0 card p-3">
          <p className="text-sm font-semibold mb-2" style={{ color: '#2b3c24' }}>Turni configurati di {MESI[mese - 1]} {anno}
            {foglioAttivo ? <span className="text-xs font-normal text-stone-500"> — clicca per metterli/toglierli da «{foglioAttivo.nome || 'foglio'}»</span> : <span className="text-xs font-normal text-amber-700"> — seleziona prima un foglio</span>}</p>
          <div className="flex flex-wrap gap-2">
            {schema.map(s => {
              const fid = draftAssegn.get(s.id)
              const idx = fid != null ? (indiceFoglio.get(fid) ?? 0) : -1
              const col = idx >= 0 ? coloreFoglio(idx) : null
              const overnight = s.ora_fine <= s.ora_inizio
              const inAttivo = !!attivo && fid === attivo
              const nomeFoglio = fid ? draftFogli.find(f => f.id === fid)?.nome : null
              return (
                <button key={s.id} onClick={() => assegna(s.id)} title={nomeFoglio ? `In «${nomeFoglio}» — clicca per spostarlo/toglierlo` : 'Non assegnato — clicca per assegnarlo al foglio attivo'}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-all hover:brightness-95 text-left"
                  style={col ? { background: col.bg, color: col.fg, borderColor: inAttivo ? col.fg : col.br, boxShadow: inAttivo ? `inset 0 0 0 1.5px ${col.fg}` : undefined } : { background: '#f3f4f6', color: '#6b7280', borderColor: '#e5e7eb' }}>
                  <span className="inline-flex items-center gap-1">{overnight ? <Moon size={12} /> : <Sun size={12} />}{s.nome || 'Turno'}</span>
                  <span className="block text-[10px] opacity-80">{s.ora_inizio}–{s.ora_fine}{nomeFoglio ? ` · ${nomeFoglio}` : ''}</span>
                </button>
              )
            })}
          </div>
          {nonAssegnati.length > 0 && <p className="text-[11px] text-amber-700 mt-3 flex items-center gap-1"><AlertTriangle size={12} /> {nonAssegnati.length} turn{nonAssegnati.length === 1 ? 'o' : 'i'} non ancora assegnat{nonAssegnati.length === 1 ? 'o' : 'i'}: non compariranno nelle griglie.</p>}
        </div>
      </div>

      {warn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-4" role="alert">
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl shadow-2xl pointer-events-auto" style={{ background: '#fef3c7', borderLeft: '5px solid #d97706', color: '#78350f', maxWidth: 460 }}>
            <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: '#b45309' }} />
            <span className="text-sm font-medium leading-snug flex-1">{warn}</span>
            <button onClick={() => setWarn(null)} className="shrink-0 hover:opacity-70" style={{ color: '#92400e' }}><X size={16} /></button>
          </div>
        </div>
      )}
    </div>
  )
}
