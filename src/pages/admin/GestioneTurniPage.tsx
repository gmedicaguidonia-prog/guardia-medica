import { useState, useMemo, useRef, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CalendarDays, AlertCircle, AlertTriangle, Save, RotateCcw, X, Phone, UserPlus, Check, Moon, Sun, Wand2, Eye, EyeOff, Users, LayoutGrid, Eraser, History } from 'lucide-react'
import { store } from '../../lib/store'
import { nomeCompleto, gruppiPerLivello, STATI_CALENDARIO, STATO_CALENDARIO_STILE } from '../../types'
import { giorniDelMese, turnoSiApplica } from '../../lib/turniLogic'
import { autoAssegna, autoReperibilita, oreSettimana, oreConsecutive, vietatiDaRegole, type AutoAssegnaResult } from '../../lib/autoAssegna'
import { isFestivo, isPrefestivo, isoDate, giornoSettimana } from '../../lib/holidays'
import { useStagedAssignments } from '../../hooks/useStagedAssignments'
import { useImpaginazione } from '../../hooks/useImpaginazione'
import { useRealtimePostazione } from '../../hooks/useRealtime'
import { usePassiCompleti } from '../../hooks/usePassiCompleti'
import { PrerequisitiPassi } from '../../components/PrerequisitiPassi'
import { useUnsaved } from '../../contexts/UnsavedContext'
import { usePostazione } from '../../contexts/PostazioneContext'
import { useMeseSelezionato } from '../../hooks/useMeseSelezionato'
import { useDragAutoScroll } from '../../hooks/useDragAutoScroll'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmModal } from '../../components/ConfirmModal'
import type { TurnoSchema, Turnista, Turno, Livello, ConfigVersione, RegolaVersione, RegolaTurno, DesiderataFinestra, Desiderata, TipoDesiderata, StatoCalendario, RichiestaTurno, AuthUser, BackupTurni } from '../../types'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const WD = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab']
const itDate = (iso: string) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}` }
const fmtDT = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const REP_SLOT = -1   // slot speciale per il reperibile
const ROLE_COLOR: Record<Livello, { bg: string; fg: string }> = {
  admin:        { bg: '#fee2e2', fg: '#b91c1c' },
  responsabile: { bg: '#fef3c7', fg: '#92400e' },
  turnista:     { bg: '#dbeafe', fg: '#1e40af' },
  esterno:      { bg: '#dcfce7', fg: '#166534' },
}
const thStyle: CSSProperties = { background: '#2b3c24', color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 10px', textAlign: 'left', border: '1px solid #1f2d18', position: 'sticky', top: 0, zIndex: 2 }
const tdBase: CSSProperties = { padding: '6px 10px', border: '1px solid #e5e7eb', verticalAlign: 'top' }

/** Durata in ore di un turno (gestisce l'attraversamento della mezzanotte). */
function oreTurno(inizio: string, fine: string): number {
  const [h1, m1] = inizio.split(':').map(Number)
  const [h2, m2] = fine.split(':').map(Number)
  let min = (h2 * 60 + m2) - (h1 * 60 + m1)
  if (min <= 0) min += 24 * 60
  return min / 60
}

export function GestioneTurniPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { setHasUnsaved } = useUnsaved()
  const { confirm, notify, confirmState } = useConfirm()
  const { postazioneId, postazioneAttiva } = usePostazione()
  const { user: actore } = useOutletContext<{ user: AuthUser | null }>()
  const nomeAutore = actore ? nomeCompleto(actore) : null
  const { anno, mese, meseKey, setMeseAnno } = useMeseSelezionato()
  const [mostraRepMesi, setMostraRepMesi] = useState<Set<string>>(new Set())

  const { data: versione, isLoading: loadingVer } = useQuery<ConfigVersione | null>({ queryKey: ['versione', postazioneId, meseKey], queryFn: () => store.getVersioneMese(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: schema = [] }   = useQuery<TurnoSchema[]>({ queryKey: ['schema', versione?.id], queryFn: () => store.getSchemaVersione(versione!.id), enabled: !!versione })
  const { data: turnisti = [] } = useQuery<Turnista[]>({ queryKey: ['turnisti', postazioneId], queryFn: () => store.getTurnisti(postazioneId!), enabled: !!postazioneId })
  const { data: turni = [] }    = useQuery<Turno[]>({ queryKey: ['turni', postazioneId, anno, mese], queryFn: () => store.getTurniMese(postazioneId!, anno, mese), enabled: !!postazioneId })
  const { data: turnistiMese = [] } = useQuery<string[]>({ queryKey: ['turnisti-mese', postazioneId, meseKey], queryFn: () => store.getTurnistiMese(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: regoleVer } = useQuery<RegolaVersione | null>({ queryKey: ['regole-versione', postazioneId, meseKey], queryFn: () => store.getRegoleVersioneMese(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: regole = [] } = useQuery<RegolaTurno[]>({ queryKey: ['regole', regoleVer?.id], queryFn: () => store.getRegole(regoleVer!.id), enabled: !!regoleVer })
  const { data: finestraDes } = useQuery<DesiderataFinestra | null>({ queryKey: ['desiderata-finestra', postazioneId, meseKey], queryFn: () => store.getDesiderataFinestra(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: desiderataMese = [] } = useQuery<Desiderata[]>({ queryKey: ['desiderata', postazioneId, anno, mese], queryFn: () => store.getDesiderataMese(postazioneId!, anno, mese), enabled: !!postazioneId })
  const { data: statoCal = 'non_pubblicato' } = useQuery<StatoCalendario>({ queryKey: ['turni-stato', postazioneId, meseKey], queryFn: () => store.getStatoCalendario(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: richieste = [] } = useQuery<RichiestaTurno[]>({ queryKey: ['richieste', postazioneId, anno, mese], queryFn: () => store.getRichiesteMese(postazioneId!, anno, mese), enabled: !!postazioneId })
  const { fogliConTurni, impaginazioneOk } = useImpaginazione(postazioneId, meseKey, schema)
  const passi = usePassiCompleti(postazioneId, meseKey)   // gating passi 1-2-3 (4 facoltativo)
  // Tempo reale: candidature in arrivo, turni, stato calendario, desiderata.
  // Le modifiche NON salvate restano (useStagedAssignments riallinea solo se non si sta editando).
  useRealtimePostazione(postazioneId, [
    { tabella: 'richieste_turno', invalida: [['richieste', postazioneId]] },
    { tabella: 'turni',           invalida: [['turni', postazioneId]] },
    { tabella: 'turni_stato',     invalida: [['turni-stato', postazioneId]] },
    { tabella: 'desiderata',      invalida: [['desiderata', postazioneId]] },
  ])
  // ordinate per giorno crescente (stesso giorno raggruppato), poi per turno e arrivo
  const richiesteOrdinate = useMemo(() => {
    const ord = (id: string) => schema.find(s => s.id === id)?.ordine ?? 0
    return richieste.slice().sort((a, b) => a.data.localeCompare(b.data) || ord(a.turno_schema_id) - ord(b.turno_schema_id) || a.created_at.localeCompare(b.created_at))
  }, [richieste, schema])

  const serverMap = useMemo(() => {
    const m = new Map<string, string>()
    turni.forEach(t => { if (t.turnista_id) m.set(`${t.data}|${t.turno_schema_id}|${t.slot}`, t.turnista_id) })
    return m
  }, [turni])
  const { local, dirty, set, replaceAll, diff, discard } = useStagedAssignments(serverMap, meseKey)
  const [saving, setSaving] = useState(false)
  const [autoRes, setAutoRes] = useState<AutoAssegnaResult | null>(null)
  const [showAuto, setShowAuto] = useState(false)
  const [autoAnim, setAutoAnim] = useState(false)
  const autoTimer = useRef<number | null>(null)
  useEffect(() => () => { if (autoTimer.current) clearInterval(autoTimer.current) }, [])
  const [showImport, setShowImport] = useState(false)
  const [showStatoModal, setShowStatoModal] = useState(false)
  const [statoScelto, setStatoScelto] = useState<StatoCalendario>('non_pubblicato')
  const [savingStato, setSavingStato] = useState(false)
  // Ripristino versioni del calendario
  const [showRestore, setShowRestore] = useState(false)
  const [confermaId, setConfermaId] = useState<string | null>(null)
  const [ripristinando, setRipristinando] = useState<string | null>(null)
  const [pagBackup, setPagBackup] = useState(0)   // paginazione versioni (10/pagina)
  const { data: backups = [], isLoading: loadingBackup } = useQuery<BackupTurni[]>({ queryKey: ['turni-backup', postazioneId, meseKey], queryFn: () => store.getBackupTurni(postazioneId!, meseKey), enabled: !!postazioneId && showRestore })

  useEffect(() => { setHasUnsaved(dirty); return () => setHasUnsaved(false) }, [dirty, setHasUnsaved])
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const tById = useMemo(() => new Map(turnisti.map(t => [t.id, t])), [turnisti])
  const importati = useMemo(() => new Set(turnistiMese), [turnistiMese])
  // palette = solo i turnisti importati per questo mese, divisi per livello
  const paletteGruppi = useMemo(() => gruppiPerLivello(turnisti.filter(t => importati.has(t.id))), [turnisti, importati])
  // riepilogo auto-aggiornante (in base a ciò che è in tabella): T turni, N notti, F festivi, PF prefestivi
  const riepilogo = useMemo(() => {
    const stat = new Map<string, { T: number; N: number; F: number; PF: number }>()
    for (const [key, tid] of local) {
      const [ds, turnoId, slotStr] = key.split('|')
      if (+slotStr < 0) continue   // esclude il reperibile
      const turno = schema.find(s => s.id === turnoId); if (!turno) continue
      const s = stat.get(tid) ?? { T: 0, N: 0, F: 0, PF: 0 }
      s.T++
      if (turno.ora_fine <= turno.ora_inizio) s.N++   // notte = attraversa la mezzanotte
      const [y, m, d] = ds.split('-').map(Number); const date = new Date(y, m - 1, d)
      if (isFestivo(date)) s.F++; else if (isPrefestivo(date)) s.PF++
      stat.set(tid, s)
    }
    return gruppiPerLivello(turnisti.filter(t => stat.has(t.id))).flatMap(g => g.items).map(t => ({ t, ...stat.get(t.id)! }))
  }, [local, schema, turnisti])
  // candidati da importare (non ancora nella palette), divisi per livello
  const importGruppi = useMemo(() => gruppiPerLivello(turnisti.filter(t => !importati.has(t.id))), [turnisti, importati])
  const nomeTurnista = (id: string) => { const t = tById.get(id); return t ? nomeCompleto(t) : '—' }
  const coloreTurnista = (id: string) => ROLE_COLOR[tById.get(id)?.livello ?? 'turnista']
  // Ore assegnate per turnista nel mese (esclude il reperibile = slot -1)
  const durataById = useMemo(() => { const m = new Map<string, number>(); schema.forEach(c => m.set(c.id, oreTurno(c.ora_inizio, c.ora_fine))); return m }, [schema])
  // scelta di ciascun turnista per (giorno|turno) — per evidenziare le celle durante il trascinamento
  const desByKey = useMemo(() => { const m = new Map<string, TipoDesiderata>(); desiderataMese.forEach(d => m.set(`${d.data}|${d.turno_schema_id}|${d.turnista_id}`, d.tipo)); return m }, [desiderataMese])
  const vietatoSet = useMemo(() => vietatiDaRegole(regole), [regole])   // "mai questo turno": `${giornoSett}|${turnoId}|${tid}`
  const oreByTurnista = useMemo(() => {
    const m = new Map<string, number>()
    local.forEach((tid, key) => { const p = key.split('|'); if (+p[2] >= 0) m.set(tid, (m.get(tid) ?? 0) + (durataById.get(p[1]) ?? 0)) })
    return m
  }, [local, durataById])
  const fmtOre = (x: number) => (Number.isInteger(x) ? `${x}` : x.toFixed(1))

  const giorni = useMemo(() => giorniDelMese(anno, mese), [anno, mese])
  // Una griglia per foglio: righe = ogni (giorno, turno applicabile) DI QUEL foglio
  const righePerFoglio = useMemo(() => fogliConTurni.map(fc => {
    const out: { ds: string; d: Date; turno: TurnoSchema }[] = []
    giorni.forEach(d => fc.turni.forEach(c => { if (turnoSiApplica(c, d)) out.push({ ds: isoDate(d), d, turno: c }) }))
    return { foglio: fc.foglio, righe: out }
  }), [fogliConTurni, giorni])
  const righe = useMemo(() => righePerFoglio.flatMap(x => x.righe), [righePerFoglio])

  const hasRep = useMemo(() => [...local.keys()].some(k => k.endsWith(`|${REP_SLOT}`)), [local])
  const showRep = mostraRepMesi.has(meseKey) || hasRep

  // Copertura turni del mese: un turno è "coperto" quando tutti gli slot sono assegnati
  const copertura = useMemo(() => {
    let cop = 0
    righe.forEach(({ ds, turno }) => {
      const n = Array.from({ length: turno.n_turnisti }, (_, s) => local.get(`${ds}|${turno.id}|${s}`)).filter(Boolean).length
      if (turno.n_turnisti > 0 && n >= turno.n_turnisti) cop++
    })
    return { coperti: cop, totali: righe.length }
  }, [righe, local])
  const coperturaOk = copertura.totali > 0 && copertura.coperti >= copertura.totali
  // pre-controllo Auto Assegnazione
  const poolAuto = useMemo(() => turnisti.filter(t => importati.has(t.id) && t.livello !== 'esterno'), [turnisti, importati])
  const slotTotali = useMemo(() => righe.reduce((n, r) => n + r.turno.n_turnisti, 0), [righe])
  const nVorrei = useMemo(() => { const pool = new Set(poolAuto.map(t => t.id)); return desiderataMese.filter(d => d.tipo === 'desiderata' && pool.has(d.turnista_id)).length }, [desiderataMese, poolAuto])
  const regolePresenti = !!regoleVer && regole.length > 0
  const dispScarse = slotTotali > 0 && nVorrei < slotTotali
  // Warning (non bloccanti)
  const regoleVuote = !regoleVer || regole.length === 0
  const desNonPub = !finestraDes?.aperta_a
  const desVuote = !desNonPub && desiderataMese.length === 0
  const desiderataWarn = desNonPub || desVuote
  const desiderataMsg = desNonPub ? 'Desiderata non pubblicate' : 'Nessuna desiderata inserita'

  // ── drag&drop ──
  const dragSource = useRef<string | null>(null)
  const touchActive = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  useDragAutoScroll(!!draggingId)   // scroll automatico della pagina durante il trascinamento
  const [picker, setPicker] = useState<{ ds: string; turno: TurnoSchema; tipo: string; x: number; y: number } | null>(null)
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
  const parseMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
  /** Intervallo orario assoluto (in minuti) di un turno in una certa data.
   *  Se il turno passa la mezzanotte, la fine va al giorno dopo. */
  function intervallo(ds: string, turno: TurnoSchema): [number, number] {
    const [y, mo, d] = ds.split('-').map(Number)
    const base = Math.round(Date.UTC(y, mo - 1, d) / 86400000) * 1440
    let s = parseMin(turno.ora_inizio), e = parseMin(turno.ora_fine)
    if (e <= s) e += 1440
    return [base + s, base + e]
  }
  /** Se `tid` ha già un impegno (turno o reperibile) che si SOVRAPPONE come
   *  orario al turno target, ritorna quel turno; altrimenti null. */
  function conflittoOrario(tid: string, target: TurnoSchema, ds: string, escludiKey: string): TurnoSchema | null {
    const [sT, eT] = intervallo(ds, target)
    for (const [key, t] of local) {
      if (t !== tid || key === escludiKey) continue
      const p = key.split('|')
      const turno2 = schema.find(s => s.id === p[1])
      if (!turno2) continue
      const [s2, e2] = intervallo(p[0], turno2)
      if (sT < e2 && s2 < eT) return turno2   // sovrapposizione
    }
    return null
  }
  async function handleDrop(ds: string, turno: TurnoSchema, tipo: string) {
    const tid = dragSource.current; dragSource.current = null; setOverKey(null)
    if (!tid) return
    const sovr = (conf: TurnoSchema) => showWarn(`${nomeTurnista(tid)} è già impegnato in “${conf.nome || 'un turno'}” (${conf.ora_inizio}–${conf.ora_fine}) in sovrapposizione di orario.`)
    if (tipo === 'reperibile') {
      const conf = conflittoOrario(tid, turno, ds, `${ds}|${turno.id}|${REP_SLOT}`)
      if (conf) { sovr(conf); return }
      set(`${ds}|${turno.id}|${REP_SLOT}`, tid); return
    }
    const slots = turnistiSlots(ds, turno)
    if (slots.includes(tid)) { showWarn(`${nomeTurnista(tid)} è già in questo turno.`); return }
    const conf = conflittoOrario(tid, turno, ds, '')
    if (conf) { sovr(conf); return }
    const free = slots.findIndex(s => s === null)
    if (free === -1) { showWarn(`Per il turno “${turno.nome || 'senza nome'}” bastano ${turno.n_turnisti} turnist${turno.n_turnisti === 1 ? 'a' : 'i'}.`); return }
    // regole "morbide": lo inserisco comunque ma avviso (forzatura consentita)
    const avvisi: string[] = []
    if (desByKey.get(`${ds}|${turno.id}|${tid}`) === 'indisponibilita') avvisi.push('non voleva stare lì (indisponibile)')
    const [vy, vm, vd] = ds.split('-').map(Number)
    if (vietatoSet.has(`${giornoSettimana(new Date(vy, vm - 1, vd))}|${turno.id}|${tid}`)) avvisi.push('«mai questo turno» (Regole)')
    const maxS = regoleVer?.ore_max_settimana ?? null
    if (maxS != null && oreSettimana(local, schema, tid, ds) + (durataById.get(turno.id) ?? 0) > maxS + 2) avvisi.push(`supererà le ${maxS}h settimanali (±2)`)
    const maxC = regoleVer?.ore_max_consecutive ?? null
    if (maxC != null && oreConsecutive(local, schema, tid, ds, turno) > maxC + 2) avvisi.push(`supererà le ${maxC}h consecutive (±2)`)
    if (avvisi.length) {
      const ok = await confirm({ title: 'Forzare l’inserimento?', message: `${nomeTurnista(tid)}: ${avvisi.join(' · ')}. Vuoi inserirlo lo stesso (forzatura)?`, confirmLabel: 'Sì, forza', danger: true })
      if (!ok) return
    }
    set(`${ds}|${turno.id}|${free}`, tid)
  }

  async function cambiaMese(delta: number) {
    if (dirty && !(await confirm({ title: 'Modifiche non salvate', message: 'Hai modifiche non salvate. Cambiare mese senza salvarle?', confirmLabel: 'Sì, cambia', danger: true }))) return
    if (dirty) discard()
    let m = mese + delta, a = anno
    if (m < 1) { m = 12; a-- } else if (m > 12) { m = 1; a++ }
    setMeseAnno(a, m)
  }
  async function aggiungiReperibile() {
    const ok = await confirm({ title: 'Aggiungi reperibile', message: 'Aggiungere la colonna “Reperibile” per assegnare un reperibile a ogni turno?', confirmLabel: 'Aggiungi' })
    if (ok) setMostraRepMesi(prev => { const n = new Set(prev); n.add(meseKey); return n })
  }
  async function importaTurnista(id: string) { await store.addTurnistaMese(postazioneId!, meseKey, id); qc.invalidateQueries({ queryKey: ['turnisti-mese', postazioneId, meseKey] }) }
  async function rimuoviDalMese(id: string) { await store.removeTurnistaMese(meseKey, id); qc.invalidateQueries({ queryKey: ['turnisti-mese', postazioneId, meseKey] }) }
  // Importa: se ci sono turnisti con desiderata non ancora importati, propone di
  // importarli in automatico; poi apre comunque il modal per gli altri.
  async function apriImporta() {
    const desIds = [...new Set(desiderataMese.map(d => d.turnista_id))].filter(id => tById.has(id) && !importati.has(id))
    if (desIds.length > 0) {
      const ok = await confirm({
        title: 'Turnisti dalle desiderata',
        message: `Ci sono ${desIds.length} turnist${desIds.length === 1 ? 'a' : 'i'} con desiderata non ancora important${desIds.length === 1 ? 'o' : 'i'} per ${MESI[mese - 1]} ${anno}. Vuoi importarl${desIds.length === 1 ? 'o' : 'i'} automaticamente?`,
        confirmLabel: 'Sì, importa',
      })
      if (ok) {
        for (const id of desIds) await store.addTurnistaMese(postazioneId!, meseKey, id)
        await qc.invalidateQueries({ queryKey: ['turnisti-mese', postazioneId, meseKey] })
      }
    }
    setShowImport(true)
  }
  async function salva() {
    setSaving(true)
    try {
      const mod = diff()
      for (const c of mod) { const [data, turnoId, slot] = c.key.split('|'); await store.setAssegnazione(postazioneId!, data, turnoId, +slot, c.value) }
      if (mod.length) {
        // copia di backup (versione ripristinabile) dello stato appena salvato
        await store.snapshotTurni(postazioneId!, meseKey, 'Salvataggio del calendario', nomeAutore)
        store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'turni_salvati', messaggio: `Calendario turni di ${MESI[mese - 1]} ${anno} salvato · ${mod.length} modific${mod.length === 1 ? 'a' : 'he'}.`, target: '/admin/turni', perAdmin: true, autore: nomeAutore }).catch(() => {})
      }
      await qc.invalidateQueries({ queryKey: ['turni', postazioneId, anno, mese] })
    } catch (e) { console.error('[Turni] salvataggio fallito:', e); void notify({ title: 'Errore', message: 'Errore nel salvataggio.' }) }
    finally { setSaving(false) }
  }

  // ── Auto Assegnazione ──
  function eseguiAuto(aggiungi: boolean) {
    const poolIds = turnisti.filter(t => importati.has(t.id) && t.livello !== 'esterno').map(t => t.id)
    if (!poolIds.length) { showWarn('Nessun turnista importato per questo mese: importa prima il personale.'); return }
    // "aggiungi": mantieni i turnisti già inseriti (slot ≥ 0); "sostituisci": riparti da zero
    const esistenti = aggiungi ? new Map([...local].filter(([k]) => +k.split('|')[2] >= 0)) : undefined
    const res = autoAssegna({ giorni: giorniDelMese(anno, mese), schema, poolIds, regole, desiderata: desiderataMese, durataById, maxSettimana: regoleVer?.ore_max_settimana ?? null, maxConsecutive: regoleVer?.ore_max_consecutive ?? null, esistenti })
    store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'auto_assegnazione', messaggio: `Auto Assegnazione ${aggiungi ? '(aggiunta)' : '(sostituzione)'} di ${MESI[mese - 1]} ${anno}: ${res.coperti} turni su ${res.totali}. Da salvare.`, target: '/admin/turni', perAdmin: true, autore: nomeAutore }).catch(() => {})
    // base: in "aggiungi" mantengo tutto; in "sostituisci" tengo solo i reperibili
    const base = new Map<string, string>()
    for (const [k, v] of local) if (aggiungi || +k.split('|')[2] < 0) base.set(k, v)
    replaceAll(base)
    // i turni compaiono uno alla volta nell'ordine di assegnazione (≥ 4 secondi)
    const ord = res.ordine
    if (!ord.length) { setAutoRes(res); return }
    setAutoAnim(true)
    const interval = Math.max(15, Math.floor(4000 / ord.length))
    let i = 0
    autoTimer.current = window.setInterval(() => {
      const [k, v] = ord[i++]; set(k, v)
      if (i >= ord.length) { if (autoTimer.current) clearInterval(autoTimer.current); autoTimer.current = null; setAutoAnim(false); setAutoRes(res) }
    }, interval)
  }
  async function reset() {
    if (statoCal === 'pubblicato') return   // sicurezza: il pulsante è già disabilitato
    const inPian = statoCal === 'pianificazione'
    const ok = await confirm({
      title: '⚠️ Svuotare tutto il calendario?',
      message: `Stai per togliere TUTTI i turnisti dai turni di ${MESI[mese - 1]} ${anno}: la griglia resterà completamente vuota.${inPian ? ' Attenzione: il calendario è in modalità Pianificazione, quindi è già visibile ai turnisti e potrebbe contenere candidature già approvate.' : ''} Lo svuotamento diventa definitivo solo quando premi Salva — e in quel momento verrà comunque conservata una copia di backup ripristinabile. Procedere?`,
      confirmLabel: 'Sì, svuota tutto', danger: true,
    })
    if (ok) replaceAll(new Map())
  }
  // Ripristino di una versione: la CARICA nella griglia (in sospeso), NON la salva.
  // Diventa definitiva solo col Salva. Bloccato se pubblicato o con modifiche non salvate.
  async function ripristina(b: BackupTurni) {
    if (statoCal === 'pubblicato' || dirty) return
    setRipristinando(b.id)
    try {
      const snap = await store.getBackupSnapshot(b.id)
      const map = new Map<string, string>()
      for (const e of snap) if (e.turnista_id) map.set(`${e.data}|${e.turno_schema_id}|${e.slot}`, e.turnista_id)
      replaceAll(map)   // mette la versione nello staged → griglia "sporca", in attesa di Salva
      setConfermaId(null); setShowRestore(false)
      showWarn(`Versione del ${fmtDT(b.createdAt)} caricata nella griglia. Controllala e premi Salva per renderla definitiva.`)
    } catch (e) { console.error('[Turni] caricamento versione fallito:', e); void notify({ title: 'Errore', message: (e as Error).message || 'Errore nel caricamento della versione.' }) }
    finally { setRipristinando(null) }
  }
  function chiediAuto() {
    if (autoAnim) return
    if (!poolAuto.length) { showWarn('Nessun turnista importato per questo mese: importa prima il personale.'); return }
    setShowAuto(true)
  }

  // ── Assegna Reperibilità (solo a colonna attiva e con turni coperti ≥ 80%) ──
  function eseguiReperibilita() {
    if (!showRep) { showWarn('Attiva prima la colonna Reperibile.'); return }
    if (copertura.totali === 0 || copertura.coperti / copertura.totali < 0.8) {
      showWarn('Per assegnare le reperibilità i turni devono essere coperti almeno all’80% del totale.'); return
    }
    const poolIds = turnisti.filter(t => importati.has(t.id) && t.livello !== 'esterno').map(t => t.id)
    const { rep, assegnati } = autoReperibilita({ giorni: giorniDelMese(anno, mese), schema, poolIds, desiderata: desiderataMese, assegnazioni: local })
    if (!assegnati) { showWarn('Nessuna reperibilità assegnabile: nessuna disponibilità libera e compatibile.'); return }
    const nuovo = new Map(local); rep.forEach((v, k) => nuovo.set(k, v))
    replaceAll(nuovo)
    showWarn(`${assegnati} reperibilità assegnate dalle disponibilità libere. Rivedi e premi Salva.`)
  }

  function apriStatoModal() { setStatoScelto(statoCal); setShowStatoModal(true) }
  async function salvaStato() {
    if (statoScelto !== 'non_pubblicato' && importati.size === 0) {
      void notify({ title: 'Importa prima i turnisti', message: `Per pubblicare o mettere in pianificazione il calendario di ${MESI[mese - 1]} ${anno} devi prima importare i turnisti del mese (pagina Desiderata o «Importa i turnisti»).` })
      return
    }
    setSavingStato(true)
    try {
      await store.setStatoCalendario(postazioneId!, meseKey, statoScelto)
      store.addNotifica({ postazioneId: postazioneId!, mese: meseKey,
        tipo: statoScelto === 'pianificazione' ? 'calendario_pianificazione' : statoScelto === 'non_pubblicato' ? 'calendario_nascosto' : 'calendario_pubblicato',
        messaggio: statoScelto === 'pianificazione' ? `Calendario di ${MESI[mese - 1]} ${anno} in modalità pianificazione: i turnisti possono candidarsi ai turni scoperti.` : statoScelto === 'non_pubblicato' ? `Calendario di ${MESI[mese - 1]} ${anno} nascosto (non pubblicato).` : `Calendario turni di ${MESI[mese - 1]} ${anno} pubblicato.`,
        target: '/admin/turni', perAdmin: true, autore: nomeAutore }).catch(() => {})
      await qc.invalidateQueries({ queryKey: ['turni-stato', postazioneId, meseKey] })
      setShowStatoModal(false)
    } catch (e) { console.error('[Turni] salvataggio stato fallito:', e); void notify({ title: 'Errore', message: 'Errore nel salvataggio dello stato.' }) }
    finally { setSavingStato(false) }
  }

  // ── Richieste di candidatura (Modalità Pianificazione) ──
  //  Approva/Rifiuta NON cancellano: registrano lo stato, così il candidato che
  //  prova ad annullare sa se è stata approvata o rifiutata. Prima di agire si
  //  ricontrolla che la candidatura sia ancora "in attesa": il candidato
  //  potrebbe averla annullata nel frattempo.
  async function rifiutaRichiesta(r: RichiestaTurno) {
    const cur = await store.getRichiestaCorrente(postazioneId!, r.data, r.turno_schema_id, r.turnista_id)
    if (cur && cur.stato === 'in_attesa') {
      await store.setRichiestaStato(cur.id, 'rifiutata')
      const tn = schema.find(s => s.id === r.turno_schema_id)?.nome || 'un turno'
      store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'candidatura_rifiutata', messaggio: `La tua candidatura per ${tn} del ${itDate(r.data)} è stata rifiutata.`, target: '/turni', perAdmin: false, turnistaId: r.turnista_id, autore: nomeAutore }).catch(() => {})
    }
    qc.invalidateQueries({ queryKey: ['richieste', postazioneId, anno, mese] })
  }
  async function approvaRichiesta(r: RichiestaTurno) {
    const cur = await store.getRichiestaCorrente(postazioneId!, r.data, r.turno_schema_id, r.turnista_id)
    if (!cur || cur.stato !== 'in_attesa') {
      showWarn(`La candidatura di ${nomeTurnista(r.turnista_id)} non è più in attesa: è stata annullata dal candidato o già gestita.`)
      qc.invalidateQueries({ queryKey: ['richieste', postazioneId, anno, mese] })
      return
    }
    const turno = schema.find(s => s.id === r.turno_schema_id)
    if (!turno) return
    const conf = conflittoOrario(r.turnista_id, turno, r.data, '')
    if (conf) { showWarn(`Impossibile approvare: ${nomeTurnista(r.turnista_id)} è già impegnato in “${conf.nome || 'un turno'}” (${conf.ora_inizio}–${conf.ora_fine}) in sovrapposizione di orario.`); return }
    const slots = turnistiSlots(r.data, turno)
    if (slots.includes(r.turnista_id)) { await store.setRichiestaStato(cur.id, 'approvata'); qc.invalidateQueries({ queryKey: ['richieste', postazioneId, anno, mese] }); showWarn(`${nomeTurnista(r.turnista_id)} è già in questo turno: richiesta approvata.`); return }
    const free = slots.findIndex(s => s === null)
    if (free === -1) { showWarn(`Per il turno “${turno.nome || 'senza nome'}” del ${itDate(r.data)} non ci sono posti liberi.`); return }
    set(`${r.data}|${turno.id}|${free}`, r.turnista_id)                                  // mostra subito nella griglia admin
    await store.setAssegnazione(postazioneId!, r.data, turno.id, free, r.turnista_id)     // PERSISTE subito: niente "???" intermedi sulla pagina pubblica
    await store.setRichiestaStato(cur.id, 'approvata')
    await store.snapshotTurni(postazioneId!, meseKey, `Candidatura approvata (${nomeTurnista(r.turnista_id)})`, nomeAutore)
    store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'candidatura_approvata', messaggio: `La tua candidatura per ${turno.nome || 'un turno'} del ${itDate(r.data)} è stata approvata!`, target: '/turni', perAdmin: false, turnistaId: r.turnista_id, autore: nomeAutore }).catch(() => {})
    await qc.invalidateQueries({ queryKey: ['richieste', postazioneId, anno, mese] })
    await qc.invalidateQueries({ queryKey: ['turni', postazioneId, anno, mese] })
  }

  // Pulsante di stato (accanto al selettore mese) + descrittori
  const statoStile = STATO_CALENDARIO_STILE[statoCal]
  const StatoIcon = statoCal === 'pubblicato' ? Eye : statoCal === 'pianificazione' ? Users : EyeOff
  const statoLabel = STATI_CALENDARIO.find(s => s.value === statoCal)!.label

  const Header = (
    <div className="flex items-center gap-3 flex-wrap">
      <CalendarDays size={22} style={{ color: '#476540' }} />
      <h1 className="text-2xl font-bold" style={{ color: '#2b3c24' }}>Turni del Mese{postazioneAttiva ? ` - ${postazioneAttiva.nome}` : ''}</h1>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => cambiaMese(-1)} className="btn-secondary px-2 py-1"><ChevronLeft size={16} /></button>
        <span className="font-bold text-lg text-center" style={{ color: '#3a3d30', minWidth: 140 }}>{MESI[mese - 1]} {anno}</span>
        <button onClick={() => cambiaMese(1)} className="btn-secondary px-2 py-1"><ChevronRight size={16} /></button>      </div>
      {/* Stato del calendario turni — apre il modal di scelta */}
      <button onClick={apriStatoModal}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold border transition-all hover:brightness-95"
        style={{ background: statoStile.bg, color: statoStile.fg, borderColor: statoStile.border }}
        title="Imposta lo stato del calendario: decide cosa vedono i turnisti nella pagina pubblica">
        <StatoIcon size={15} /> {statoLabel}
      </button>

      {/* Modal: scelta dello stato del calendario */}
      {showStatoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(28,40,24,0.45)' }} onClick={() => setShowStatoModal(false)}>
          <div className="card w-full max-w-md p-5" style={{ animation: 'fadeSlideIn 160ms ease-out' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold" style={{ color: '#2b3c24' }}>Stato calendario · {MESI[mese - 1]} {anno}</h3>
              <button onClick={() => setShowStatoModal(false)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
            </div>
            <p className="text-xs text-stone-500 mb-3">Decidi cosa vedono i turnisti nella pagina pubblica «I miei turni».</p>
            <div className="space-y-2">
              {STATI_CALENDARIO.map(s => {
                const st = STATO_CALENDARIO_STILE[s.value]
                const sel = statoScelto === s.value
                const bloccato = s.value !== 'non_pubblicato' && importati.size === 0
                return (
                  <button key={s.value} disabled={bloccato} onClick={() => setStatoScelto(s.value)} className="w-full text-left rounded-lg p-3 border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ borderColor: sel ? st.fg : '#e5e7eb', background: sel ? st.bg : '#fff' }}>
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-full border-2 shrink-0" style={{ borderColor: sel ? st.fg : '#cbd5e1', background: sel ? st.fg : 'transparent' }} />
                      <span className="font-bold text-sm" style={{ color: sel ? st.fg : '#374151' }}>{s.label}</span>
                    </div>
                    <p className="text-xs text-stone-500 mt-1" style={{ marginLeft: 22 }}>{s.descr}</p>
                    {bloccato && <p className="text-[11px] mt-1 font-medium flex items-center gap-1" style={{ marginLeft: 22, color: '#b45309' }}><AlertTriangle size={12} /> Importa prima i turnisti del mese.</p>}
                  </button>
                )
              })}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowStatoModal(false)} className="btn-secondary text-sm py-1.5 px-3">Annulla</button>
              <button onClick={salvaStato} disabled={savingStato} className="btn-primary text-sm py-1.5 px-4">{savingStato ? 'Salvo…' : 'Salva'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  if (!postazioneId) return <div className="max-w-5xl mx-auto p-6">{Header}<p className="text-sm text-stone-500 mt-4">Caricamento postazione…</p></div>
  if (loadingVer) return <div className="max-w-5xl mx-auto p-6">{Header}<p className="text-sm text-stone-500 mt-4">Caricamento…</p></div>
  if (passi.nuovaProcedura && !passi.tuttiOk) return (
    <div className="max-w-5xl mx-auto p-6">{Header}
      <div className="mt-4">
        <PrerequisitiPassi titolo={`Per comporre i Turni di ${MESI[mese - 1]} ${anno} completa prima questi passi (la Desiderata è facoltativa):`} onVai={navigate} passi={[
          { n: '①', label: 'Configurazione Turni', ok: passi.passo1, to: '/admin/schema' },
          { n: '②', label: 'Regole Turni', ok: passi.passo2, to: '/admin/regole' },
          { n: '③', label: 'Impaginazione', ok: passi.passo3, to: '/admin/impaginazione' },
        ]} />
      </div>
    </div>
  )
  if (!versione || schema.length === 0) {
    return (
      <div className="max-w-5xl mx-auto p-6">{Header}
        <div className="card p-5 flex items-start gap-3 mt-4"><AlertCircle className="shrink-0 mt-0.5" style={{ color: '#b45309' }} size={18} />
          <p className="text-sm text-stone-600">Nessuna configurazione turni per <strong>{MESI[mese - 1]} {anno}</strong>. Impostala prima in <strong>Configurazione Turni</strong> (passo ①).</p>
        </div>
      </div>
    )
  }
  if (!impaginazioneOk) {
    return (
      <div className="max-w-5xl mx-auto p-6">{Header}
        <div className="card p-5 flex items-start gap-3 mt-4"><AlertCircle className="shrink-0 mt-0.5" style={{ color: '#b45309' }} size={18} />
          <div>
            <p className="text-sm text-stone-600 mb-2">Per <strong>{MESI[mese - 1]} {anno}</strong> manca l'<strong>impaginazione</strong>: prima di comporre i turni devi dividere i turni in fogli (passo ③).</p>
            <button onClick={() => navigate('/admin/impaginazione')} className="btn-primary text-sm py-1.5 px-3 inline-flex items-center gap-1.5"><LayoutGrid size={14} /> Vai a Impaginazione</button>
          </div>
        </div>
      </div>
    )
  }

  const PaletteBadge = (t: Turnista) => {
    const ore = oreByTurnista.get(t.id) ?? 0
    return (
      <div key={t.id} className="relative">
        <div draggable={true}
          onDragStart={e => { e.dataTransfer.effectAllowed = 'copyMove'; e.dataTransfer.setData('text/plain', t.id); dragSource.current = t.id; setDraggingId(t.id) }}
          onDragEnd={() => { setDraggingId(null); setOverKey(null); dragSource.current = null }}
          onTouchStart={() => { dragSource.current = t.id; touchActive.current = true; setDraggingId(t.id) }}
          className="rounded-md px-2 py-1 pr-6 text-xs font-medium select-none shadow-sm border border-white/60 transition-opacity flex items-center gap-1"
          style={{ background: ROLE_COLOR[t.livello].bg, color: ROLE_COLOR[t.livello].fg, cursor: 'grab', opacity: draggingId === t.id ? 0.4 : 1, touchAction: 'none' }}
          title={`Trascina ${nomeCompleto(t)} — ${fmtOre(ore)} ore assegnate`}>
          <span className="truncate flex-1">{nomeCompleto(t)}</span>
          <span className="shrink-0 font-bold text-[10px] rounded px-1" style={{ background: 'rgba(0,0,0,0.10)' }}>{fmtOre(ore)}h</span>
        </div>
        <button onClick={() => rimuoviDalMese(t.id)} title="Togli dal mese"
          className="absolute top-1/2 -translate-y-1/2 right-1 opacity-60 hover:opacity-100 transition-opacity"
          style={{ color: ROLE_COLOR[t.livello].fg }}><X size={11} strokeWidth={3} /></button>
      </div>
    )
  }
  const Chip = (tid: string, onX: () => void) => (
    <span data-chip className="relative rounded px-2 py-0.5 text-[11px] font-medium shadow-sm" style={{ background: coloreTurnista(tid).bg, color: coloreTurnista(tid).fg }}>
      {nomeTurnista(tid)}
      <button onClick={onX} title="Togli" className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center shadow" style={{ background: '#dc2626', color: '#fff', lineHeight: 1 }}><X size={10} strokeWidth={3} /></button>
    </span>
  )
  const dropStyle = (key: string): CSSProperties => {
    const base: CSSProperties = { ...tdBase, minWidth: 150 }
    if (overKey === key) return { ...base, border: '2px dashed #2e7d32', background: '#dcf5dc', boxShadow: 'inset 0 0 0 2px rgba(46,125,50,0.35)' }
    // durante il trascinamento: rosso dove il turnista è indisponibile, verde dove
    // è disponibile o non ha detto nulla (vale sia per i turni che per il reperibile)
    if (draggingId) {
      const [ds, turnoId] = key.split('|')
      const [y, m, d] = ds.split('-').map(Number)
      const indispo = desByKey.get(`${ds}|${turnoId}|${draggingId}`) === 'indisponibilita'
        || vietatoSet.has(`${giornoSettimana(new Date(y, m - 1, d))}|${turnoId}|${draggingId}`)   // "mai questo turno"
      return indispo
        ? { ...base, border: '1px solid #fca5a5', background: '#fee2e2' }
        : { ...base, border: '1px solid #86efac', background: '#f0fdf4' }
    }
    return { ...base, border: '1px solid #e5e7eb', background: '#fff' }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />

      {/* Modal: ripristino versioni del calendario */}
      {showRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(28,40,24,0.45)' }} onClick={() => !ripristinando && setShowRestore(false)}>
          <div className="card w-full max-w-lg p-5 max-h-[80vh] overflow-auto" style={{ animation: 'fadeSlideIn 160ms ease-out' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold flex items-center gap-2" style={{ color: '#2b3c24' }}><History size={18} style={{ color: '#1d4ed8' }} /> Ripristina calendario · {MESI[mese - 1]} {anno}</h3>
              <button onClick={() => setShowRestore(false)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
            </div>
            <p className="text-xs text-stone-500 mb-3">Scegli una versione: verrà <strong>caricata nella griglia</strong> ma <strong>non salvata in automatico</strong>. Controllala e premi <strong>Salva</strong> per renderla definitiva — solo allora viene creata una nuova copia di backup. Finché non salvi, lo stato attuale resta intatto.</p>
            {statoCal === 'pubblicato' ? (
              <div className="rounded-lg p-3 text-sm flex items-start gap-2" style={{ background: '#fef2f2', color: '#7f1d1d', border: '1px solid #fecaca' }}>
                <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>Il calendario è <strong>Pubblicato</strong>. Per ripristinare una versione, riportalo prima a <strong>«Non pubblicato»</strong> o <strong>«Pianificazione»</strong> (pulsante di stato in alto).</span>
              </div>
            ) : dirty ? (
              <div className="rounded-lg p-3 text-sm flex items-start gap-2" style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
                <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>Hai <strong>modifiche non salvate</strong>. Salvale (o premi «Annulla») prima di ripristinare una versione.</span>
              </div>
            ) : loadingBackup ? (
              <p className="text-sm text-stone-500">Caricamento versioni…</p>
            ) : backups.length === 0 ? (
              <p className="text-sm text-stone-500">Nessuna versione salvata per questo mese. Le versioni si creano a ogni salvataggio del calendario.</p>
            ) : (
              <>
                <div className="space-y-1.5">
                  {backups.slice(pagBackup * 10, pagBackup * 10 + 10).map((b, li) => {
                    const i = pagBackup * 10 + li
                    return (
                    <div key={b.id} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: '#f4f6f1', border: '1px solid #e5e7eb' }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate" style={{ color: '#2b3c24' }}>{i === 0 && <span title="Versione più recente" style={{ color: '#b45309' }}>★ </span>}{b.motivo ?? 'Versione'}</div>
                        <div className="text-[11px] text-stone-500">{b.autore ? `${b.autore} · ` : ''}{fmtDT(b.createdAt)} · {b.nTurni} turni</div>
                      </div>
                      {confermaId === b.id ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[11px] font-semibold" style={{ color: '#b91c1c' }}>Confermi?</span>
                          <button onClick={() => ripristina(b)} disabled={!!ripristinando} className="text-xs font-semibold py-1 px-2 rounded-md" style={{ background: '#2e7d32', color: '#fff' }}>{ripristinando === b.id ? '…' : 'Sì'}</button>
                          <button onClick={() => setConfermaId(null)} disabled={!!ripristinando} className="btn-secondary text-xs py-1 px-2">No</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfermaId(b.id)} className="shrink-0 flex items-center gap-1 text-xs font-semibold py-1 px-2.5 rounded-md transition-colors hover:brightness-95" style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd' }}><History size={12} /> Ripristina</button>
                      )}
                    </div>
                  )})}
                </div>
                {backups.length > 10 && (
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <button onClick={() => { setConfermaId(null); setPagBackup(p => Math.max(0, p - 1)) }} disabled={pagBackup === 0} className="btn-secondary text-xs py-1 px-2.5 disabled:opacity-40 disabled:cursor-default"><ChevronLeft size={13} /> Precedenti</button>
                    <span className="text-[11px] text-stone-500">Pagina {pagBackup + 1} di {Math.ceil(backups.length / 10)} · {backups.length} versioni</span>
                    <button onClick={() => { setConfermaId(null); setPagBackup(p => Math.min(Math.ceil(backups.length / 10) - 1, p + 1)) }} disabled={pagBackup >= Math.ceil(backups.length / 10) - 1} className="btn-secondary text-xs py-1 px-2.5 disabled:opacity-40 disabled:cursor-default">Successive <ChevronRight size={13} /></button>
                  </div>
                )}
                <p className="text-[10px] text-stone-400 mt-2">Le versioni più vecchie di 2 mesi vengono ridotte all'ultima per liberare spazio nel database.</p>
              </>
            )}
            <div className="flex justify-end mt-3"><button onClick={() => setShowRestore(false)} className="btn-secondary text-sm py-1.5 px-3">Chiudi</button></div>
          </div>
        </div>
      )}

      {/* Modal: importa turnisti per il mese */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(28,40,24,0.45)' }} onClick={() => setShowImport(false)}>
          <div className="card w-full max-w-md p-5 max-h-[80vh] overflow-auto" style={{ animation: 'fadeSlideIn 160ms ease-out' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold" style={{ color: '#2b3c24' }}>Importa turnisti · {MESI[mese - 1]} {anno}</h3>
              <button onClick={() => setShowImport(false)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
            </div>
            <p className="text-xs text-stone-500 mb-3">Clicca un turnista per aggiungerlo alla palette del mese (chi farà le rotazioni).</p>
            {importGruppi.length ? importGruppi.map(g => (
              <div key={g.liv} className="mb-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: ROLE_COLOR[g.liv].fg }}>{g.label}</h4>
                <div className="flex flex-wrap gap-2">
                  {g.items.map(t => (
                    <button key={t.id} onClick={() => importaTurnista(t.id)} className="rounded-md px-2 py-1 text-xs font-medium shadow-sm border border-white/60 hover:scale-105 transition-transform"
                      style={{ background: ROLE_COLOR[t.livello].bg, color: ROLE_COLOR[t.livello].fg }}>{nomeCompleto(t)} <span className="font-bold opacity-60">＋</span></button>
                  ))}
                </div>
              </div>
            )) : <span className="text-xs text-stone-400">Tutti i turnisti sono già nella palette.</span>}
            <div className="flex justify-end mt-2"><button onClick={() => setShowImport(false)} className="btn-primary text-sm py-1.5 px-3">Fatto</button></div>
          </div>
        </div>
      )}
      {Header}

      {/* Barra azioni / salvataggio */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={apriImporta} className="btn-secondary text-sm py-1.5 px-3"><UserPlus size={14} /> Importa i turnisti</button>
        {!showRep && <button onClick={aggiungiReperibile} className="btn-secondary text-sm py-1.5 px-3"><Phone size={14} /> Aggiungi Reperibile</button>}
        {showRep && <button onClick={eseguiReperibilita} className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg border transition-all hover:brightness-95" style={{ background: '#fff7ed', color: '#9a3412', borderColor: '#fdba74' }} title="Riempi le reperibilità con le disponibilità libere (richiede turni coperti almeno all’80%)"><Phone size={14} /> Assegna Reperibilità</button>}
        <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full" style={
          copertura.totali === 0 ? { background: '#eef1ea', color: '#476540', border: '1px solid #c9d8bf' }
          : copertura.coperti === 0 ? { background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }
          : copertura.coperti >= copertura.totali ? { background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }
          : { background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24' }
        } title="Turni del mese con tutti i posti assegnati (rosso = nessuno, giallo = parziale, verde = completo)"><CalendarDays size={13} /> Turni coperti {copertura.coperti}/{copertura.totali}</span>
        <button onClick={chiediAuto}
          className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg border transition-all hover:brightness-95"
          style={{ background: '#ede9fe', color: '#6d28d9', borderColor: '#c4b5fd' }}
          title="Calcola e proponi l'assegnazione automatica dei turni del mese">
          <Wand2 size={14} /> Auto Assegnazione
        </button>
        {regoleVuote && <button onClick={() => navigate('/admin/regole')} className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full hover:brightness-95 transition-all" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24' }} title="Vai alle Regole Turni"><AlertTriangle size={13} /> Regole del mese non impostate</button>}
        {desiderataWarn && <button onClick={() => navigate('/admin/desiderata')} className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full hover:brightness-95 transition-all" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24' }} title="Vai a Desiderata - Indisponibilità"><AlertTriangle size={13} /> {desiderataMsg}</button>}
        {dirty && <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24' }}><AlertTriangle size={13} /> Modifiche non salvate</span>}
        <div className="ml-auto flex items-center gap-2">
          {dirty && <button onClick={discard} className="btn-secondary text-xs py-1.5 px-3"><RotateCcw size={13} /> Annulla</button>}
          <button onClick={() => { setConfermaId(null); setPagBackup(0); setShowRestore(true) }} title="Ripristina una versione precedente del calendario" className="flex items-center gap-1 text-xs font-semibold py-1.5 px-2.5 rounded-lg transition-colors hover:brightness-95" style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd' }}><History size={13} /> Ripristina</button>
          <button onClick={reset} disabled={statoCal === 'pubblicato'} title={statoCal === 'pubblicato' ? 'Il calendario è pubblicato: non puoi svuotarlo' : 'Svuota la griglia (poi salva)'} className="flex items-center gap-1 text-xs font-semibold py-1.5 px-2.5 rounded-lg transition-colors hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100" style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}><Eraser size={13} /> Reset</button>
          <button onClick={salva} disabled={!dirty || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:cursor-default"
            style={dirty ? { background: '#2e7d32', color: '#fff' } : { background: '#f3f4f6', color: '#9ca3af' }}>
            <Save size={15} /> {saving ? 'Salvo…' : 'Salva'}
          </button>
        </div>
      </div>

      {turnisti.length === 0 && <div className="card p-3 text-sm" style={{ color: '#92400e', background: '#fef3c7' }}>Aggiungi prima dei turnisti nella pagina <strong>Turnisti</strong>.</div>}

      {/* Richieste di candidatura (arrivano dalla Modalità Pianificazione) */}
      {richieste.length > 0 && (
        <div className="card p-3 space-y-2" style={{ border: '1px solid #fecaca', background: '#fffafa' }}>
          <div className="flex items-center gap-2">
            <UserPlus size={16} style={{ color: '#b91c1c' }} />
            <h3 className="text-sm font-bold" style={{ color: '#7f1d1d' }}>Richieste di candidatura ({richieste.length})</h3>
          </div>
          <div className="space-y-1.5">
            {richiesteOrdinate.map(r => {
              const turno = schema.find(s => s.id === r.turno_schema_id)
              return (
                <div key={r.id} className="flex items-center gap-2 flex-wrap rounded-lg px-3 py-2" style={{ background: '#fff', border: '1px solid #fee2e2' }}>
                  <span className="text-sm flex-1" style={{ color: '#3a3d30', minWidth: 180 }}>
                    <strong style={{ color: coloreTurnista(r.turnista_id).fg }}>{nomeTurnista(r.turnista_id)}</strong> si propone per <strong>{turno?.nome || 'turno'}</strong> del <strong>{itDate(r.data)}</strong>{turno && <span className="text-xs text-stone-500"> ({turno.ora_inizio}–{turno.ora_fine})</span>}
                  </span>
                  <button onClick={() => approvaRichiesta(r)} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors hover:brightness-110" style={{ background: '#16a34a', color: '#fff' }}><Check size={13} /> Approva</button>
                  <button onClick={() => rifiutaRichiesta(r)} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors hover:brightness-95" style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}><X size={13} /> Rifiuta</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
          {paletteGruppi.length ? paletteGruppi.map(g => (
            <div key={g.liv} className="card p-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider px-1 mb-1.5" style={{ color: ROLE_COLOR[g.liv].fg }}>{g.label}</h3>
              <div className="flex flex-col gap-1.5">{g.items.map(PaletteBadge)}</div>
            </div>
          )) : <div className="card p-2"><span className="text-xs text-stone-400 px-1">Nessun turnista importato. Usa “Importa i turnisti”.</span></div>}

          {/* Riepilogo turni assegnati (auto-aggiornante in base alla tabella) */}
          {riepilogo.length > 0 && (
            <div className="card p-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider px-1 mb-1.5" style={{ color: '#476540' }}>Riepilogo turni</h3>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #eef0ea' }}>
                    <th style={{ textAlign: 'left', padding: '1px 2px' }} />
                    <th style={{ padding: '1px 2px', textAlign: 'center', color: '#2b3c24', fontWeight: 800 }} title="Turni">T</th>
                    <th style={{ padding: '1px 2px', textAlign: 'center', color: '#64748b', fontWeight: 800 }} title="Notti">N</th>
                    <th style={{ padding: '1px 2px', textAlign: 'center', color: '#b91c1c', fontWeight: 800 }} title="Festivi">F</th>
                    <th style={{ padding: '1px 2px', textAlign: 'center', color: '#b45309', fontWeight: 800 }} title="Prefestivi">PF</th>
                  </tr>
                </thead>
                <tbody>
                  {riepilogo.map(({ t, T, N, F, PF }) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid #f4f5f1' }}>
                      <td style={{ padding: '2px 2px', lineHeight: 1.15 }} title={nomeCompleto(t)}>
                        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: ROLE_COLOR[t.livello].fg, marginRight: 3, verticalAlign: 'middle' }} />{nomeCompleto(t)}
                      </td>
                      <td style={{ padding: '2px', textAlign: 'center', fontWeight: 800, color: '#2b3c24' }}>{T}</td>
                      <td style={{ padding: '2px', textAlign: 'center', color: '#475569' }}>{N || ''}</td>
                      <td style={{ padding: '2px', textAlign: 'center', color: '#b91c1c' }}>{F || ''}</td>
                      <td style={{ padding: '2px', textAlign: 'center', color: '#b45309' }}>{PF || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[9px] leading-snug text-stone-400 mt-1.5 px-1">
                <strong>T</strong>=turni · <strong>N</strong>=notti · <strong>F</strong>=festivi · <strong>PF</strong>=prefestivi
              </p>
            </div>
          )}
        </aside>

        {/* Una griglia per foglio (passo ③ Impaginazione) */}
        <div className="flex-1 min-w-0 space-y-4">
          {righePerFoglio.map(({ foglio, righe: righeF }) => (
          <div key={foglio.id} className="card overflow-auto">
            <div className="px-3 py-2 flex items-center justify-center gap-2" style={{ borderBottom: '1px solid #eef0ea' }}>
              <LayoutGrid size={14} style={{ color: '#476540' }} />
              <h3 className="text-sm font-bold uppercase text-center" style={{ color: '#2b3c24' }}>{foglio.nome} - Turni del mese di {MESI[mese - 1]} {anno}</h3>
            </div>
          <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, left: 0, zIndex: 3, width: 1, whiteSpace: 'nowrap' }}>Turno</th>
                <th style={thStyle}>Turnisti</th>
                {showRep && <th style={thStyle}>Reperibile</th>}
              </tr>
            </thead>
            <tbody>
              {righeF.map(({ ds, d, turno }) => {
                const fest = isFestivo(d), pref = isPrefestivo(d)
                const dayColor = fest ? '#b91c1c' : pref ? '#b45309' : '#2b3c24'
                const overnight = turno.ora_fine <= turno.ora_inizio
                const rowBg = fest ? '#fdecea' : pref ? '#fff5e6' : '#fff'
                const kT = `${ds}|${turno.id}|turnisti`, kR = `${ds}|${turno.id}|reperibile`
                const slots = turnistiSlots(ds, turno)
                const rep = local.get(`${ds}|${turno.id}|${REP_SLOT}`) ?? null
                const assegnati = slots.filter(Boolean).length
                const pieno = turno.n_turnisti > 0 && assegnati >= turno.n_turnisti
                return (
                  <tr key={`${ds}|${turno.id}`} style={{ background: rowBg }}>
                    <td style={{ ...tdBase, whiteSpace: 'nowrap', width: 1, position: 'sticky', left: 0, background: rowBg, zIndex: 1 }}>
                      <div className="flex items-center gap-1.5">
                        <span style={{ fontWeight: 700, color: dayColor }}>{d.getDate()} {WD[d.getDay()]}</span>
                        <span className="inline-flex items-center gap-1" style={{ color: '#475569' }}>{overnight ? <Moon size={12} style={{ color: '#64748b' }} /> : <Sun size={12} style={{ color: '#f59e0b' }} />}{turno.nome || 'Turno'}</span>
                        <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={pieno ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>{assegnati}/{turno.n_turnisti}</span>
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }} className="flex items-center gap-1.5">
                        <span>{turno.ora_inizio}–{turno.ora_fine}</span>
                        {pieno && <span className="inline-flex items-center gap-0.5 font-bold" style={{ color: '#166534' }}><Check size={10} strokeWidth={3} /> Turno riempito</span>}
                      </div>
                    </td>
                    <td data-data={ds} data-turno={turno.id} data-tipo="turnisti"
                      onDragOver={e => { e.preventDefault(); setOverKey(kT) }} onDragLeave={() => setOverKey(k => k === kT ? null : k)} onDrop={e => { e.preventDefault(); handleDrop(ds, turno, 'turnisti') }}
                      onClick={e => { if ((e.target as HTMLElement).closest('[data-chip]')) return; setPicker({ ds, turno, tipo: 'turnisti', x: e.clientX, y: e.clientY }) }}
                      style={{ ...dropStyle(kT), cursor: 'copy' }}>
                      <div className="flex flex-wrap gap-2 items-start">
                        {slots.map((tid, slot) => tid ? <span key={slot}>{Chip(tid, () => set(`${ds}|${turno.id}|${slot}`, null))}</span> : null)}
                        {slots.every(s => s === null) && <span className="text-[10px] text-stone-300 italic">trascina o clicca</span>}
                      </div>
                    </td>
                    {showRep && (
                      <td data-data={ds} data-turno={turno.id} data-tipo="reperibile"
                        onDragOver={e => { e.preventDefault(); setOverKey(kR) }} onDragLeave={() => setOverKey(k => k === kR ? null : k)} onDrop={e => { e.preventDefault(); handleDrop(ds, turno, 'reperibile') }}
                        onClick={e => { if ((e.target as HTMLElement).closest('[data-chip]')) return; setPicker({ ds, turno, tipo: 'reperibile', x: e.clientX, y: e.clientY }) }}
                        style={{ ...dropStyle(kR), cursor: 'copy' }}>
                        {rep ? Chip(rep, () => set(`${ds}|${turno.id}|${REP_SLOT}`, null)) : <span className="text-[10px] text-stone-300 italic">trascina o clicca</span>}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
          ))}
        </div>
      </div>

      {/* Mini-elenco vicino al puntatore — stessi gruppi e ordine della palette */}
      {picker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPicker(null)} />
          <div className="fixed z-50 card p-1.5 shadow-2xl" style={{ left: Math.max(8, Math.min(picker.x, window.innerWidth - 210)), top: Math.max(8, Math.min(picker.y, window.innerHeight - 300)), width: 200, maxHeight: 290, overflow: 'auto', animation: 'fadeSlideIn 120ms ease-out' }} onClick={e => e.stopPropagation()}>
            <p className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-1" style={{ color: '#476540' }}>＋ {picker.turno.nome || 'Turno'} · {picker.tipo === 'reperibile' ? 'Reperibile' : 'Turnisti'}</p>
            {paletteGruppi.length ? paletteGruppi.map(g => (
              <div key={g.liv}>
                <p className="text-[10px] font-bold uppercase tracking-wider px-1.5 pt-1.5" style={{ color: ROLE_COLOR[g.liv].fg }}>{g.label}</p>
                {g.items.map(t => (
                  <button key={t.id} onClick={() => { dragSource.current = t.id; handleDrop(picker.ds, picker.turno, picker.tipo); setPicker(null) }}
                    className="flex items-center gap-1.5 w-full text-left px-1.5 py-1 rounded hover:bg-stone-100 text-xs">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ROLE_COLOR[t.livello].fg }} />
                    <span className="truncate flex-1">{nomeCompleto(t)}</span>
                    <span className="text-[10px] text-stone-400">{fmtOre(oreByTurnista.get(t.id) ?? 0)}h</span>
                  </button>
                ))}
              </div>
            )) : <p className="text-xs text-stone-400 px-1.5 py-1">Nessun turnista importato per il mese.</p>}
          </div>
        </>
      )}

      {/* Riepilogo Auto Assegnazione */}
      {/* Pre-controllo Auto Assegnazione */}
      {showAuto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(28,40,24,0.5)' }} onClick={() => setShowAuto(false)}>
          <div className="card w-full max-w-md p-5" style={{ animation: 'fadeSlideIn 160ms ease-out' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2"><Wand2 size={18} style={{ color: '#6d28d9' }} /><h3 className="text-base font-bold" style={{ color: '#2b3c24' }}>Auto Assegnazione · {MESI[mese - 1]} {anno}</h3></div>
            <p className="text-sm text-stone-600 mb-3">Scegli come calcolare. <strong>Aggiungi</strong> = riempie i posti vuoti mantenendo i turnisti già inseriti a mano (quelli "vincono"). <strong>Sostituisci tutto</strong> = ricalcola da zero. In entrambi i casi potrai rivedere prima di salvare.</p>
            <div className="space-y-1.5 mb-4 text-sm rounded-lg p-3" style={{ background: '#f6f7f3' }}>
              <div className="flex items-center gap-2">
                {poolAuto.length ? <Check size={15} style={{ color: '#16a34a' }} /> : <AlertTriangle size={15} style={{ color: '#b91c1c' }} />}
                <span><strong>{poolAuto.length}</strong> turnisti importati{poolAuto.length ? '' : ' — importa prima il personale'}</span>
              </div>
              <div className="flex items-start gap-2">
                {dispScarse ? <AlertTriangle size={15} style={{ color: '#b45309' }} className="mt-0.5 shrink-0" /> : <Check size={15} style={{ color: '#16a34a' }} className="mt-0.5 shrink-0" />}
                <span><strong>{nVorrei}</strong> disponibilità «vorrei» per <strong>{slotTotali}</strong> posti{dispScarse && <span style={{ color: '#b45309' }}> — poche: riempirò il resto con chi è libero</span>}</span>
              </div>
              <div className="flex items-center gap-2">
                {regolePresenti ? <Check size={15} style={{ color: '#16a34a' }} /> : <span style={{ color: '#94a3b8', fontWeight: 700, width: 15, textAlign: 'center', fontSize: 14 }}>–</span>}
                <span style={regolePresenti ? undefined : { color: '#64748b' }}>Regole {regolePresenti ? 'definite (turni fissi rispettati)' : 'non definite (ok, procedo lo stesso)'}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAuto(false)} className="btn-secondary text-sm py-1.5 px-3">Annulla</button>
              <button onClick={() => { setShowAuto(false); eseguiAuto(true) }} disabled={!poolAuto.length} className="btn-secondary text-sm py-1.5 px-3" style={{ borderColor: '#c4b5fd', color: '#6d28d9' }}>Aggiungi ai turni</button>
              <button onClick={() => { setShowAuto(false); eseguiAuto(false) }} disabled={!poolAuto.length} className="btn-primary text-sm py-1.5 px-4" style={{ background: '#6d28d9' }}>Sostituisci tutto</button>
            </div>
          </div>
        </div>
      )}

      {/* Indicatore: assegnazione automatica in corso (animazione) */}
      {autoAnim && (
        <div className="fixed inset-x-0 z-50 flex justify-center pointer-events-none" style={{ top: 64 }}>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl shadow-2xl" style={{ background: '#ede9fe', color: '#6d28d9', border: '1px solid #c4b5fd', animation: 'fadeSlideIn 180ms ease-out' }}>
            <Wand2 size={16} className="animate-pulse" /> <span className="text-sm font-semibold">Assegnazione in corso…</span>
          </div>
        </div>
      )}

      {autoRes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(28,40,24,0.5)' }} onClick={() => setAutoRes(null)}>
          <div className="card w-full max-w-md p-5" style={{ animation: 'fadeSlideIn 160ms ease-out' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2"><Wand2 size={18} style={{ color: '#6d28d9' }} /><h3 className="text-base font-bold" style={{ color: '#2b3c24' }}>Assegnazione calcolata</h3></div>
            <p className="text-sm text-stone-600 mb-2">
              <strong>{autoRes.coperti}</strong> turni assegnati su {autoRes.totali}
              {autoRes.totali - autoRes.coperti > 0 && <> · <strong style={{ color: '#b45309' }}>{autoRes.totali - autoRes.coperti} ancora scoperti</strong></>}.
            </p>
            <p className="text-xs text-stone-500 mb-2">di cui {autoRes.nEsistenti > 0 && <><strong>{autoRes.nEsistenti}</strong> già presenti · </>}<strong>{autoRes.nFissi}</strong> fissi · <strong>{autoRes.perDesiderata}</strong> per desiderata · <strong>{autoRes.perRiempimento}</strong> per riempimento.</p>
            {autoRes.perRiempimento > 0 && <p className="text-xs mb-2" style={{ color: '#b45309' }}>⚠ {autoRes.perRiempimento} post{autoRes.perRiempimento === 1 ? 'o' : 'i'} riempit{autoRes.perRiempimento === 1 ? 'o' : 'i'} con chi era libero: le disponibilità «vorrei» non bastavano a coprire tutto per preferenza.</p>}
            {autoRes.coperti === 0 && <p className="text-sm mb-2" style={{ color: '#b91c1c' }}>Non è stato possibile assegnare nessun turno: controlla disponibilità e indisponibilità.</p>}
            <div className="max-h-64 overflow-auto rounded-lg" style={{ border: '1px solid #eef0ea' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                <thead><tr>
                  <th style={{ background: '#f4f6f1', padding: '5px 10px', textAlign: 'left', fontSize: 11, color: '#476540', fontWeight: 700, position: 'sticky', top: 0 }}>Turnista</th>
                  <th style={{ background: '#f4f6f1', padding: '5px 10px', textAlign: 'right', fontSize: 11, color: '#476540', fontWeight: 700, position: 'sticky', top: 0 }}>Ore</th>
                  <th style={{ background: '#f4f6f1', padding: '5px 10px', textAlign: 'right', fontSize: 11, color: '#476540', fontWeight: 700, position: 'sticky', top: 0 }}>Weekend</th>
                </tr></thead>
                <tbody>
                  {autoRes.perTurnista.map(r => (
                    <tr key={r.id}>
                      <td style={{ padding: '4px 10px', borderTop: '1px solid #f0f1ec' }}>{nomeTurnista(r.id)}</td>
                      <td style={{ padding: '4px 10px', borderTop: '1px solid #f0f1ec', textAlign: 'right', fontWeight: 700, color: '#2b3c24' }}>{r.ore}h</td>
                      <td style={{ padding: '4px 10px', borderTop: '1px solid #f0f1ec', textAlign: 'right', color: '#475569' }}>{r.weekend}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-stone-500 mt-3 mb-4">Rivedi la griglia e premi <strong>Salva</strong> per confermare, oppure <strong>Annulla</strong> per scartare.</p>
            <div className="flex justify-end"><button onClick={() => setAutoRes(null)} className="btn-primary text-sm py-1.5 px-4">Ok</button></div>
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
