import { useState, useMemo, useRef, useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ListChecks, AlertCircle, AlertTriangle, Plus, X, Trash2, Save, RotateCcw, Moon, Sun, Copy } from 'lucide-react'
import { store } from '../../lib/store'
import { nomeCompleto, gruppiPerLivello, TIPI_REGOLA_TURNISTA } from '../../types'
import { turnoApplicabileGiorno, prossimoInizio, fineEffettiva } from '../../lib/turniLogic'
import { GIORNI_SETTIMANA, ATTIVAZIONE_DA } from '../../lib/constants'
import { useStagedAssignments } from '../../hooks/useStagedAssignments'
import { useUnsaved } from '../../contexts/UnsavedContext'
import { usePostazione } from '../../contexts/PostazioneContext'
import { useMeseSelezionato } from '../../hooks/useMeseSelezionato'
import { useValiditaStaged } from '../../hooks/useValiditaStaged'
import { ValiditaRiquadro } from '../../components/ValiditaRiquadro'
import { IconaLivello } from '../../components/IconaLivello'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmModal } from '../../components/ConfirmModal'
import { useDragAutoScroll } from '../../hooks/useDragAutoScroll'
import type { TurnoSchema, Turnista, Livello, ConfigVersione, RegolaVersione, RegolaTurno, RegolaTurnista, TipoRegolaTurnista } from '../../types'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const mesePrec = (k: string) => { let [a, m] = k.split('-').map(Number); m--; if (m < 1) { m = 12; a-- } return `${a}-${String(m).padStart(2, '0')}` }
const meseSucc = (k: string) => { let [a, m] = k.split('-').map(Number); m++; if (m > 12) { m = 1; a++ } return `${a}-${String(m).padStart(2, '0')}` }
// Mese sorgente da mostrare nei testi: l'ultimo mese con contenuto andando indietro
// (può essere il mese prima o anche più indietro se i mesi intermedi erano vuoti).
const meseSorgente = (sorgenteValidoDa: string, tutteValidoDa: string[], meseKey: string): string => {
  const succ = tutteValidoDa.filter(d => d > sorgenteValidoDa && d < meseKey).sort()
  const cap = succ.length ? mesePrec(succ[0]) : mesePrec(meseKey)
  return cap < sorgenteValidoDa ? sorgenteValidoDa : cap
}
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

