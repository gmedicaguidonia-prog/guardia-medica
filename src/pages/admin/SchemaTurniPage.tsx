import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Clock, Moon, Sun, Users as UsersIcon, CalendarClock, Save, AlertTriangle, ChevronLeft, ChevronRight, Copy, Info } from 'lucide-react'
import { store } from '../../lib/store'
import { RICORRENZE } from '../../types'
import { GIORNI_SETTIMANA, ATTIVAZIONE_DA } from '../../lib/constants'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmModal } from '../../components/ConfirmModal'
import { useUnsaved } from '../../contexts/UnsavedContext'
import { usePostazione } from '../../contexts/PostazioneContext'
import { useMeseSelezionato } from '../../hooks/useMeseSelezionato'
import { useValiditaStaged } from '../../hooks/useValiditaStaged'
import { ValiditaRiquadro } from '../../components/ValiditaRiquadro'
import { prossimoInizio, fineEffettiva } from '../../lib/turniLogic'
import type { TurnoSchema, Ricorrenza, ConfigVersione } from '../../types'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const meseLabel = (key: string) => { const [a, m] = key.split('-').map(Number); return `${MESI[m - 1]} ${a}` }
const mesePrec = (k: string) => { let [a, m] = k.split('-').map(Number); m--; if (m < 1) { m = 12; a-- } return `${a}-${String(m).padStart(2, '0')}` }
const meseSucc = (k: string) => { let [a, m] = k.split('-').map(Number); m++; if (m > 12) { m = 1; a++ } return `${a}-${String(m).padStart(2, '0')}` }
const meseSorgente = (sorgenteValidoDa: string, tutteValidoDa: string[], meseKey: string): string => {
  const succ = tutteValidoDa.filter(d => d > sorgenteValidoDa && d < meseKey).sort()
  const cap = succ.length ? mesePrec(succ[0]) : mesePrec(meseKey)
  return cap < sorgenteValidoDa ? sorgenteValidoDa : cap
}

function eqDays(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort((x, y) => x - y), sb = [...b].sort((x, y) => x - y)
  return sa.every((v, i) => v === sb[i])
}
function sameTurno(a: TurnoSchema, b: TurnoSchema): boolean {
  return a.nome === b.nome && a.ora_inizio === b.ora_inizio && a.ora_fine === b.ora_fine &&
    a.n_turnisti === b.n_turnisti && a.ricorrenza === b.ricorrenza && eqDays(a.giorni_custom, b.giorni_custom)
}

