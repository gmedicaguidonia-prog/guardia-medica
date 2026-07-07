import { useState, useMemo, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, LayoutGrid, AlertCircle, AlertTriangle, Plus, X, Trash2, Moon, Sun, Save, RotateCcw, Copy, Info, Check } from 'lucide-react'
import { store } from '../../lib/store'
import { ATTIVAZIONE_DA } from '../../lib/constants'
import { fineEffettiva, prossimoInizio, casoAttivazione } from '../../lib/turniLogic'
import { usePostazione } from '../../contexts/PostazioneContext'
import { useMeseSelezionato } from '../../hooks/useMeseSelezionato'
import { useValiditaStaged } from '../../hooks/useValiditaStaged'
import { ValiditaRiquadro } from '../../components/ValiditaRiquadro'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmModal } from '../../components/ConfirmModal'
import { useUnsaved } from '../../contexts/UnsavedContext'
import type { TurnoSchema, ConfigVersione, ImpaginazioneVersione, Foglio, FoglioTurno } from '../../types'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const meseLabel = (key: string) => { const [a, m] = key.split('-').map(Number); return `${MESI[m - 1]} ${a}` }
const mesePrec = (k: string) => { let [a, m] = k.split('-').map(Number); m--; if (m < 1) { m = 12; a-- } return `${a}-${String(m).padStart(2, '0')}` }
const meseSucc = (k: string) => { let [a, m] = k.split('-').map(Number); m++; if (m > 12) { m = 1; a++ } return `${a}-${String(m).padStart(2, '0')}` }
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