export function RegoleTurniPage() {
  const qc = useQueryClient()
  const { setHasUnsaved } = useUnsaved()
  const { confirm, notify, confirmState } = useConfirm()
  const { postazioneId, postazioneAttiva } = usePostazione()
  const { anno, mese, meseKey, setMeseAnno } = useMeseSelezionato()

  const { data: configVer, isLoading: loadingConfig } = useQuery<ConfigVersione | null>({ queryKey: ['versione', postazioneId, meseKey], queryFn: () => store.getVersioneMese(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: schema = [] } = useQuery<TurnoSchema[]>({ queryKey: ['schema', configVer?.id], queryFn: () => store.getSchemaVersione(configVer!.id), enabled: !!configVer })
  const { data: regoleVer, isLoading: loadingRegole } = useQuery<RegolaVersione | null>({ queryKey: ['regole-versione', postazioneId, meseKey], queryFn: () => store.getRegoleVersioneMese(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: regole = [] } = useQuery<RegolaTurno[]>({ queryKey: ['regole', regoleVer?.id], queryFn: () => store.getRegole(regoleVer!.id), enabled: !!regoleVer })
  const { data: regoleSpeciali = [] } = useQuery<RegolaTurnista[]>({ queryKey: ['regole-turnista', regoleVer?.id], queryFn: () => store.getRegoleTurnista(regoleVer!.id), enabled: !!regoleVer })
  const { data: turnisti = [] } = useQuery<Turnista[]>({ queryKey: ['turnisti', postazioneId], queryFn: () => store.getTurnisti(postazioneId!), enabled: !!postazioneId })
  const { data: tutteVer = [] } = useQuery<RegolaVersione[]>({ queryKey: ['regole-versioni-all', postazioneId], queryFn: () => store.getRegoleVersioni(postazioneId!), enabled: !!postazioneId })
  // Procedura sequenziale: passo 2 (regole). Richiede passo 1 (config attivato+valido).
  const nuovaProcedura = meseKey >= ATTIVAZIONE_DA
  const { data: attivazioni = [] } = useQuery<number[]>({ queryKey: ['attivazioni', postazioneId, meseKey], queryFn: () => store.getAttivazioni(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: sorgenteCopia } = useQuery<RegolaVersione | null>({ queryKey: ['ultima-regole-con-contenuto', postazioneId, meseKey], queryFn: () => store.ultimaRegoleConContenuto(postazioneId!, meseKey), enabled: !!postazioneId && nuovaProcedura })
  const config1Attivo = attivazioni.includes(1)
  const regole2Attivo = attivazioni.includes(2)

  const serverMap = useMemo(() => {
    const m = new Map<string, string>()
    regole.forEach(r => { if (r.turnista_id) m.set(`${r.giorno_settimana}|${r.turno_schema_id}|${r.slot}`, r.turnista_id) })
    return m
  }, [regole])
  const { local, dirty, set, diff, discard } = useStagedAssignments(serverMap, meseKey)
  const [saving, setSaving] = useState(false)
  // Validità del periodo (per sempre / fino a) — staged, niente auto-save (hook condiviso)
  const [salvandoVal, setSalvandoVal] = useState(false)
  const valid = useValiditaStaged(regoleVer, meseKey)
  // Impostazioni orario / cambio turno — STAGED (niente auto-save onBlur, che creava scorpori
  // a metà editing → versioni duplicate e turnisti che sparivano): si applicano col pulsante Salva.
  const [oreMin, setOreMin] = useState('')
  const [oreMaxSett, setOreMaxSett] = useState('')
  const [oreMaxCons, setOreMaxCons] = useState('')
  const [cambioAuto, setCambioAuto] = useState(true)
  const normOre = (s: string) => s.trim() === '' ? null : Math.max(0, parseInt(s) || 0)
  const oreDirty =
    normOre(oreMin) !== (regoleVer?.ore_min_settimana ?? null) ||
    normOre(oreMaxSett) !== (regoleVer?.ore_max_settimana ?? null) ||
    normOre(oreMaxCons) !== (regoleVer?.ore_max_consecutive ?? null) ||
    cambioAuto !== (regoleVer?.cambio_auto ?? true)
  // Regole speciali per turnista — anch'esse STAGED (drag → bozza → Aggiungi → riga; si salvano col Salva)
  const [speLocal, setSpeLocal] = useState<{ turnista_id: string; tipo: TipoRegolaTurnista; valore: number }[]>([])
  const [bozze, setBozze] = useState<{ key: string; turnista_id: string; tipo: TipoRegolaTurnista | ''; valore: string }[]>([])
  const speEditing = useRef(false)
  const tmpRef = useRef(0)
  const [overSpe, setOverSpe] = useState(false)
  const speSig = (arr: { turnista_id: string; tipo: TipoRegolaTurnista; valore: number }[]) => arr.map(r => `${r.turnista_id}|${r.tipo}|${r.valore}`).sort().join(',')
  const speDirty = speSig(speLocal) !== speSig(regoleSpeciali.map(r => ({ turnista_id: r.turnista_id, tipo: r.tipo, valore: r.valore })))
  const salvaDirty = dirty || oreDirty || speDirty   // barra Salva principale (regole fisse + impostazioni + regole speciali)
  const anyDirty = salvaDirty || valid.dirty

  useEffect(() => { setHasUnsaved(anyDirty); return () => setHasUnsaved(false) }, [anyDirty, setHasUnsaved])
  useEffect(() => {
    if (!anyDirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [anyDirty])
  useEffect(() => { setOreMin(regoleVer?.ore_min_settimana != null ? String(regoleVer.ore_min_settimana) : '') }, [regoleVer?.id, regoleVer?.ore_min_settimana])
  useEffect(() => { setOreMaxSett(regoleVer?.ore_max_settimana != null ? String(regoleVer.ore_max_settimana) : '') }, [regoleVer?.id, regoleVer?.ore_max_settimana])
  useEffect(() => { setOreMaxCons(regoleVer?.ore_max_consecutive != null ? String(regoleVer.ore_max_consecutive) : '') }, [regoleVer?.id, regoleVer?.ore_max_consecutive])
  useEffect(() => { setCambioAuto(regoleVer?.cambio_auto ?? true) }, [regoleVer?.id, regoleVer?.cambio_auto])
  useEffect(() => { if (!speEditing.current) setSpeLocal(regoleSpeciali.map(r => ({ turnista_id: r.turnista_id, tipo: r.tipo, valore: r.valore }))) }, [regoleSpeciali])
  useEffect(() => { speEditing.current = false; setBozze([]) }, [regoleVer?.id])   // cambio mese/versione: scarta bozze, riallinea

  const tById = useMemo(() => new Map(turnisti.map(t => [t.id, t])), [turnisti])
  const paletteGruppi = useMemo(() => gruppiPerLivello(turnisti), [turnisti])
  const nomeTurnista = (id: string) => { const t = tById.get(id); return t ? nomeCompleto(t) : '—' }
  // ordine dei turnisti come nella palette di sinistra (ruolo + alfabetico): per ordinare le regole speciali
  const ordineTid = useMemo(() => { const m = new Map<string, number>(); let i = 0; paletteGruppi.forEach(g => g.items.forEach(t => m.set(t.id, i++))); return m }, [paletteGruppi])
  const speOrdinate = useMemo(() => [...speLocal].sort((a, b) => {
    const oa = ordineTid.get(a.turnista_id) ?? 1e9, ob = ordineTid.get(b.turnista_id) ?? 1e9
    if (oa !== ob) return oa - ob
    return TIPI_REGOLA_TURNISTA.findIndex(t => t.value === a.tipo) - TIPI_REGOLA_TURNISTA.findIndex(t => t.value === b.tipo)
  }), [speLocal, ordineTid])
  const coloreTurnista = (id: string) => ROLE_COLOR[tById.get(id)?.livello ?? 'turnista']

  // drag&drop
  const dragSource = useRef<string | null>(null)
  const touchActive = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  useDragAutoScroll(!!draggingId)   // scroll automatico della pagina durante il trascinamento
  const [picker, setPicker] = useState<{ giorno: number; turno: TurnoSchema; x: number; y: number } | null>(null)
  const [warn, setWarn] = useState<string | null>(null)
  const [avvisoEsterno, setAvvisoEsterno] = useState<string | null>(null)   // toast persistente "hai messo un esterno"
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
  // "mai questo turno" = badge con slot NEGATIVO (convivono coi posti fissi, illimitati)
  function cellaVietati(giorno: number, turno: TurnoSchema): { tid: string; slot: number }[] {
    const out: { tid: string; slot: number }[] = []
    for (const [k, tid] of local) { const [gg, tt, ss] = k.split('|'); if (+gg === giorno && tt === turno.id && +ss < 0) out.push({ tid, slot: +ss }) }
    return out.sort((a, b) => b.slot - a.slot)
  }
  function vietaBadge(giorno: number, turno: TurnoSchema, slotFisso: number, tid: string) {
    const usati = new Set(cellaVietati(giorno, turno).map(v => v.slot))
    let neg = -1; while (usati.has(neg)) neg--
    set(`${giorno}|${turno.id}|${slotFisso}`, null)   // libera il posto fisso
    set(`${giorno}|${turno.id}|${neg}`, tid)          // crea il "mai"
  }
  function fissaBadge(giorno: number, turno: TurnoSchema, slotNeg: number, tid: string) {
    const free = cellaSlots(giorno, turno).findIndex(s => s === null)
    if (free === -1) { showWarn(`Per il turno “${turno.nome || 'senza nome'}” non c'è un posto fisso libero.`); return }
    set(`${giorno}|${turno.id}|${slotNeg}`, null)
    set(`${giorno}|${turno.id}|${free}`, tid)
  }
  async function handleDrop(giorno: number, turno: TurnoSchema) {
    const tid = dragSource.current
    dragSource.current = null; setOverKey(null)
    if (!tid || !turnoApplicabileGiorno(turno, giorno)) return
    const slots = cellaSlots(giorno, turno)
    if (slots.includes(tid)) { showWarn(`${nomeTurnista(tid)} è già in questo turno (${GIORNI_SETTIMANA[giorno - 1].nome}).`); return }
    const free = slots.findIndex(s => s === null)
    if (free === -1) { showWarn(`Per il turno “${turno.nome || 'senza nome'}” bastano ${turno.n_turnisti} turnist${turno.n_turnisti === 1 ? 'a' : 'i'}.`); return }
    const vietatoQui = cellaVietati(giorno, turno).find(v => v.tid === tid)   // era "mai" qui?
    if (vietatoQui) {
      if (!(await confirm({ title: 'Forzare l’inserimento?', message: `${nomeTurnista(tid)} è segnato «mai» per questo turno. Metterlo fisso lo stesso (toglie il divieto)?`, confirmLabel: 'Sì, forza', danger: true }))) return
      set(`${giorno}|${turno.id}|${vietatoQui.slot}`, null)   // forzatura: tolgo il divieto
    }
    set(`${giorno}|${turno.id}|${free}`, tid)
    if (tById.get(tid)?.livello === 'esterno') setAvvisoEsterno(nomeTurnista(tid))   // avviso non bloccante
  }
  // insieme dei "mai" attuali (per evidenziare le celle durante il trascinamento)
  const vietatoLocal = useMemo(() => {
    const s = new Set<string>()
    for (const [k, v] of local) { const [gg, tt, ss] = k.split('|'); if (+ss < 0) s.add(`${gg}|${tt}|${v}`) }
    return s
  }, [local])
  function cellStyle(giorno: number, turnoId: string): CSSProperties {
    const key = `${giorno}|${turnoId}`
    const base: CSSProperties = { padding: '8px', verticalAlign: 'top', minWidth: 110, transition: 'background 0.1s' }
    if (overKey === key) return { ...base, border: '2px dashed #2e7d32', background: '#dcf5dc', boxShadow: 'inset 0 0 0 2px rgba(46,125,50,0.35)' }
    if (draggingId) return vietatoLocal.has(`${giorno}|${turnoId}|${draggingId}`)
      ? { ...base, border: '1px solid #fca5a5', background: '#fee2e2' }   // rosso: "mai" qui
      : { ...base, border: '1px solid #86efac', background: '#f0fdf4' }   // verde
    return { ...base, border: '1px solid #e5e7eb', background: '#fff' }
  }

  async function cambiaMese(delta: number) {
    if (anyDirty && !(await confirm({ title: 'Modifiche non salvate', message: 'Hai modifiche non salvate. Cambiare mese senza salvarle?', confirmLabel: 'Sì, cambia', danger: true }))) return
    annullaTutto()
    if (valid.dirty) valid.reset()
    let m = mese + delta, a = anno
    if (m < 1) { m = 12; a-- } else if (m > 12) { m = 1; a++ }
    setMeseAnno(a, m)
  }
  async function configuraRegole() { await store.creaRegoleVersione(postazioneId!, meseKey); await qc.invalidateQueries({ queryKey: ['regole-versione'] }); await qc.invalidateQueries({ queryKey: ['regole-versioni-all'] }) }

  // ── Attivazione del mese — passo 2 (regole) ──
  async function ricaricaAttRegole() {
    await qc.invalidateQueries({ queryKey: ['regole-versione'] })
    await qc.invalidateQueries({ queryKey: ['regole-versioni-all'] })
    await qc.invalidateQueries({ queryKey: ['attivazioni'] })
    await qc.invalidateQueries({ queryKey: ['ultima-regole-con-contenuto'] })
  }
  async function assicuraContinuitaRegole(): Promise<boolean> {
    const attivati = new Set(await store.getMesiAttivati(postazioneId!, 2))
    const buchi: string[] = []
    for (let m = ATTIVAZIONE_DA; m < meseKey; m = meseSucc(m)) if (!attivati.has(m)) buchi.push(m)
    if (!buchi.length) return true
    if (!(await confirm({ title: 'Mesi non attivati', message: `${buchi.map(meseLabel).join(', ')}: regole non attivate. ${buchi.length === 1 ? 'Verrà attivato in bianco' : 'Verranno attivati in bianco'} per continuità, poi si procede. Procedere?`, confirmLabel: 'Sì, procedi' }))) return false
    for (const b of buchi) { await store.creaRegoleVersione(postazioneId!, b); await store.attivaPasso(postazioneId!, b, 2) }
    return true
  }
  function logRegoleAtt(testo: string) {
    store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'regole', messaggio: `Regole di ${meseLabel(meseKey)} ${testo}.`, target: '/admin/regole', perAdmin: true }).catch(() => {})
  }
  // Copia dall'ULTIMO mese con regole inserite (può essere il mese prima o anche più
  // indietro se i mesi intermedi erano vuoti). Crea una versione propria del mese.
  async function copiaRegolePrecedenti() {
    if (!(await assicuraContinuitaRegole())) return
    const sorgente = await store.ultimaRegoleConContenuto(postazioneId!, meseKey)
    const nuova = await store.creaRegoleVersione(postazioneId!, meseKey)
    if (sorgente) {
      const src = await store.getRegole(sorgente.id)
      // mappa i turni della sorgente → turni di QUESTO mese per NOME (gli id cambiano se la
      // config è stata ricreata); fallback all'id se è la stessa config (condivisa)
      const srcConfig = await store.getVersioneMese(postazioneId!, sorgente.valido_da)
      const srcTurni = srcConfig ? await store.getSchemaVersione(srcConfig.id) : []
      const norm = (n: string | null) => (n || '').trim().toLowerCase()
      const srcNome = new Map(srcTurni.map(t => [t.id, norm(t.nome)]))
      const curPerNome = new Map(schema.map(t => [norm(t.nome), t.id]))
      const curIds = new Set(schema.map(s => s.id))
      for (const r of src) {
        const nome = srcNome.get(r.turno_schema_id)
        let curTurnoId = nome ? curPerNome.get(nome) : undefined
        if (!curTurnoId && curIds.has(r.turno_schema_id)) curTurnoId = r.turno_schema_id
        if (curTurnoId) await store.setRegola(nuova.id, r.giorno_settimana, curTurnoId, r.slot, r.turnista_id)
      }
      // copia anche le impostazioni orario / cambio turno
      if (sorgente.ore_min_settimana != null) await store.setOreMinSettimana(nuova.id, sorgente.ore_min_settimana)
      if (sorgente.ore_max_settimana != null) await store.setOreMaxSettimana(nuova.id, sorgente.ore_max_settimana)
      if (sorgente.ore_max_consecutive != null) await store.setOreMaxConsecutive(nuova.id, sorgente.ore_max_consecutive)
      await store.setCambioAuto(nuova.id, sorgente.cambio_auto ?? true)
      // regole speciali per turnista: si copiano per turnista_id (stabile tra i mesi), solo per chi è ancora nel personale
      const turnistiIds = new Set(turnisti.map(t => t.id))
      const srcSpe = await store.getRegoleTurnista(sorgente.id)
      for (const rs of srcSpe) if (turnistiIds.has(rs.turnista_id)) await store.setRegolaTurnista(nuova.id, rs.turnista_id, rs.tipo, rs.valore)
    }
    await store.attivaPasso(postazioneId!, meseKey, 2)
    logRegoleAtt(`attivate (copiate da ${sorgente ? meseLabel(sorgente.valido_da) : 'periodo precedente'})`)
    await ricaricaAttRegole()
  }
  async function attivaRegoleVuote() {
    if (!(await assicuraContinuitaRegole())) return
    await store.creaRegoleVersione(postazioneId!, meseKey)
    await store.attivaPasso(postazioneId!, meseKey, 2)
    logRegoleAtt('attivate (nuove, vuote)')
    await ricaricaAttRegole()
  }
  // Salvataggio ESPLICITO della validità (niente più auto-save al clic sui radio)
  async function salvaValidita() {
    if (!regoleVer) return
    const fino = valid.draft
    if (fino != null && fino < regoleVer.valido_da) { showWarn(`La scadenza non può precedere l'inizio del periodo (${meseLabel(regoleVer.valido_da)}).`); return }
    if (fino === (regoleVer.valido_fino ?? null)) return
    setSalvandoVal(true)
    try {
      await store.setValiditaRegoleVersione(regoleVer.id, fino)
      store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'regole', messaggio: `Validità delle regole ${fino ? `impostata fino a ${meseLabel(fino)} compreso` : 'impostata su «per sempre»'}.`, target: '/admin/regole', perAdmin: true }).catch(() => {})
      await qc.invalidateQueries({ queryKey: ['regole-versione'] })
      await qc.invalidateQueries({ queryKey: ['regole-versioni-all'] })
    } catch (e) { console.error('[Regole] salvataggio validità fallito:', e); void notify({ title: 'Errore', message: 'Errore nel salvataggio della validità.' }) }
    finally { setSalvandoVal(false) }
  }
  async function cancellaRegole() {
    if (!regoleVer) return
    if (!(await confirm({ title: 'Cancella regole', message: `Cancellare le regole valide da ${meseLabel(regoleVer.valido_da)}? Non è reversibile.`, confirmLabel: 'Cancella', danger: true }))) return
    await store.deleteRegoleVersione(regoleVer.id)
    await qc.invalidateQueries({ queryKey: ['regole-versione'] }); await qc.invalidateQueries({ queryKey: ['regole-versioni-all'] })
  }
  // ── Regole speciali per turnista (staged): trascina → bozza → Aggiungi → riga ──
  const labelTipo = (t: TipoRegolaTurnista) => TIPI_REGOLA_TURNISTA.find(x => x.value === t)?.label ?? t
  // tipi non ancora usati per quel turnista (né confermati né in altre bozze): nel menu non si ripetono
  function tipiDisponibili(turnistaId: string, exceptKey?: string): TipoRegolaTurnista[] {
    const usati = new Set<string>()
    speLocal.forEach(r => { if (r.turnista_id === turnistaId) usati.add(r.tipo) })
    bozze.forEach(b => { if (b.turnista_id === turnistaId && b.key !== exceptKey && b.tipo) usati.add(b.tipo) })
    return TIPI_REGOLA_TURNISTA.map(t => t.value).filter(v => !usati.has(v))
  }
  function aggiungiRegolaTurnista(turnistaId: string) {
    if (tipiDisponibili(turnistaId).length === 0) { showWarn(`${nomeTurnista(turnistaId)} ha già tutte le regole speciali disponibili.`); return }
    speEditing.current = true
    setBozze(prev => [...prev, { key: `b-${++tmpRef.current}`, turnista_id: turnistaId, tipo: '', valore: '' }])
  }
  function setBozza(key: string, patch: Partial<{ tipo: TipoRegolaTurnista | ''; valore: string }>) {
    speEditing.current = true
    setBozze(prev => prev.map(b => b.key === key ? { ...b, ...patch } : b))
  }
  function confermaBozza(b: { key: string; turnista_id: string; tipo: TipoRegolaTurnista | ''; valore: string }) {
    const v = Math.max(0, parseInt(b.valore) || 0)
    if (!b.tipo || v <= 0) return
    speEditing.current = true
    setSpeLocal(prev => [...prev.filter(r => !(r.turnista_id === b.turnista_id && r.tipo === b.tipo)), { turnista_id: b.turnista_id, tipo: b.tipo as TipoRegolaTurnista, valore: v }])
    setBozze(prev => prev.filter(x => x.key !== b.key))
  }
  function scartaBozza(key: string) { setBozze(prev => prev.filter(b => b.key !== key)) }
  async function eliminaRegolaTurnista(turnistaId: string, tipo: TipoRegolaTurnista) {
    if (!(await confirm({ title: 'Elimina regola speciale', message: `Eliminare «${labelTipo(tipo)}» di ${nomeTurnista(turnistaId)}?`, confirmLabel: 'Elimina', danger: true }))) return
    speEditing.current = true
    setSpeLocal(prev => prev.filter(r => !(r.turnista_id === turnistaId && r.tipo === tipo)))
  }
  // Annulla TUTTE le modifiche in sospeso (regole fisse + impostazioni + regole speciali)
  function annullaTutto() {
    discard()
    setOreMin(regoleVer?.ore_min_settimana != null ? String(regoleVer.ore_min_settimana) : '')
    setOreMaxSett(regoleVer?.ore_max_settimana != null ? String(regoleVer.ore_max_settimana) : '')
    setOreMaxCons(regoleVer?.ore_max_consecutive != null ? String(regoleVer.ore_max_consecutive) : '')
    setCambioAuto(regoleVer?.cambio_auto ?? true)
    speEditing.current = false
    setSpeLocal(regoleSpeciali.map(r => ({ turnista_id: r.turnista_id, tipo: r.tipo, valore: r.valore })))
    setBozze([])
  }
  // ── Isolamento per mese (copy-on-write a "scorporo") ──
  // Se la versione regole copre più mesi (è ereditata da un periodo precedente o
  // si estende oltre questo mese), la SCORPORO così l'edit tocca SOLO questo mese:
  //   versione "prima" (capata) | versione di QUESTO mese | versione "dopo" (col contenuto originale).
  // Ritorna l'id della versione su cui scrivere (quella di questo mese).
  async function assicuraRegoleDelMese(): Promise<string> {
    // Rileggo lo stato FRESCO dal DB: rende lo scorporo idempotente anche con salvataggi
    // ravvicinati (niente più versioni duplicate / turnisti che spariscono dalla griglia).
    const V = await store.getRegoleVersioneMese(postazioneId!, meseKey)
    if (!V) return regoleVer!.id
    if (V.valido_da === meseKey && V.valido_fino === meseKey) return V.id   // già isolata a questo mese
    const regoleV = await store.getRegole(V.id)
    const speV = await store.getRegoleTurnista(V.id)
    const finoOrig = V.valido_fino
    const copiaIn = async (verId: string) => {
      for (const r of regoleV) await store.setRegola(verId, r.giorno_settimana, r.turno_schema_id, r.slot, r.turnista_id)
      for (const rs of speV) await store.setRegolaTurnista(verId, rs.turnista_id, rs.tipo, rs.valore)
      if (V.ore_min_settimana != null) await store.setOreMinSettimana(verId, V.ore_min_settimana)
      if (V.ore_max_settimana != null) await store.setOreMaxSettimana(verId, V.ore_max_settimana)
      if (V.ore_max_consecutive != null) await store.setOreMaxConsecutive(verId, V.ore_max_consecutive)
      await store.setCambioAuto(verId, V.cambio_auto ?? true)
    }
    const creaDopo = async () => {
      if (finoOrig != null && finoOrig <= meseKey) return
      const V2 = await store.creaRegoleVersione(postazioneId!, meseSucc(meseKey))
      await store.setValiditaRegoleVersione(V2.id, finoOrig)
      await copiaIn(V2.id)
    }
    if (V.valido_da === meseKey) {
      await store.setValiditaRegoleVersione(V.id, meseKey)   // limita a questo mese
      await creaDopo()
      return V.id
    }
    await store.setValiditaRegoleVersione(V.id, mesePrec(meseKey))   // chiudi la versione "prima"
    const W = await store.creaRegoleVersione(postazioneId!, meseKey)
    await store.setValiditaRegoleVersione(W.id, meseKey)
    await copiaIn(W.id)
    await creaDopo()
    if (meseKey >= ATTIVAZIONE_DA) await store.attivaPasso(postazioneId!, meseKey, 2)
    return W.id
  }
  async function salva() {
    if (!regoleVer) return
    setSaving(true)
    try {
      const verId = await assicuraRegoleDelMese()   // isola il mese se necessario
      const mod = diff()
      for (const c of mod) { const [giorno, turnoId, slot] = c.key.split('|'); await store.setRegola(verId, +giorno, turnoId, +slot, c.value) }
      // impostazioni orario / cambio turno (staged: applicate QUI col Salva, niente più autosave onBlur)
      await store.setOreMinSettimana(verId, normOre(oreMin))
      await store.setOreMaxSettimana(verId, normOre(oreMaxSett))
      await store.setOreMaxConsecutive(verId, normOre(oreMaxCons))
      await store.setCambioAuto(verId, cambioAuto)
      // regole speciali per turnista (staged): la versione del mese è isolata → riscrivo l'insieme
      if (speDirty) {
        await store.deleteRegoleTurnistaVersione(verId)
        for (const r of speLocal) await store.setRegolaTurnista(verId, r.turnista_id, r.tipo, r.valore)
      }
      speEditing.current = false
      if (mod.length || oreDirty || speDirty) store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'regole', messaggio: `Regole turni di ${meseLabel(meseKey)} aggiornate${mod.length ? ` · ${mod.length} modific${mod.length === 1 ? 'a' : 'he'}` : ''}.`, target: '/admin/regole', perAdmin: true }).catch(() => {})
      await qc.invalidateQueries({ queryKey: ['regole'] })
      await qc.invalidateQueries({ queryKey: ['regole-turnista'] })
      await qc.invalidateQueries({ queryKey: ['regole-versione'] })
      await qc.invalidateQueries({ queryKey: ['regole-versioni-all'] })
    } catch (e) { console.error('[Regole] salvataggio fallito:', e); void notify({ title: 'Errore', message: 'Errore nel salvataggio.' }) }
    finally { setSaving(false) }
  }

  const Header = (
    <div className="flex items-start gap-3">
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />
      <ListChecks size={22} style={{ color: '#476540' }} className="mt-1" />
      <div className="flex-1">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold" style={{ color: '#2b3c24' }}>Regole Turni{postazioneAttiva ? ` - ${postazioneAttiva.nome}` : ''}</h1>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button onClick={() => cambiaMese(-1)} className="btn-secondary px-2 py-1"><ChevronLeft size={16} /></button>
            <span className="font-bold text-lg text-center" style={{ color: '#3a3d30', minWidth: 130 }}>{MESI[mese - 1]} {anno}</span>
            <button onClick={() => cambiaMese(1)} className="btn-secondary px-2 py-1"><ChevronRight size={16} /></button>          </div>
        </div>
        <p className="text-sm text-stone-600">Trascina i turnisti dalla colonna sinistra nelle celle. Ricordati di premere <strong>Salva</strong>.</p>
      </div>
    </div>
  )
  const avviso = (testo: ReactNode) => (<div className="max-w-4xl mx-auto p-6 space-y-4">{Header}<div className="card p-5 flex items-start gap-3"><AlertCircle className="shrink-0 mt-0.5" style={{ color: '#b45309' }} size={18} /><p className="text-sm text-stone-600">{testo}</p></div></div>)

  if (!postazioneId) return <div className="max-w-4xl mx-auto p-6 space-y-4">{Header}<p className="text-sm text-stone-500">Caricamento postazione…</p></div>
  if (loadingConfig) return <div className="max-w-4xl mx-auto p-6 space-y-4">{Header}<p className="text-sm text-stone-500">Caricamento…</p></div>
  if (!configVer || schema.length === 0) return avviso(<>Nessun turno configurato per <strong>{MESI[mese - 1]} {anno}</strong>. Imposta prima i turni in <strong>Configurazione Turni</strong> (passo ②).</>)
  if (nuovaProcedura && !config1Attivo) return avviso(<>La <strong>Configurazione Turni</strong> di {MESI[mese - 1]} {anno} non è ancora stata <strong>attivata</strong>. Attivala prima (passo ②), poi torna qui.</>)
  if (loadingRegole) return <div className="max-w-4xl mx-auto p-6 space-y-4">{Header}<p className="text-sm text-stone-500">Caricamento…</p></div>
  if (nuovaProcedura && !regole2Attivo) {
    /* ── Gate di attivazione delle regole (passo 2) ── */
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-4">{Header}
        <div className="card p-8 text-center space-y-4">
          <ListChecks size={32} className="mx-auto" style={{ color: '#9ab488' }} />
          <div>
            <h3 className="text-base font-bold" style={{ color: '#2b3c24' }}>Attiva le regole di {MESI[mese - 1]} {anno}</h3>
            {sorgenteCopia ? (
              <p className="text-sm text-stone-600 mt-1">Puoi copiarle dall'ultimo mese con regole inserite (<strong>{meseLabel(meseSorgente(sorgenteCopia.valido_da, tutteVer.map(v => v.valido_da), meseKey))}</strong>), oppure attivarne di nuove. <span className="text-stone-400">(Le regole sono facoltative: i turni fissi non sono obbligatori.)</span></p>
            ) : (
              <p className="text-sm text-stone-600 mt-1">Non c'è ancora un mese con regole da cui copiare. Attivane di nuove (anche vuote: i turni fissi non sono obbligatori).</p>
            )}
          </div>
          <div className="flex gap-2 justify-center flex-wrap">
            {sorgenteCopia && <button onClick={copiaRegolePrecedenti} className="btn-primary text-sm"><Copy size={16} /> Copia da {meseLabel(meseSorgente(sorgenteCopia.valido_da, tutteVer.map(v => v.valido_da), meseKey))}</button>}
            <button onClick={attivaRegoleVuote} className={`${sorgenteCopia ? 'btn-secondary' : 'btn-primary'} text-sm`}><Plus size={16} /> Attiva nuove (vuote)</button>
          </div>
        </div>
      </div>
    )
  }
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
      <ValiditaRiquadro etichetta="Validità regole:" val={valid} salvando={salvandoVal} onSalva={salvaValidita} />

      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs text-stone-500 flex-1">
          Valide da <strong>{meseLabel(regoleVer.valido_da)}</strong>{eff ? <> a <strong>{meseLabel(eff)}</strong></> : <> in poi (per sempre)</>}
          {nxt && <span className="text-amber-700"> · dal {meseLabel(nxt)} subentra un periodo più recente</span>}.
        </p>
        {!nuovaProcedura && <button onClick={cancellaRegole} className="btn-danger text-xs py-1 px-2 shrink-0"><Trash2 size={13} /> Cancella queste regole</button>}
      </div>

      {/* Barra salvataggio */}
      <div className="flex items-center gap-2 flex-wrap">
        {salvaDirty && <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24' }}><AlertTriangle size={13} /> Modifiche non salvate</span>}
        <div className="ml-auto flex items-center gap-2">
          {salvaDirty && <button onClick={annullaTutto} className="btn-secondary text-xs py-1.5 px-3"><RotateCcw size={13} /> Annulla</button>}
          <button onClick={salva} disabled={!salvaDirty || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:cursor-default"
            style={salvaDirty ? { background: '#2e7d32', color: '#fff' } : { background: '#f3f4f6', color: '#9ca3af' }}>
            <Save size={15} /> {saving ? 'Salvo…' : 'Salva'}
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex gap-3 items-start"
        onTouchEnd={e => {
          if (!touchActive.current) return
          touchActive.current = false; setOverKey(null); setDraggingId(null); setOverSpe(false)
          const t = e.changedTouches[0]
          const el = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null
          const td = el?.closest('[data-giorno][data-turno]') as HTMLElement | null
          const sp = el?.closest('[data-speciali]') as HTMLElement | null
          if (td?.dataset.giorno && td.dataset.turno) { const turno = schema.find(s => s.id === td!.dataset.turno); if (turno) handleDrop(+td.dataset.giorno, turno) }
          else if (sp && dragSource.current) { const tid = dragSource.current; dragSource.current = null; aggiungiRegolaTurnista(tid) }
          else dragSource.current = null
        }}>

        <aside className="w-40 sm:w-44 shrink-0 space-y-3">
          {paletteGruppi.length ? paletteGruppi.map(g => (
            <div key={g.liv} className="card p-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider px-1 mb-1.5 flex items-center gap-1" style={{ color: ROLE_COLOR[g.liv].fg }}><IconaLivello livello={g.liv} size={11} /> {g.label}</h3>
              <div className="flex flex-col gap-1.5">{g.items.map(PaletteBadge)}</div>
            </div>
          )) : <div className="card p-2"><span className="text-xs text-stone-400 px-1">Nessun turnista.</span></div>}
        </aside>

        <div className="flex-1 min-w-0 space-y-3">
          <div className="overflow-auto card">
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
                    const vietati = cellaVietati(g.num, c)
                    const vuota = slots.every(s => s === null) && vietati.length === 0
                    return (
                      <td key={c.id} data-giorno={g.num} data-turno={c.id}
                        onDragOver={e => { e.preventDefault(); setOverKey(key) }}
                        onDragLeave={() => setOverKey(k => (k === key ? null : k))}
                        onDrop={e => { e.preventDefault(); handleDrop(g.num, c) }}
                        onClick={e => { if ((e.target as HTMLElement).closest('[data-badge]')) return; setPicker({ giorno: g.num, turno: c, x: e.clientX, y: e.clientY }) }}
                        style={{ ...cellStyle(g.num, c.id), cursor: 'copy' }}>
                        <div className="flex flex-col gap-1.5 items-start">
                          {slots.map((tid, slot) => tid ? (
                            <span key={slot} data-badge onClick={() => vietaBadge(g.num, c, slot, tid)} title="Clic per vietare (mai questo turno)"
                              className="relative rounded px-2 py-0.5 text-[11px] font-medium shadow-sm cursor-pointer" style={{ background: coloreTurnista(tid).bg, color: coloreTurnista(tid).fg }}>
                              {nomeTurnista(tid)}
                              <button onClick={e => { e.stopPropagation(); set(`${g.num}|${c.id}|${slot}`, null) }} title="Togli" className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center shadow" style={{ background: '#dc2626', color: '#fff', lineHeight: 1 }}><X size={10} strokeWidth={3} /></button>
                            </span>
                          ) : null)}
                          {vietati.map(({ tid, slot }) => (
                            <span key={slot} data-badge onClick={() => fissaBadge(g.num, c, slot, tid)} title="Mai questo turno · clic per rimetterlo fisso"
                              className="relative rounded px-2 py-0.5 text-[11px] font-semibold shadow-sm cursor-pointer" style={{ background: '#e5e7eb', color: '#6b7280' }}>
                              {nomeTurnista(tid)}
                              <svg className="absolute inset-0 pointer-events-none rounded" width="100%" height="100%" preserveAspectRatio="none" style={{ overflow: 'hidden' }}>
                                <line x1="0%" y1="100%" x2="100%" y2="0%" stroke="#64748b" strokeWidth="1.26" />
                              </svg>
                              <button onClick={e => { e.stopPropagation(); set(`${g.num}|${c.id}|${slot}`, null) }} title="Togli divieto" className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center shadow" style={{ background: '#dc2626', color: '#fff', lineHeight: 1 }}><X size={10} strokeWidth={3} /></button>
                            </span>
                          ))}
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

          {/* Regole speciali per turnista — sotto la griglia, a destra dell'elenco turnisti */}
          <div data-speciali="1"
        onDragOver={e => { e.preventDefault(); setOverSpe(true) }}
        onDragLeave={() => setOverSpe(false)}
        onDrop={e => { e.preventDefault(); setOverSpe(false); const tid = dragSource.current; dragSource.current = null; setDraggingId(null); if (tid) aggiungiRegolaTurnista(tid) }}
        className="card p-3 space-y-2 transition-colors"
        style={overSpe ? { boxShadow: 'inset 0 0 0 2px #2e7d32', background: '#f0fdf4' } : undefined}>
        <div className="flex items-baseline gap-2 flex-wrap">
          <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#476540' }}>Regole speciali per turnista</h3>
          <span className="text-[11px] text-stone-400">— trascina qui un turnista per aggiungere un limite personale (si somma alle altre regole)</span>
        </div>

        {speLocal.length === 0 && bozze.length === 0 && (
          <p className="text-xs text-stone-400 italic">Nessuna regola speciale. Verranno rispettate dall'Auto Assegnazione e segnalate (con possibilità di forzare) nell'assegnazione manuale.</p>
        )}

        {speOrdinate.map(r => {
          const col = coloreTurnista(r.turnista_id)
          return (
            <div key={`${r.turnista_id}|${r.tipo}`} className="flex items-center gap-2 flex-wrap rounded-lg px-2 py-1.5" style={{ background: '#f7f8f4' }}>
              <span className="rounded px-2 py-0.5 text-xs font-semibold shadow-sm" style={{ background: col.bg, color: col.fg }}>{nomeTurnista(r.turnista_id)}</span>
              <span className="text-sm" style={{ color: '#3a3d30' }}>{labelTipo(r.tipo)}: <strong>{r.valore}</strong></span>
              <button onClick={() => eliminaRegolaTurnista(r.turnista_id, r.tipo)} title="Elimina questa regola" className="ml-auto p-1.5 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 size={15} /></button>
            </div>
          )
        })}

        {bozze.map(b => {
          const disp = tipiDisponibili(b.turnista_id, b.key)
          const col = coloreTurnista(b.turnista_id)
          const valido = !!b.tipo && parseInt(b.valore) > 0
          return (
            <div key={b.key} className="flex items-center gap-2 flex-wrap rounded-lg px-2 py-1.5" style={{ background: '#fffdf5', border: '1px dashed #fbbf24' }}>
              <span className="rounded px-2 py-0.5 text-xs font-semibold shadow-sm" style={{ background: col.bg, color: col.fg }}>{nomeTurnista(b.turnista_id)}</span>
              <select value={b.tipo} onChange={e => setBozza(b.key, { tipo: e.target.value as TipoRegolaTurnista | '' })} className="input text-sm" style={{ width: 'auto' }}>
                <option value="">Scegli regola…</option>
                {disp.map(v => <option key={v} value={v}>{labelTipo(v)}</option>)}
              </select>
              <input type="number" min={1} value={b.valore} onChange={e => setBozza(b.key, { valore: e.target.value })} className="input text-sm w-20" placeholder="n." />
              <button onClick={() => confermaBozza(b)} disabled={!valido}
                className="flex items-center gap-1 text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:cursor-default"
                style={valido ? { background: '#2e7d32', color: '#fff' } : { background: '#f3f4f6', color: '#9ca3af' }}>
                <Plus size={14} /> Aggiungi
              </button>
              <button onClick={() => scartaBozza(b.key)} title="Scarta" className="p-1.5 rounded text-stone-400 hover:text-stone-600"><X size={15} /></button>
            </div>
          )
        })}
          </div>
        </div>
      </div>

      {/* Impostazioni sull'orario */}
      <div className="card p-3 space-y-2.5">
        <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#476540' }}>Impostazioni sull'orario</h3>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium flex-1" style={{ color: '#3a3d30', minWidth: 250 }} htmlFor="ore-min">Ore minime a settimana per un turnista:</label>
          <input id="ore-min" type="number" min={0} value={oreMin} onChange={e => setOreMin(e.target.value)} className="input text-sm w-24" placeholder="es. 36" />
          <span className="text-sm text-stone-500">ore</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ background: '#e7efe1', color: '#476540' }} title="Tolleranza fissa">± 2 ore</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium flex-1" style={{ color: '#3a3d30', minWidth: 250 }} htmlFor="ore-max-sett">Ore massime a settimana (da non superare):</label>
          <input id="ore-max-sett" type="number" min={0} value={oreMaxSett} onChange={e => setOreMaxSett(e.target.value)} className="input text-sm w-24" placeholder="nessuno" />
          <span className="text-sm text-stone-500">ore</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ background: '#e7efe1', color: '#476540' }} title="Tolleranza fissa">± 2 ore</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium flex-1" style={{ color: '#3a3d30', minWidth: 250 }} htmlFor="ore-max-cons">Ore massime consecutive (turni attaccati):</label>
          <input id="ore-max-cons" type="number" min={0} value={oreMaxCons} onChange={e => setOreMaxCons(e.target.value)} className="input text-sm w-24" placeholder="nessuno" />
          <span className="text-sm text-stone-500">ore</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ background: '#e7efe1', color: '#476540' }} title="Tolleranza fissa">± 2 ore</span>
        </div>
        <p className="text-[11px] text-stone-400">Usate dall'<strong>Auto Assegnazione</strong> e segnalate (ma forzabili) quando assegni a mano. Vuoto = nessun limite.</p>
      </div>

      {/* Impostazione: cambio turno (approvazione automatica / del responsabile) */}
      {(() => {
        const auto = cambioAuto
        return (
          <div className="card p-3 flex items-start gap-3">
            <button onClick={() => setCambioAuto(c => !c)} role="switch" aria-checked={auto} title="Attiva/disattiva l'approvazione automatica"
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

      {/* Menu a tendina su clic in una cella (in alternativa al trascinamento) */}
      {picker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPicker(null)} />
          <div className="fixed z-50 card p-1.5 shadow-2xl" style={{ left: Math.max(8, Math.min(picker.x, window.innerWidth - 210)), top: Math.max(8, Math.min(picker.y, window.innerHeight - 300)), width: 200, maxHeight: 290, overflow: 'auto', animation: 'fadeSlideIn 120ms ease-out' }} onClick={e => e.stopPropagation()}>
            <p className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-1" style={{ color: '#476540' }}>＋ {picker.turno.nome || 'Turno'} · {GIORNI_SETTIMANA[picker.giorno - 1].nome}</p>
            {paletteGruppi.length ? paletteGruppi.map(g => (
              <div key={g.liv}>
                <p className="text-[10px] font-bold uppercase tracking-wider px-1.5 pt-1.5 flex items-center gap-1" style={{ color: ROLE_COLOR[g.liv].fg }}><IconaLivello livello={g.liv} size={10} /> {g.label}</p>
                {g.items.map(t => (
                  <button key={t.id} onClick={() => { dragSource.current = t.id; handleDrop(picker.giorno, picker.turno); setPicker(null) }}
                    className="flex items-center gap-1.5 w-full text-left px-1.5 py-1 rounded hover:bg-stone-100 text-xs">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ROLE_COLOR[t.livello].fg }} />
                    <span className="truncate flex-1">{nomeCompleto(t)}</span>
                  </button>
                ))}
              </div>
            )) : <p className="text-xs text-stone-400 px-1.5 py-1">Nessun turnista.</p>}
          </div>
        </>
      )}

      {avvisoEsterno && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[60] px-4 w-full flex justify-center" style={{ top: 12 }} role="alert">
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl shadow-2xl" style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderLeft: '5px solid #d97706', color: '#78350f', maxWidth: 580, animation: 'fadeSlideIn 180ms ease-out' }}>
            <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: '#b45309' }} />
            <div className="flex-1">
              <p className="text-sm font-medium leading-snug"><strong>{avvisoEsterno}</strong> è un <strong>esterno</strong>: l'Auto Assegnazione lo metterà <strong>solo su questo turno fisso</strong> (le Regole sono sempre rispettate), dando comunque priorità ai turnisti. Ogni altro suo turno va gestito a mano, come per tutti gli esterni.</p>
              <button onClick={() => setAvvisoEsterno(null)} className="mt-2 text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: '#d97706', color: '#fff' }}>OK, ho letto</button>
            </div>
          </div>
        </div>
      )}

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