// ── Card turno con salvataggio esplicito (floppy bianco/nero → verde) ──
function TurnoCard({ turno, onDelete, onDirty, prima }: {
  turno: TurnoSchema; onDelete: () => void; onDirty: (id: string, dirty: boolean) => void
  // isola il mese (copy-on-write) PRIMA di scrivere, così la modifica non tocca gli altri mesi
  prima: () => Promise<unknown>
}) {
  const qc = useQueryClient()
  const [form, setForm]     = useState<TurnoSchema>(turno)
  const [saving, setSaving] = useState(false)
  const [errore, setErrore] = useState('')
  const dirty = useMemo(() => !sameTurno(form, turno), [form, turno])

  useEffect(() => { onDirty(turno.id, dirty) }, [dirty, turno.id, onDirty])
  useEffect(() => () => onDirty(turno.id, false), [turno.id, onDirty])

  function patch(p: Partial<TurnoSchema>) { setForm(f => ({ ...f, ...p })) }
  function toggleGiorno(num: number) {
    const set = new Set(form.giorni_custom)
    set.has(num) ? set.delete(num) : set.add(num)
    patch({ giorni_custom: [...set].sort((a, b) => a - b) })
  }
  async function salva() {
    setSaving(true); setErrore('')
    try {
      await prima()   // scorpora il mese se la versione è condivisa (id del turno preservato)
      await store.updateTurnoSchema(turno.id, {
        nome: form.nome, ora_inizio: form.ora_inizio, ora_fine: form.ora_fine,
        n_turnisti: form.n_turnisti, ricorrenza: form.ricorrenza, giorni_custom: form.giorni_custom,
      })
      await qc.invalidateQueries({ queryKey: ['schema', turno.versione_id] })
      await qc.invalidateQueries({ queryKey: ['versione'] })
      await qc.invalidateQueries({ queryKey: ['versioni-all'] })
    } catch (e) { setErrore((e as Error).message) }
    finally { setSaving(false) }
  }
  const overnight = form.ora_fine <= form.ora_inizio

  return (
    <div className="card p-4" style={dirty ? { boxShadow: 'inset 0 0 0 2px #f59e0b' } : undefined}>
      <div className="flex items-center gap-2 mb-3">
        {overnight ? <Moon size={18} style={{ color: '#476540' }} /> : <Sun size={18} style={{ color: '#476540' }} />}
        <input value={form.nome} onChange={e => patch({ nome: e.target.value })}
          placeholder="Nome del turno (es. Notte)" className="input text-sm font-semibold flex-1" />
        <button onClick={salva} disabled={saving || !dirty}
          className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg border transition-colors disabled:cursor-default"
          style={dirty ? { background: '#2e7d32', color: '#fff', borderColor: '#27692b' } : { background: '#f3f4f6', color: '#9ca3af', borderColor: '#e5e7eb' }}
          title={dirty ? 'Salva le modifiche' : 'Niente da salvare'}>
          {saving ? <span className="text-[11px] font-bold">…</span> : <Save size={16} />}
        </button>
        <button onClick={onDelete} className="p-2 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0" title="Elimina turno"><Trash2 size={16} /></button>
      </div>
      {errore && <div className="mb-2 text-xs text-red-700 bg-red-50 rounded px-2 py-1">Errore: {errore}</div>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="label text-xs flex items-center gap-1"><Clock size={12} /> Inizio</label>
          <input type="time" value={form.ora_inizio} onChange={e => patch({ ora_inizio: e.target.value })} className="input text-sm" />
        </div>
        <div>
          <label className="label text-xs flex items-center gap-1"><Clock size={12} /> Fine</label>
          <input type="time" value={form.ora_fine} onChange={e => patch({ ora_fine: e.target.value })} className="input text-sm" />
          {overnight && <p className="text-[10px] text-stone-400 mt-0.5">termina il giorno dopo</p>}
        </div>
        <div>
          <label className="label text-xs flex items-center gap-1"><UsersIcon size={12} /> N° turnisti</label>
          <input type="number" min={1} value={form.n_turnisti} onChange={e => patch({ n_turnisti: Math.max(1, parseInt(e.target.value) || 1) })} className="input text-sm" />
        </div>
      </div>
      <div>
        <label className="label text-xs">Quando si applica</label>
        <select value={form.ricorrenza} onChange={e => patch({ ricorrenza: e.target.value as Ricorrenza })} className="input text-sm">
          {RICORRENZE.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        {form.ricorrenza === 'custom' && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {GIORNI_SETTIMANA.map(g => {
              const on = form.giorni_custom.includes(g.num)
              return (
                <button key={g.num} onClick={() => toggleGiorno(g.num)} className="px-2.5 py-1 rounded-md text-xs font-medium border transition-colors"
                  style={on ? { background: '#476540', color: '#fff', borderColor: '#456b3a' } : { background: '#faf8f3', color: '#5a5a4a', borderColor: '#d6cdba' }}>
                  {g.abbr}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export function SchemaTurniPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { confirm, notify, confirmState } = useConfirm()
  const { setHasUnsaved } = useUnsaved()
  const { postazioneId, postazioneAttiva } = usePostazione()

  const { anno, mese, meseKey, setMeseAnno } = useMeseSelezionato()

  const { data: versione, isLoading: loadingVer } = useQuery<ConfigVersione | null>({
    queryKey: ['versione', postazioneId, meseKey],
    queryFn: () => store.getVersioneMese(postazioneId!, meseKey),
    enabled: !!postazioneId,
  })
  const { data: schema = [], isLoading: loadingSchema } = useQuery<TurnoSchema[]>({
    queryKey: ['schema', versione?.id],
    queryFn: () => store.getSchemaVersione(versione!.id),
    enabled: !!versione,
  })
  const { data: tutteVer = [] } = useQuery<ConfigVersione[]>({ queryKey: ['versioni-all', postazioneId], queryFn: () => store.getVersioni(postazioneId!), enabled: !!postazioneId })
  // Procedura sequenziale: dal mese cutoff ogni mese va "attivato"
  const nuovaProcedura = meseKey >= ATTIVAZIONE_DA
  const { data: attivazioni = [] } = useQuery<number[]>({ queryKey: ['attivazioni', postazioneId, meseKey], queryFn: () => store.getAttivazioni(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: sorgenteCopia } = useQuery<ConfigVersione | null>({ queryKey: ['ultima-config-con-turni', postazioneId, meseKey], queryFn: () => store.ultimaConfigConTurni(postazioneId!, meseKey), enabled: !!postazioneId && nuovaProcedura })
  const attivo1 = attivazioni.includes(1)
  const mostraGate = nuovaProcedura && !attivo1
  // passo ① Personale: prerequisito obbligatorio (numero interno 0) dalla nuova procedura
  const personaleOk = !nuovaProcedura || attivazioni.includes(0)

  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())
  const handleDirty = useCallback((id: string, dirty: boolean) => {
    setDirtyIds(prev => {
      const has = prev.has(id)
      if (dirty && !has) { const n = new Set(prev); n.add(id); return n }
      if (!dirty && has) { const n = new Set(prev); n.delete(id); return n }
      return prev
    })
  }, [])
  const hasUnsaved = dirtyIds.size > 0
  // Validità configurazione — staged, niente auto-save (hook condiviso)
  const valid = useValiditaStaged(versione, meseKey)
  const [salvandoVal, setSalvandoVal] = useState(false)
  const anyDirty = hasUnsaved || valid.dirty
  useEffect(() => { setHasUnsaved(anyDirty); return () => setHasUnsaved(false) }, [anyDirty, setHasUnsaved])
  useEffect(() => {
    if (!anyDirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [anyDirty])

  async function cambiaMese(delta: number) {
    if (anyDirty && !(await confirm({ title: 'Modifiche non salvate', message: 'Hai modifiche non salvate. Cambiare mese senza salvarle?', confirmLabel: 'Sì, cambia', danger: true }))) return
    if (valid.dirty) valid.reset()
    let m = mese + delta, a = anno
    if (m < 1) { m = 12; a-- } else if (m > 12) { m = 1; a++ }
    setMeseAnno(a, m)
  }

  async function configuraMese() {
    await store.creaVersione(postazioneId!, meseKey)
    await qc.invalidateQueries({ queryKey: ['versione'] })
  }

  // ── Isolamento per mese (copy-on-write a "scorporo") ──
  // Se la configurazione che governa il mese è condivisa (ereditata da un periodo
  // precedente e/o estesa oltre questo mese), la SCORPORA così la modifica tocca
  // SOLO questo mese. Mantiene la versione corrente (e gli id dei suoi turni) come
  // versione di QUESTO mese e crea copie del contenuto originale per «prima»/«dopo».
  async function assicuraConfigDelMese(): Promise<string> {
    // Rileggo lo stato FRESCO dal DB: rende lo scorporo idempotente anche con più
    // salvataggi ravvicinati (se è già stato isolato, esce subito senza duplicare).
    const V = await store.getVersioneMese(postazioneId!, meseKey)
    if (!V) return versione!.id
    if (V.valido_da === meseKey && V.valido_fino === meseKey) return V.id   // già isolata
    const turni = await store.getSchemaVersione(V.id)
    const finoOrig = V.valido_fino
    const creaCopia = async (da: string, a: string | null) => {
      const W = await store.creaVersione(postazioneId!, da)
      if (a != null) await store.setValiditaVersione(W.id, a)
      for (const t of turni) await store.addTurnoSchema(W.id, { nome: t.nome, ora_inizio: t.ora_inizio, ora_fine: t.ora_fine, n_turnisti: t.n_turnisti, ricorrenza: t.ricorrenza, giorni_custom: t.giorni_custom })
    }
    if (finoOrig == null || finoOrig > meseKey) await creaCopia(meseSucc(meseKey), finoOrig)   // «dopo»
    if (V.valido_da < meseKey) { await creaCopia(V.valido_da, mesePrec(meseKey)); await store.setValidoDaVersione(V.id, meseKey) }   // «prima»
    await store.setValiditaVersione(V.id, meseKey)   // V = solo questo mese
    return V.id
  }
  async function dopoScorporo() {
    await qc.invalidateQueries({ queryKey: ['versione'] })
    await qc.invalidateQueries({ queryKey: ['versioni-all'] })
    await qc.invalidateQueries({ queryKey: ['attivazioni'] })
    await qc.invalidateQueries({ queryKey: ['ultima-config-con-turni'] })
  }

  // ── Attivazione del mese (passo 1) ──
  async function ricaricaAttivazione() {
    await qc.invalidateQueries({ queryKey: ['versione'] })
    await qc.invalidateQueries({ queryKey: ['versioni-all'] })
    await qc.invalidateQueries({ queryKey: ['attivazioni'] })
    await qc.invalidateQueries({ queryKey: ['ultima-config-con-turni'] })
  }
  // Tappa in bianco i mesi non configurati tra il cutoff e questo mese (continuità),
  // PRIMA di un'eventuale copia. Ritorna false se l'utente annulla.
  async function assicuraContinuita(): Promise<boolean> {
    const attivati = new Set(await store.getMesiAttivati(postazioneId!, 1))
    const buchi: string[] = []
    for (let m = ATTIVAZIONE_DA; m < meseKey; m = meseSucc(m)) if (!attivati.has(m)) buchi.push(m)
    if (!buchi.length) return true
    const ok = await confirm({
      title: 'Mesi non configurati',
      message: `${buchi.map(meseLabel).join(', ')} non ${buchi.length === 1 ? 'è stato configurato' : 'sono stati configurati'}: ${buchi.length === 1 ? 'verrà attivato in bianco' : 'verranno attivati in bianco'} per dare continuità, poi si procede con questo mese. Procedere?`,
      confirmLabel: 'Sì, procedi',
    })
    if (!ok) return false
    for (const b of buchi) { await store.creaVersione(postazioneId!, b); await store.attivaPasso(postazioneId!, b, 1) }
    return true
  }
  function logAttiva(testo: string) {
    store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'config_turni', messaggio: `Configurazione di ${meseLabel(meseKey)} ${testo}.`, target: '/admin/schema', perAdmin: true }).catch(() => {})
  }
  async function copiaPrecedente() {
    if (!(await assicuraContinuita())) return
    const sorgente = await store.ultimaConfigConTurni(postazioneId!, meseKey)
    const nuova = await store.creaVersione(postazioneId!, meseKey)
    if (sorgente) {
      const turni = await store.getSchemaVersione(sorgente.id)
      for (const t of turni) await store.addTurnoSchema(nuova.id, { nome: t.nome, ora_inizio: t.ora_inizio, ora_fine: t.ora_fine, n_turnisti: t.n_turnisti, ricorrenza: t.ricorrenza, giorni_custom: t.giorni_custom })
    }
    await store.attivaPasso(postazioneId!, meseKey, 1)
    logAttiva(`attivata (copiata da ${sorgente ? meseLabel(sorgente.valido_da) : 'configurazione precedente'})`)
    await ricaricaAttivazione()
  }
  async function attivaNuovaVuota() {
    if (!(await assicuraContinuita())) return
    await store.creaVersione(postazioneId!, meseKey)
    await store.attivaPasso(postazioneId!, meseKey, 1)
    logAttiva('attivata (nuova configurazione vuota)')
    await ricaricaAttivazione()
  }
  async function salvaValidita() {
    if (!versione) return
    const fino = valid.draft
    if (fino != null && fino < versione.valido_da) { await notify({ title: 'Scadenza non valida', message: `La scadenza non può precedere l'inizio del periodo (${meseLabel(versione.valido_da)}).` }); return }
    if (fino === (versione.valido_fino ?? null)) return
    setSalvandoVal(true)
    try {
      await store.setValiditaVersione(versione.id, fino)
      store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'config_turni', messaggio: `Validità della configurazione turni ${fino ? `impostata fino a ${meseLabel(fino)} compreso` : 'impostata su «per sempre»'}.`, target: '/admin/schema', perAdmin: true }).catch(() => {})
      await qc.invalidateQueries({ queryKey: ['versione'] })
      await qc.invalidateQueries({ queryKey: ['versioni-all'] })
    } catch (e) { console.error('[Config] salvataggio validità fallito:', e); void notify({ title: 'Errore', message: 'Errore nel salvataggio della validità.' }) }
    finally { setSalvandoVal(false) }
  }
  async function cancellaConfig() {
    if (!versione) return
    const ok = await confirm({ title: 'Cancella configurazione', message: `Cancellare la configurazione valida da ${meseLabel(versione.valido_da)} e i suoi turni? Non è reversibile.`, confirmLabel: 'Cancella', danger: true })
    if (!ok) return
    await store.deleteVersione(versione.id)
    await qc.invalidateQueries({ queryKey: ['versione'] })
    await qc.invalidateQueries({ queryKey: ['versioni-all'] })
  }
  async function aggiungiTurno() {
    if (!versione) return
    await assicuraConfigDelMese()   // isola il mese prima di aggiungere
    await store.addTurnoSchema(versione.id, { nome: '', ora_inizio: '08:00', ora_fine: '20:00', n_turnisti: 1, ricorrenza: 'tutti', giorni_custom: [] })
    await qc.invalidateQueries({ queryKey: ['schema', versione.id] })
    await dopoScorporo()
  }
  async function eliminaTurno(t: TurnoSchema) {
    const ok = await confirm({ title: 'Elimina turno', message: `Vuoi eliminare il turno "${t.nome || 'senza nome'}"?`, confirmLabel: 'Elimina', danger: true })
    if (!ok) return
    handleDirty(t.id, false)
    await assicuraConfigDelMese()   // isola il mese prima di eliminare
    await store.deleteTurnoSchema(t.id)
    await qc.invalidateQueries({ queryKey: ['schema', t.versione_id] })
    await dopoScorporo()
  }

  if (!postazioneId) return <div className="max-w-4xl mx-auto p-6 text-sm text-stone-500">Caricamento postazione…</div>

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />

      {/* Header + navigatore mese/anno */}
      <div className="flex items-start gap-3">
        <CalendarClock size={22} style={{ color: '#476540' }} className="mt-1" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold" style={{ color: '#2b3c24' }}>Configurazione Turni{postazioneAttiva ? ` - ${postazioneAttiva.nome}` : ''}</h1>
          <p className="text-sm text-stone-600">Definisci i turni validi per un periodo. Dopo ogni modifica premi <strong>Salva</strong>.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <button onClick={() => cambiaMese(-1)} className="btn-secondary px-2 py-1" title="Mese precedente"><ChevronLeft size={16} /></button>
          <span className="font-bold text-lg text-center" style={{ color: '#3a3d30', minWidth: 130 }}>{MESI[mese - 1]} {anno}</span>
          <button onClick={() => cambiaMese(1)} className="btn-secondary px-2 py-1" title="Mese successivo"><ChevronRight size={16} /></button>        </div>
      </div>

      {hasUnsaved && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24' }}>
          <AlertTriangle size={16} className="shrink-0" /> Hai modifiche non salvate in {dirtyIds.size} turno{dirtyIds.size === 1 ? '' : 'i'}: premi <strong>Salva</strong> (bordo arancione).
        </div>
      )}

      {loadingVer ? (
        <p className="text-sm text-stone-500">Caricamento…</p>
      ) : !personaleOk ? (
        /* ── Gate passo ① Personale: prima di tutto va confermato il personale del mese ── */
        <div className="card p-8 text-center space-y-3">
          <UsersIcon size={32} className="mx-auto" style={{ color: '#9ab488' }} />
          <h3 className="text-base font-bold" style={{ color: '#2b3c24' }}>Completa prima il Personale (passo ①)</h3>
          <p className="text-sm text-stone-600">Per <strong>{MESI[mese - 1]} {anno}</strong> conferma prima chi è in servizio nel mese e con quale ruolo, poi potrai configurare i turni.</p>
          <button onClick={() => navigate('/admin/turnisti')} className="btn-primary text-sm mx-auto"><UsersIcon size={15} /> Vai al Personale</button>
        </div>
      ) : mostraGate ? (
        /* ── Gate di attivazione del mese (nuova procedura sequenziale) ── */
        <div className="card p-8 text-center space-y-4">
          <CalendarClock size={32} className="mx-auto" style={{ color: '#9ab488' }} />
          <div>
            <h3 className="text-base font-bold" style={{ color: '#2b3c24' }}>Attiva la configurazione di {MESI[mese - 1]} {anno}</h3>
            {sorgenteCopia ? (
              <p className="text-sm text-stone-600 mt-1">Puoi copiarla dall'ultimo mese configurato (<strong>{meseLabel(meseSorgente(sorgenteCopia.valido_da, tutteVer.map(v => v.valido_da), meseKey))}</strong>), oppure partire da una nuova.</p>
            ) : (
              <p className="text-sm text-stone-600 mt-1">Non c'è ancora un mese configurato da cui copiare. Crea una nuova configurazione.</p>
            )}
          </div>
          <div className="flex gap-2 justify-center flex-wrap">
            {sorgenteCopia && <button onClick={copiaPrecedente} className="btn-primary text-sm"><Copy size={16} /> Copia da {meseLabel(meseSorgente(sorgenteCopia.valido_da, tutteVer.map(v => v.valido_da), meseKey))}</button>}
            <button onClick={attivaNuovaVuota} className={`${sorgenteCopia ? 'btn-secondary' : 'btn-primary'} text-sm`}><Plus size={16} /> Attiva una nuova (vuota)</button>
          </div>
        </div>
      ) : !versione ? (
        /* ── Nessuna configurazione per il mese (mesi pre-attivazione) ── */
        <div className="card p-8 text-center">
          <CalendarClock size={32} className="mx-auto mb-2" style={{ color: '#9ab488' }} />
          <p className="text-sm text-stone-600 mb-1">Nessuna configurazione turni per <strong>{MESI[mese - 1]} {anno}</strong>.</p>
          <p className="text-xs text-stone-400 mb-4">Crea una configurazione valida da questo mese.</p>
          <button onClick={configuraMese} className="btn-primary text-sm mx-auto"><Plus size={16} /> Configura i turni per questo mese</button>
        </div>
      ) : (
        <>
          {nuovaProcedura && versione.valido_da < meseKey && (
            <div className="card p-3 flex items-start gap-2" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
              <Info size={16} className="shrink-0 mt-0.5" style={{ color: '#1d4ed8' }} />
              <p className="text-xs" style={{ color: '#1e3a5f' }}>Questa configurazione proviene da un periodo precedente (da {meseLabel(versione.valido_da)}) ed è condivisa con altri mesi. <strong>Appena la modifichi qui</strong> (turni, validità) viene resa automaticamente <strong>indipendente per {MESI[mese - 1]} {anno}</strong>, senza toccare gli altri mesi.</p>
            </div>
          )}
          <ValiditaRiquadro etichetta="Validità configurazione:" val={valid} salvando={salvandoVal} onSalva={salvaValidita} />
          {(() => {
            const eff = fineEffettiva(versione, tutteVer)
            const nxt = prossimoInizio(versione, tutteVer)
            return (
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-stone-500 flex-1">
                  Valida da <strong>{meseLabel(versione.valido_da)}</strong>
                  {eff ? <> a <strong>{meseLabel(eff)}</strong></> : <> in poi (per sempre)</>}
                  {nxt && <span className="text-amber-700"> · dal {meseLabel(nxt)} subentra un periodo più recente</span>}.
                </p>
                {!nuovaProcedura && <button onClick={cancellaConfig} className="btn-danger text-xs py-1 px-2 shrink-0"><Trash2 size={13} /> Cancella configurazione</button>}
              </div>
            )
          })()}

          <div className="flex justify-end">
            <button onClick={aggiungiTurno} className="btn-primary text-sm"><Plus size={16} /> Aggiungi turno</button>
          </div>

          {loadingSchema ? (
            <p className="text-sm text-stone-500">Caricamento turni…</p>
          ) : schema.length === 0 ? (
            <div className="card p-6 text-center text-sm text-stone-500">Nessun turno in questa configurazione. Premi “Aggiungi turno”.</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {schema.map(t => <TurnoCard key={t.id} turno={t} onDelete={() => eliminaTurno(t)} onDirty={handleDirty} prima={assicuraConfigDelMese} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