export function ImpaginazionePage() {
  const qc = useQueryClient()
  const { setHasUnsaved } = useUnsaved()
  const { confirm, notify, confirmState } = useConfirm()
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
  // Procedura sequenziale: passo 3 (impaginazione). Richiede passi 1 e 2 attivati.
  const nuovaProcedura = meseKey >= ATTIVAZIONE_DA
  const { data: attivazioni = [] } = useQuery<number[]>({ queryKey: ['attivazioni', postazioneId, meseKey], queryFn: () => store.getAttivazioni(postazioneId!, meseKey), enabled: !!postazioneId })
  const mesePrecKey = mesePrec(meseKey)
  const { data: versionePrec } = useQuery<ImpaginazioneVersione | null>({ queryKey: ['impag-versione', postazioneId, mesePrecKey], queryFn: () => store.getImpaginazioneVersioneMese(postazioneId!, mesePrecKey), enabled: !!postazioneId && nuovaProcedura })
  const caso = casoAttivazione(versionePrec, meseKey)
  const config1Attivo = attivazioni.includes(1)
  const regole2Attivo = attivazioni.includes(2)
  const impag3Attivo = attivazioni.includes(3)

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
  // cambio mese (anche dalla sidebar): scarta la bozza in sospeso
  useEffect(() => { editing.current = false; setAttivo(null) }, [meseKey])

  const serverNome = useMemo(() => new Map(fogli.map(f => [f.id, f.nome])), [fogli])
  const serverAssegn = useMemo(() => new Map(foglioTurni.map(ft => [ft.turno_schema_id, ft.foglio_id])), [foglioTurni])
  const dirty = useMemo(() => {
    if (draftFogli.length !== fogli.length) return true
    for (const f of draftFogli) { if (f.id.startsWith('tmp-')) return true; if (serverNome.get(f.id) !== f.nome) return true }
    if (draftAssegn.size !== serverAssegn.size) return true
    for (const [k, v] of draftAssegn) { if (serverAssegn.get(k) !== v) return true }
    return false
  }, [draftFogli, draftAssegn, fogli.length, serverNome, serverAssegn])

  // Validità impaginazione — staged, niente auto-save (hook condiviso)
  const valid = useValiditaStaged(impagVer, meseKey)
  const [salvandoVal, setSalvandoVal] = useState(false)
  const anyDirty = dirty || valid.dirty

  useEffect(() => { if (!dirty) editing.current = false }, [dirty])
  useEffect(() => { setHasUnsaved(anyDirty); return () => setHasUnsaved(false) }, [anyDirty, setHasUnsaved])
  useEffect(() => {
    if (!anyDirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h)
  }, [anyDirty])

  const indiceFoglio = useMemo(() => { const m = new Map<string, number>(); draftFogli.forEach((f, i) => m.set(f.id, i)); return m }, [draftFogli])
  const contaTurni = useMemo(() => { const m = new Map<string, number>(); draftAssegn.forEach(fid => m.set(fid, (m.get(fid) ?? 0) + 1)); return m }, [draftAssegn])

  const [warn, setWarn] = useState<string | null>(null)
  function showWarn(msg: string) { setWarn(msg); window.setTimeout(() => setWarn(null), 3000) }

  async function cambiaMese(delta: number) {
    if (anyDirty && !(await confirm({ title: 'Modifiche non salvate', message: 'Hai modifiche non salvate. Cambiare mese senza salvarle?', confirmLabel: 'Sì, cambia', danger: true }))) return
    editing.current = false
    if (valid.dirty) valid.reset()
    let m = mese + delta, a = anno; if (m < 1) { m = 12; a-- } else if (m > 12) { m = 1; a++ }
    setMeseAnno(a, m); setAttivo(null)
  }
  // operazioni sulla VERSIONE (immediate: creare/cancellare la versione)
  async function configura() { const tutteVimpag = await store.getImpaginazioneVersioni(postazioneId!); if (!tutteVimpag.some(v => v.valido_da === meseKey)) await store.creaImpaginazioneVersione(postazioneId!, meseKey); await qc.invalidateQueries({ queryKey: ['impag-versione'] }); await qc.invalidateQueries({ queryKey: ['impag-versioni-all'] }) }

  // ── Isolamento per mese (copy-on-write a "scorporo") ──
  // Se l'impaginazione che governa il mese è condivisa (ereditata da un periodo
  // precedente e/o estesa oltre questo mese), la SCORPORA così la modifica tocca
  // SOLO questo mese. Mantiene la versione corrente (e gli id dei suoi fogli) come
  // versione di QUESTO mese e crea copie del contenuto originale per «prima»/«dopo».
  async function assicuraImpagDelMese(): Promise<string> {
    // Rileggo lo stato FRESCO dal DB: rende lo scorporo idempotente anche con più
    // salvataggi ravvicinati (se è già stato isolato, esce subito senza duplicare).
    const V = await store.getImpaginazioneVersioneMese(postazioneId!, meseKey)
    if (!V) return impagVer!.id
    if (V.valido_da === meseKey && V.valido_fino === meseKey) return V.id   // già isolata
    const fogliSrc = await store.getFogli(V.id)
    const turniSrc = await store.getFoglioTurni(V.id)
    const finoOrig = V.valido_fino
    const creaCopia = async (da: string, a: string | null) => {
      const W = await store.creaImpaginazioneVersione(postazioneId!, da)
      if (a != null) await store.setValiditaImpaginazioneVersione(W.id, a)
      const mapF = new Map<string, string>()
      for (const f of fogliSrc) { const nf = await store.addFoglio(W.id, f.nome); mapF.set(f.id, nf.id) }
      for (const ft of turniSrc) { const nf = mapF.get(ft.foglio_id); if (nf) await store.setFoglioTurno(W.id, ft.turno_schema_id, nf) }
    }
    if (finoOrig == null || finoOrig > meseKey) await creaCopia(meseSucc(meseKey), finoOrig)   // «dopo»
    if (V.valido_da < meseKey) { await creaCopia(V.valido_da, mesePrec(meseKey)); await store.setValidoDaImpaginazioneVersione(V.id, meseKey) }   // «prima»
    await store.setValiditaImpaginazioneVersione(V.id, meseKey)   // V = solo questo mese
    return V.id
  }

  // ── Attivazione del mese — passo 3 (impaginazione) ──
  async function ricaricaAttImpag() {
    await qc.invalidateQueries({ queryKey: ['impag-versione'] })
    await qc.invalidateQueries({ queryKey: ['impag-versioni-all'] })
    await qc.invalidateQueries({ queryKey: ['attivazioni'] })
    await qc.invalidateQueries({ queryKey: ['ultima-impaginazione-con-contenuto'] })
  }
  async function assicuraContinuitaImpag(): Promise<boolean> {
    const attivati = new Set(await store.getMesiAttivati(postazioneId!, 3))
    const buchi: string[] = []
    for (let m = ATTIVAZIONE_DA; m < meseKey; m = meseSucc(m)) if (!attivati.has(m)) buchi.push(m)
    if (!buchi.length) return true
    if (!(await confirm({ title: 'Mesi non attivati', message: `${buchi.map(meseLabel).join(', ')}: impaginazione non attivata. ${buchi.length === 1 ? 'Verrà attivata in bianco' : 'Verranno attivate in bianco'} per continuità, poi si procede. Procedere?`, confirmLabel: 'Sì, procedi' }))) return false
    for (const b of buchi) {
      const cop = await store.getImpaginazioneVersioneMese(postazioneId!, b)   // già coperto da un'impaginazione ereditata?
      if (!cop) await store.creaImpaginazioneVersione(postazioneId!, b)
      await store.attivaPasso(postazioneId!, b, 3)
    }
    return true
  }
  function logImpagAtt(testo: string) {
    store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'impaginazione', messaggio: `Impaginazione di ${meseLabel(meseKey)} ${testo}.`, target: '/admin/impaginazione', perAdmin: true }).catch(() => {})
  }
  // copia fogli + assegnazioni turno→foglio da una versione sorgente (solo turni esistenti nel mese)
  async function copiaContenutoImpag(sorgente: ImpaginazioneVersione, destId: string) {
    const fogliSrc = await store.getFogli(sorgente.id)
    const assegnSrc = await store.getFoglioTurni(sorgente.id)
    // mappa i turni della sorgente → turni di QUESTO mese per NOME (gli id cambiano se la config è stata ricreata)
    const srcConfig = await store.getVersioneMese(postazioneId!, sorgente.valido_da)
    const srcTurni = srcConfig ? await store.getSchemaVersione(srcConfig.id) : []
    const norm = (n: string | null) => (n || '').trim().toLowerCase()
    const srcNome = new Map(srcTurni.map(t => [t.id, norm(t.nome)]))
    const curPerNome = new Map(schema.map(t => [norm(t.nome), t.id]))
    const curIds = new Set(schema.map(s => s.id))
    const mapFoglio = new Map<string, string>()
    for (const f of fogliSrc) { const nf = await store.addFoglio(destId, f.nome); mapFoglio.set(f.id, nf.id) }
    for (const a of assegnSrc) {
      const nf = mapFoglio.get(a.foglio_id)
      const nome = srcNome.get(a.turno_schema_id)
      let curTurnoId = nome ? curPerNome.get(nome) : undefined
      if (!curTurnoId && curIds.has(a.turno_schema_id)) curTurnoId = a.turno_schema_id
      if (nf && curTurnoId) await store.setFoglioTurno(destId, curTurnoId, nf)
    }
  }
  async function copiaImpagPrecedente() {
    if (!(await assicuraContinuitaImpag())) return
    // Caso 2: crea una versione propria del mese (riusa se già esiste → no duplicati) e copia i fogli dal mese prima.
    const tutteVimpag = await store.getImpaginazioneVersioni(postazioneId!)
    const nuova = tutteVimpag.find(v => v.valido_da === meseKey) ?? await store.creaImpaginazioneVersione(postazioneId!, meseKey)
    const fogliGia = await store.getFogli(nuova.id)
    if (versionePrec && fogliGia.length === 0) await copiaContenutoImpag(versionePrec, nuova.id)   // idempotente
    await store.attivaPasso(postazioneId!, meseKey, 3)
    logImpagAtt(`attivata (copiata da ${versionePrec ? meseLabel(versionePrec.valido_da) : 'periodo precedente'})`)
    await ricaricaAttImpag()
  }
  async function confermaImpagPrecedente() {
    if (!(await assicuraContinuitaImpag())) return
    // Caso 3: l'impaginazione del mese prima vale «per sempre» e copre già questo mese → solo attiva.
    await store.attivaPasso(postazioneId!, meseKey, 3)
    logImpagAtt(`confermata (continua da ${versionePrec ? meseLabel(versionePrec.valido_da) : 'mese precedente'})`)
    await ricaricaAttImpag()
  }
  async function attivaImpagVuota() {
    if (!(await assicuraContinuitaImpag())) return
    const tutteVimpag = await store.getImpaginazioneVersioni(postazioneId!)
    if (!tutteVimpag.some(v => v.valido_da === meseKey)) await store.creaImpaginazioneVersione(postazioneId!, meseKey)
    await store.attivaPasso(postazioneId!, meseKey, 3)
    logImpagAtt('attivata (nuova, vuota)')
    await ricaricaAttImpag()
  }
  // Validità impaginazione — salvataggio ESPLICITO (niente più auto-save)
  async function salvaValidita() {
    if (!impagVer) return
    const fino = valid.draft
    if (fino != null && fino < impagVer.valido_da) { showWarn(`La scadenza non può precedere l'inizio del periodo (${meseLabel(impagVer.valido_da)}).`); return }
    if (fino === (impagVer.valido_fino ?? null)) return
    setSalvandoVal(true)
    try {
      await store.setValiditaImpaginazioneVersione(impagVer.id, fino)
      store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'impaginazione', messaggio: `Validità dell'impaginazione ${fino ? `impostata fino a ${meseLabel(fino)} compreso` : 'impostata su «per sempre»'}.`, target: '/admin/impaginazione', perAdmin: true }).catch(() => {})
      await qc.invalidateQueries({ queryKey: ['impag-versione'] })
      await qc.invalidateQueries({ queryKey: ['impag-versioni-all'] })
    } catch (e) { console.error('[Impaginazione] salvataggio validità fallito:', e); showWarn('Errore nel salvataggio della validità.') }
    finally { setSalvandoVal(false) }
  }
  async function cancella() {
    if (!impagVer) return
    if (!(await confirm({ title: 'Cancella impaginazione', message: `Cancellare l'impaginazione valida da ${meseLabel(impagVer.valido_da)}? Non è reversibile.`, confirmLabel: 'Cancella', danger: true }))) return
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
      await assicuraImpagDelMese()   // isola il mese se la versione è condivisa (id dei fogli preservati)
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
      await qc.invalidateQueries({ queryKey: ['impag-versione'] })
      await qc.invalidateQueries({ queryKey: ['impag-versioni-all'] })
    } catch (e) { console.error('[Impaginazione] salvataggio fallito:', e); void notify({ title: 'Errore', message: 'Errore nel salvataggio.' }) }
    finally { setSaving(false) }
  }

  const Header = (
    <div className="flex items-center gap-3 flex-wrap">
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />
      <LayoutGrid size={22} style={{ color: 'var(--t-accento)' }} />
      <h1 className="text-2xl font-bold" style={{ color: 'var(--t-titolo)' }}>Impaginazione{postazioneAttiva ? ` - ${postazioneAttiva.nome}` : ''}</h1>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <button onClick={() => cambiaMese(-1)} className="btn-secondary px-2 py-1"><ChevronLeft size={16} /></button>
        <span className="font-bold text-lg text-center" style={{ color: 'var(--t-testo)', minWidth: 130 }}>{MESI[mese - 1]} {anno}</span>
        <button onClick={() => cambiaMese(1)} className="btn-secondary px-2 py-1"><ChevronRight size={16} /></button>      </div>
    </div>
  )
  const wrap = (children: ReactNode) => <div className="p-4 sm:p-6 space-y-4">{Header}{children}</div>

  if (!postazioneId) return wrap(<p className="text-sm text-stone-500">Caricamento postazione…</p>)
  if (loadingConfig) return wrap(<p className="text-sm text-stone-500">Caricamento…</p>)
  if (!configVer || schema.length === 0) return wrap(<div className="card p-5 flex items-start gap-3"><AlertCircle className="shrink-0 mt-0.5" style={{ color: '#b45309' }} size={18} /><p className="text-sm text-stone-600">Nessun turno configurato per <strong>{MESI[mese - 1]} {anno}</strong>. Imposta prima i turni in <strong>Configurazione Turni</strong> (passo ②).</p></div>)
  if (nuovaProcedura && !config1Attivo) return wrap(<div className="card p-5 flex items-start gap-3"><AlertCircle className="shrink-0 mt-0.5" style={{ color: '#b45309' }} size={18} /><p className="text-sm text-stone-600">La <strong>Configurazione Turni</strong> di {MESI[mese - 1]} {anno} non è ancora stata <strong>attivata</strong>. Attivala prima (passo ②).</p></div>)
  if (nuovaProcedura && !regole2Attivo) return wrap(<div className="card p-5 flex items-start gap-3"><AlertCircle className="shrink-0 mt-0.5" style={{ color: '#b45309' }} size={18} /><p className="text-sm text-stone-600">Le <strong>Regole Turni</strong> di {MESI[mese - 1]} {anno} non sono ancora state <strong>attivate</strong>. Attivale prima (passo ③).</p></div>)
  if (loadingImpag) return wrap(<p className="text-sm text-stone-500">Caricamento…</p>)
  if (nuovaProcedura && !impag3Attivo) {
    /* ── Gate di attivazione dell'impaginazione (passo 3) ── */
    return wrap(
      <div className="card p-8 text-center space-y-4">
        <LayoutGrid size={32} className="mx-auto" style={{ color: 'var(--t-soft)' }} />
        <div>
          <h3 className="text-base font-bold" style={{ color: 'var(--t-titolo)' }}>Attiva l'impaginazione di {MESI[mese - 1]} {anno}</h3>
          {caso === 'vuoto' ? (
            <p className="text-sm text-stone-600 mt-1">Il mese precedente non ha un'impaginazione: creane una nuova (dividi i turni in fogli).</p>
          ) : caso === 'conferma' ? (
            <p className="text-sm text-stone-600 mt-1">L'impaginazione di <strong>{meseLabel(mesePrecKey)}</strong> vale «per sempre» e copre già questo mese: puoi <strong>confermarla</strong> e proseguire, oppure crearne una nuova.</p>
          ) : (
            <p className="text-sm text-stone-600 mt-1">Puoi <strong>copiarla da {meseLabel(mesePrecKey)}</strong> (nuova impaginazione da {MESI[mese - 1]} {anno} in poi), oppure crearne una nuova.</p>
          )}
        </div>
        <div className="flex gap-2 justify-center flex-wrap">
          {caso === 'copia' && <button onClick={copiaImpagPrecedente} className="btn-primary text-sm"><Copy size={16} /> Copia da {meseLabel(mesePrecKey)}</button>}
          {caso === 'conferma' && <button onClick={confermaImpagPrecedente} className="btn-primary text-sm"><Check size={16} /> Conferma da {meseLabel(mesePrecKey)}</button>}
          <button onClick={attivaImpagVuota} className={`${caso !== 'vuoto' ? 'btn-secondary' : 'btn-primary'} text-sm`}><Plus size={16} /> Attiva una nuova (vuota)</button>
        </div>
      </div>
    )
  }
  if (!impagVer) {
    return wrap(
      <div className="card p-8 text-center">
        <LayoutGrid size={32} className="mx-auto mb-2" style={{ color: 'var(--t-soft)' }} />
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
      {nuovaProcedura && impagVer.valido_da < meseKey && (
        <div className="card p-3 flex items-start gap-2" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
          <Info size={16} className="shrink-0 mt-0.5" style={{ color: '#1d4ed8' }} />
          <p className="text-xs" style={{ color: '#1e3a5f' }}>Questa impaginazione proviene da un periodo precedente (da {meseLabel(impagVer.valido_da)}) ed è condivisa con altri mesi. <strong>Appena salvi una modifica qui</strong> viene resa automaticamente <strong>indipendente per {MESI[mese - 1]} {anno}</strong>, senza toccare gli altri mesi.</p>
        </div>
      )}
      <ValiditaRiquadro etichetta="Validità impaginazione:" val={valid} salvando={salvandoVal} onSalva={salvaValidita} />
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs text-stone-500 flex-1">Valida da <strong>{meseLabel(impagVer.valido_da)}</strong>{eff ? <> a <strong>{meseLabel(eff)}</strong></> : <> in poi (per sempre)</>}{nxt && <span className="text-amber-700"> · dal {meseLabel(nxt)} subentra un periodo più recente</span>}.</p>
        {!nuovaProcedura && <button onClick={cancella} className="btn-danger text-xs py-1 px-2 shrink-0"><Trash2 size={13} /> Cancella impaginazione</button>}
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
            <h3 className="text-sm font-bold" style={{ color: 'var(--t-titolo)' }}>Fogli</h3>
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
                    placeholder="Nome foglio" className="flex-1 min-w-0 bg-transparent text-sm font-semibold outline-none" style={{ color: 'var(--t-titolo)' }} />
                  <button onClick={e => { e.stopPropagation(); elimina(f.id) }} title="Elimina foglio" className="text-stone-400 hover:text-red-600 shrink-0"><Trash2 size={13} /></button>
                </div>
                <p className="text-[11px] text-stone-500 mt-0.5" style={{ marginLeft: 18 }}>{meseLabel(meseKey)} · {contaTurni.get(f.id) ?? 0} turni</p>
              </div>
            )
          })}
        </aside>

        {/* Turni del mese: clic per assegnarli al foglio attivo */}
        <div className="flex-1 min-w-0 card p-3">
          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--t-titolo)' }}>Turni configurati di {MESI[mese - 1]} {anno}
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
