import { useState, useMemo, useEffect } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, CalendarHeart, CalendarCheck, ChevronLeft, ChevronRight, Moon, Sun, MapPin, Info, Phone, Check, Ban, Clock, Hand, LayoutGrid, Star, ArrowRightLeft, AlertTriangle, UserPlus2, Search, Lock } from 'lucide-react'
import { store } from '../lib/store'
import { giorniDelMese, turnoSiApplica } from '../lib/turniLogic'
import { isFestivo, isPrefestivo, isSuperfestivo, isoDate } from '../lib/holidays'
import { useFestivita } from '../hooks/useFestivita'
import { useFinalizzato } from '../hooks/useFinalizzato'
import { nomeCompleto, cmpTurnisti } from '../types'
import type { TurnoPersona, Utente } from '../types'
import { useImpaginazione } from '../hooks/useImpaginazione'
import { useMeseSelezionato } from '../hooks/useMeseSelezionato'
import { usePostazionePubblica } from '../hooks/usePostazionePubblica'
import { useRealtimePostazione } from '../hooks/useRealtime'
import { useDebug } from '../contexts/DebugContext'
import { IconaLivello } from '../components/IconaLivello'
import { SyncCalendarModal } from '../components/SyncCalendarModal'
import type { AuthUser, TurnoSchema, Turno, Turnista, TurnistaMese, Livello, MiaPostazione, Postazione, ConfigVersione, DesiderataFinestra, Desiderata, TipoDesiderata, StatoCalendario, RichiestaTurno } from '../types'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const WD = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab']
const REP = -1
const thStyle: CSSProperties = { background: 'var(--t-titolo)', color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 10px', textAlign: 'left', border: '1px solid #1f2d18' }
const tdBase: CSSProperties = { padding: '6px 10px', border: '1px solid #e5e7eb', verticalAlign: 'top' }
const itDate = (iso: string) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}` }
// Fantasma: slot con il nome congelato di un turnista cancellato (nessun id). Nel pubblico
// è una semplice etichetta di sola lettura (niente cambio turno).
const GHOST_PFX = 'ghost:'
const isGhost = (v: string | null | undefined): v is string => typeof v === 'string' && v.startsWith(GHOST_PFX)
const ghostNome = (v: string) => v.slice(GHOST_PFX.length)

function Avviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="card p-5 flex items-start gap-3" style={{ background: '#f0f4ee' }}>
      <Info size={18} className="shrink-0 mt-0.5" style={{ color: 'var(--t-accento)' }} />
      <p className="text-sm" style={{ color: '#3a4a30' }}>{children}</p>
    </div>
  )
}

export function PublicTurniPage({ user }: { user: AuthUser | null }) {
  const qc = useQueryClient()
  const oggi = new Date()
  const { anno, mese, meseKey, setMeseAnno } = useMeseSelezionato()
  const { adminMode, doppleganger } = useDebug()   // "god mode": l'admin reale bypassa i controlli di autorizzazione lato vista
  const godMode = adminMode && !doppleganger   // ⚠️ la god mode NON si applica mentre impersoni qualcuno (Doppleganger): vedi ESATTAMENTE come lui
  const oggiStr = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(oggi.getDate()).padStart(2, '0')}`
  const [tab, setTab] = useState<'turni' | 'desiderata'>('turni')
  const [syncOpen, setSyncOpen] = useState(false)   // modal "Sincronizza Calendario"

  // postazioni dell'utente
  const { data: mie = [], isLoading: loadingMie } = useQuery<MiaPostazione[]>({ queryKey: ['mie-postazioni', user?.id], queryFn: () => store.getMiePostazioni(user!.id), enabled: !!user })
  const { data: tuttePost = [] } = useQuery<Postazione[]>({ queryKey: ['postazioni'], queryFn: () => store.getPostazioni(), enabled: !!user && godMode })
  // postazione ricordata per la sessione (chiave condivisa con l'admin)
  const { postazioneId, setPostazioneId } = usePostazionePubblica()   // store condiviso con la NavBar (selettore mesi mobile)
  function scegliPostazione(id: string) { setPostazioneId(id) }
  // Popover "clicca qui" per impostare la propria preferenza nelle desiderata pubbliche
  const [desPicker, setDesPicker] = useState<{ ds: string; turnoId: string; scelta: 'desiderata' | 'indisponibilita' | undefined; x: number; y: number } | null>(null)
  // in "god mode" (admin reale) il selettore mostra TUTTE le postazioni, non solo le proprie
  const opzioni = useMemo<{ postazioneId: string; nome: string }[]>(() =>
    godMode && tuttePost.length ? tuttePost.map(p => ({ postazioneId: p.id, nome: p.nome }))
                                : mie.map(m => ({ postazioneId: m.postazioneId, nome: m.nome })), [godMode, tuttePost, mie])
  useEffect(() => { if (opzioni.length && (!postazioneId || !opzioni.some(o => o.postazioneId === postazioneId))) setPostazioneId(opzioni[0].postazioneId) }, [opzioni, postazioneId])
  const mia = mie.find(m => m.postazioneId === postazioneId) ?? null

  // dati del mese per la postazione selezionata
  const { data: versione } = useQuery<ConfigVersione | null>({ queryKey: ['versione', postazioneId, meseKey], queryFn: () => store.getVersioneMese(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: schema = [] } = useQuery<TurnoSchema[]>({ queryKey: ['schema', versione?.id], queryFn: () => store.getSchemaVersione(versione!.id), enabled: !!versione })
  const { data: personale = [] } = useQuery<Turnista[]>({ queryKey: ['turnisti', postazioneId], queryFn: () => store.getTurnisti(postazioneId!), enabled: !!postazioneId })
  const { data: statoCal = 'non_pubblicato' } = useQuery<StatoCalendario>({ queryKey: ['turni-stato', postazioneId, meseKey], queryFn: () => store.getStatoCalendario(postazioneId!, meseKey), enabled: !!postazioneId && tab === 'turni' })
  const { finalizzato } = useFinalizzato(postazioneId, meseKey)   // mese finalizzato ⇒ calendario definitivo in sola lettura (letto dal JSON)
  const pianificazione = tab === 'turni' && statoCal === 'pianificazione' && !finalizzato   // niente candidature su un mese chiuso
  // un mese finalizzato mostra COMUNQUE il calendario (letto dal JSON), anche se lo stato archiviato non fosse 'pubblicato'
  const { data: turni = [] } = useQuery<Turno[]>({ queryKey: ['turni', postazioneId, anno, mese], queryFn: () => store.getTurniMese(postazioneId!, anno, mese), enabled: !!postazioneId && tab === 'turni' && (statoCal !== 'non_pubblicato' || finalizzato) })
  const { data: finestra } = useQuery<DesiderataFinestra | null>({ queryKey: ['desiderata-finestra', postazioneId, meseKey], queryFn: () => store.getDesiderataFinestra(postazioneId!, meseKey), enabled: !!postazioneId && tab === 'desiderata' })
  const { data: desiderata = [] } = useQuery<Desiderata[]>({ queryKey: ['desiderata', postazioneId, anno, mese], queryFn: () => store.getDesiderataMese(postazioneId!, anno, mese), enabled: !!postazioneId && tab === 'desiderata' })
  const { data: personaleMese = [] } = useQuery<TurnistaMese[]>({ queryKey: ['personale-mese', postazioneId, meseKey], queryFn: () => store.getPersonaleMese(postazioneId!, meseKey), enabled: !!postazioneId })   // serve anche al tab Turni (cambio turno: personale autorizzato del mese)
  const { data: richieste = [] } = useQuery<RichiestaTurno[]>({ queryKey: ['richieste', postazioneId, anno, mese], queryFn: () => store.getRichiesteMese(postazioneId!, anno, mese), enabled: !!postazioneId && pianificazione })
  const { data: rangeContenuto } = useQuery<{ min: string | null; max: string | null }>({ queryKey: ['mesi-contenuto', postazioneId], queryFn: () => store.getMesiConContenuto(postazioneId!), enabled: !!postazioneId })

  // ── Tempo reale: le modifiche del responsabile (calendario pubblicato, turni
  //    riempiti, candidature, desiderata pubbliche) si vedono senza ricaricare ──
  useRealtimePostazione(postazioneId, [
    { tabella: 'turni',               invalida: [['turni', postazioneId]] },
    { tabella: 'turni_stato',         invalida: [['turni-stato', postazioneId]] },
    { tabella: 'richieste_turno',     invalida: [['richieste', postazioneId]] },
    { tabella: 'desiderata',          invalida: [['desiderata', postazioneId]] },
    { tabella: 'desiderata_finestra', invalida: [['desiderata-finestra', postazioneId]] },
    { tabella: 'turnisti_mese',       invalida: [['personale-mese', postazioneId]] },
  ])

  const { fogliConTurni, impaginazioneOk } = useImpaginazione(postazioneId, meseKey, schema)
  const { festivoSet, superSet } = useFestivita(postazioneId)   // festivi locali + superfestivi
  // turni SPECIFICI marcati come superfestivo: la stellina va SOLO su questi, non su tutti i turni del giorno
  const { data: superTurni = [] } = useQuery<{ data: string; turnoSchemaId: string }[]>({ queryKey: ['superfestivo-turni', postazioneId, meseKey], queryFn: () => store.getSuperfestivoTurni(postazioneId!, meseKey), enabled: !!postazioneId })
  const superTurniByData = useMemo(() => { const m = new Map<string, string[]>(); superTurni.forEach(t => { const a = m.get(t.data); if (a) a.push(t.turnoSchemaId); else m.set(t.data, [t.turnoSchemaId]) }); return m }, [superTurni])

  const nomeById = useMemo(() => new Map(personale.map(p => [p.id, nomeCompleto(p)])), [personale])
  const giorni = useMemo(() => giorniDelMese(anno, mese), [anno, mese])
  // Una griglia per foglio (passo ③ Impaginazione): righe = (giorno, turno) di quel foglio
  const righePerFoglio = useMemo(() => fogliConTurni.map(fc => {
    const out: { ds: string; d: Date; turno: TurnoSchema }[] = []
    giorni.forEach(d => fc.turni.forEach(c => { if (turnoSiApplica(c, d, festivoSet)) out.push({ ds: isoDate(d), d, turno: c }) }))
    return { foglio: fc.foglio, righe: out }
  }), [fogliConTurni, giorni, festivoSet])

  // calendario: assegnazioni
  const assegn = useMemo(() => {
    const m = new Map<string, string[]>(), rep = new Map<string, string>()
    turni.forEach(t => { const val = t.turnista_id ?? (t.nome_congelato ? `${GHOST_PFX}${t.nome_congelato}` : null); if (!val) return; const k = `${t.data}|${t.turno_schema_id}`; if (t.slot === REP) rep.set(k, val); else { const a = m.get(k) ?? []; a.push(val); m.set(k, a) } })
    return { m, rep }
  }, [turni])
  const hasRep = assegn.rep.size > 0   // mostra la colonna Reperibile solo se ce n'è almeno uno
  // pianificazione: posti ancora scoperti (badge ???) nel calendario pubblicato
  const turniVacanti = useMemo(() => {
    let v = 0
    righePerFoglio.forEach(({ righe }) => righe.forEach(({ ds, turno }) => { v += Math.max(0, turno.n_turnisti - (assegn.m.get(`${ds}|${turno.id}`)?.length ?? 0)) }))
    return v
  }, [righePerFoglio, assegn])

  // desiderata: la MIA preferenza per turno
  const miaPref = useMemo(() => {
    const m = new Map<string, TipoDesiderata>()
    desiderata.filter(d => d.turnista_id === mia?.membershipId).forEach(d => m.set(`${d.data}|${d.turno_schema_id}`, d.tipo))
    return m
  }, [desiderata, mia])

  // ── CAMBI TURNO: click sul nome → tooltip «Chiedi cambio?» → procedura guidata ──
  //  Ognuno può cedere SOLO i propri turni; admin e supervisori possono avviare il
  //  cambio per chiunque (il server verifica comunque i permessi per postazione).
  const puoGestireCambi = user?.livello === 'admin' || !!user?.isSupervisore
  const cambiAttivi = statoCal !== 'non_pubblicato' && !finalizzato
  const [tipCambio, setTipCambio] = useState<{ x: number; y: number; ds: string; turno: TurnoSchema; slot: number; da: string } | null>(null)
  const [wizCambio, setWizCambio] = useState<{ ds: string; turno: TurnoSchema; slot: number; da: string } | null>(null)
  function clickTurnista(e: ReactMouseEvent, ds: string, turno: TurnoSchema, id: string, slotRep?: number) {
    if (!cambiAttivi) return
    if (id !== mia?.membershipId && !puoGestireCambi) return
    const slot = slotRep ?? turni.find(t => t.data === ds && t.turno_schema_id === turno.id && t.turnista_id === id && t.slot >= 0)?.slot
    if (slot === undefined) return
    setTipCambio({ x: e.clientX, y: e.clientY, ds, turno, slot, da: id })
  }
  function cambioFatto() {
    qc.invalidateQueries({ queryKey: ['turni', postazioneId] })
    qc.invalidateQueries({ queryKey: ['turnisti', postazioneId] })
    qc.invalidateQueries({ queryKey: ['personale-mese', postazioneId] })
  }

  // pianificazione: i turni per cui IO ho già inviato una richiesta di candidatura
  const mieRichieste = useMemo(() => {
    const s = new Set<string>()
    richieste.filter(r => r.turnista_id === mia?.membershipId).forEach(r => s.add(`${r.data}|${r.turno_schema_id}`))
    return s
  }, [richieste, mia])

  // desiderata pubbliche: scelta di OGNI turnista per (giorno|turno|turnista) + colonne ordinate
  const desByKey = useMemo(() => {
    const m = new Map<string, TipoDesiderata>()
    desiderata.forEach(d => m.set(`${d.data}|${d.turno_schema_id}|${d.turnista_id}`, d.tipo))
    return m
  }, [desiderata])
  // colonne della matrice = solo i turnisti IMPORTATI per il mese (non tutta la postazione)
  const importatiMese = useMemo(() => new Set(personaleMese.map(p => p.turnista_id)), [personaleMese])
  const ruoloMese = useMemo(() => new Map(personaleMese.map(p => [p.turnista_id, p.livello] as const)), [personaleMese])
  const livGlob = useMemo(() => new Map(personale.map(p => [p.id, p.livello])), [personale])
  const livMese = (id: string): Livello => ruoloMese.get(id) ?? livGlob.get(id) ?? 'turnista'
  // un turnista può esprimere desiderata SOLO se è nel personale del mese
  const sonoImportato = !!mia && importatiMese.has(mia.membershipId)
  // colonne = personale del mese con ruolo-del-mese turnista/responsabile (gli esterni-del-mese non compaiono)
  const colonne = useMemo(() => personale.filter(t => importatiMese.has(t.id) && livMese(t.id) !== 'esterno').sort(cmpTurnisti), [personale, importatiMese, ruoloMese])   // eslint-disable-line react-hooks/exhaustive-deps
  // responsabili della postazione (mostrati nel div postazione)
  const responsabili = useMemo(() => personale.filter(t => t.livello === 'responsabile').sort(cmpTurnisti), [personale])

  async function setPref(ds: string, turnoId: string, tipo: TipoDesiderata | null) {
    if (!mia) return
    if (finalizzato) return   // mese finalizzato: desiderata in sola lettura
    if (!sonoImportato && !godMode) return   // non importato per il mese: non può esprimere desiderata
    await store.setDesiderata(postazioneId!, ds, turnoId, mia.membershipId, tipo)
    await qc.invalidateQueries({ queryKey: ['desiderata', postazioneId, anno, mese] })
  }

  // pianificazione: candidatura su un posto scoperto (badge ???)
  const [proposta, setProposta] = useState<{ ds: string; turno: TurnoSchema } | null>(null)
  const [inviando, setInviando] = useState(false)
  async function confermaProposta() {
    if (!proposta || !mia) return
    if (finalizzato) { setProposta(null); return }   // mese finalizzato: niente candidature
    setInviando(true)
    try {
      await store.addRichiesta(postazioneId!, proposta.ds, proposta.turno.id, mia.membershipId)
      store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'candidatura', messaggio: `${(user && nomeCompleto(user)) || 'Un turnista'} si è candidato per ${proposta.turno.nome || 'un turno'} del ${itDate(proposta.ds)}`, target: '/admin/turni', perAdmin: true, autore: (user && nomeCompleto(user)) || null }).catch(() => {})
      await qc.invalidateQueries({ queryKey: ['richieste', postazioneId, anno, mese] })
      setProposta(null)
    } catch (e) { console.error('[Turni] invio richiesta fallito:', e); setAnnullaMsg('Errore nell\'invio della richiesta. Riprova.') }
    finally { setInviando(false) }
  }

  // pianificazione: annullamento della propria candidatura (clic sul badge giallo)
  const [annulla, setAnnulla] = useState<{ ds: string; turno: TurnoSchema } | null>(null)
  const [annullaMsg, setAnnullaMsg] = useState<string | null>(null)
  const [annullando, setAnnullando] = useState(false)
  async function annullaProposta() {
    if (!annulla || !mia) return
    setAnnullando(true)
    try {
      const cur = await store.getRichiestaCorrente(postazioneId!, annulla.ds, annulla.turno.id, mia.membershipId)
      if (!cur || cur.stato === 'in_attesa') {
        // ancora in attesa (o già sparita): la ritiro, il responsabile non la vedrà
        if (cur) {
          await store.removeRichiesta(cur.id)
          store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'candidatura_ritirata', messaggio: `${(user && nomeCompleto(user)) || 'Un turnista'} ha ritirato la candidatura per ${annulla.turno.nome || 'un turno'} del ${itDate(annulla.ds)}`, target: '/admin/turni', perAdmin: true, autore: (user && nomeCompleto(user)) || null }).catch(() => {})
        }
        await qc.invalidateQueries({ queryKey: ['richieste', postazioneId, anno, mese] })
        setAnnulla(null)
      } else if (cur.stato === 'approvata') {
        setAnnulla(null)
        setAnnullaMsg('La tua proposta è stata appena APPROVATA. Per annullarla ora devi contattare il tuo responsabile.')
      } else {
        // rifiutata prima della richiesta di annullamento: niente da fare
        await qc.invalidateQueries({ queryKey: ['richieste', postazioneId, anno, mese] })
        setAnnulla(null)
        setAnnullaMsg('La tua proposta era già stata RIFIUTATA, prima della tua richiesta di annullamento: non c\'è nulla da annullare.')
      }
    } catch (e) { console.error('[Turni] annullamento fallito:', e); setAnnullaMsg('Errore durante l\'annullamento. Riprova.') }
    finally { setAnnullando(false) }
  }

  // limita la navigazione all'intervallo di mesi con qualcosa da vedere (calendario o
  // desiderata pubblicati), includendo sempre il mese corrente
  const meseCorrente = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}`
  const rangeMin = rangeContenuto?.min && rangeContenuto.min < meseCorrente ? rangeContenuto.min : meseCorrente
  const rangeMax = rangeContenuto?.max && rangeContenuto.max > meseCorrente ? rangeContenuto.max : meseCorrente
  const canPrev = meseKey > rangeMin
  const canNext = meseKey < rangeMax
  function cambiaMese(delta: number) {
    if (delta < 0 ? !canPrev : !canNext) return
    let m = mese + delta, a = anno
    if (m < 1) { m = 12; a-- } else if (m > 12) { m = 1; a++ }
    setMeseAnno(a, m)
  }

  // stato finestra desiderata
  const fin = finestra
  const desStato: 'aperta' | 'programmata' | 'chiusa' | 'assente' =
    !fin?.aperta_a ? 'assente'
    : fin.aperta_da && oggiStr < fin.aperta_da ? 'programmata'
    : fin.aperta_a < oggiStr ? 'chiusa'
    : 'aperta'
  const pubblicheMode = !!fin?.pubbliche            // desiderata visibili a tutti (vista a colonne)
  const desEditabile = desStato === 'aperta' && (sonoImportato || godMode)   // solo a raccolta aperta e se importato per il mese
  // avviso evidente SOPRA il calendario desiderata (in qualunque forma): fino a quando è attivo
  const avvisoChiusura = desEditabile && fin?.aperta_a ? (
    <div className="card p-3 flex items-start gap-2" style={{ background: '#fef3c7', border: '1px solid #fbbf24' }}>
      <Clock size={16} className="shrink-0 mt-0.5" style={{ color: '#b45309' }} />
      <p className="text-sm" style={{ color: '#78350f' }}>Calendario desiderata attivo <strong>fino al {itDate(fin.aperta_a)}</strong>: dopo questa data <strong>non sarà più visibile</strong> e non potrà più essere modificato. Compila entro tale giorno.</p>
    </div>
  ) : null

  const turniConfigurati = !!versione && schema.length > 0 && impaginazioneOk

  const MeseNav = (
    // Su cellulare il navigatore mesi è nella barra in alto (centrato): qui lo mostriamo solo da ≥sm.
    <div className="hidden sm:flex items-center gap-2">
      <button onClick={() => cambiaMese(-1)} disabled={!canPrev} className="btn-secondary px-2 py-1" style={{ opacity: canPrev ? 1 : 0.35, cursor: canPrev ? 'pointer' : 'not-allowed' }} title={canPrev ? 'Mese precedente' : 'Niente da vedere prima'}><ChevronLeft size={16} /></button>
      <span className="font-bold text-lg text-center" style={{ color: 'var(--t-testo)', minWidth: 140 }}>{MESI[mese - 1]} {anno}</span>
      <button onClick={() => cambiaMese(1)} disabled={!canNext} className="btn-secondary px-2 py-1" style={{ opacity: canNext ? 1 : 0.35, cursor: canNext ? 'pointer' : 'not-allowed' }} title={canNext ? 'Mese successivo' : 'Niente da vedere dopo'}><ChevronRight size={16} /></button>
    </div>
  )

  return (
    <div className="max-w-screen-2xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarDays size={22} style={{ color: 'var(--t-accento)' }} />
        <h1 className="text-2xl font-bold" style={{ color: 'var(--t-titolo)' }}>I miei turni</h1>
      </div>

      {opzioni.length === 0 ? (
        <Avviso>{loadingMie ? 'Caricamento…' : 'Non sei ancora inserito nel personale di nessuna postazione. Chiedi al responsabile di aggiungerti.'}</Avviso>
      ) : (
        <>
          {/* Selettore postazione */}
          <div className="card p-3 flex items-center gap-2 flex-wrap">
            <MapPin size={16} style={{ color: 'var(--t-accento)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--t-titolo)' }}>Postazione:</span>
            {opzioni.length > 1 ? (
              <select value={postazioneId ?? ''} onChange={e => scegliPostazione(e.target.value)} className="input text-sm w-auto">
                {opzioni.map(o => <option key={o.postazioneId} value={o.postazioneId}>{o.nome}</option>)}
              </select>
            ) : <span className="text-sm" style={{ color: 'var(--t-testo)' }}>{opzioni[0].nome}</span>}
            {mia && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--t-tenue)', color: 'var(--t-accento)' }}>sei {sonoImportato ? livMese(mia.membershipId) : mia.livello}</span>}

            {/* Responsabile/i della postazione (allineati a destra) */}
            <div className="flex items-center gap-1.5 ml-auto">
              <IconaLivello livello="responsabile" size={15} color="var(--t-accento)" />
              <span className="text-sm font-semibold" style={{ color: 'var(--t-titolo)' }}>Responsabile/i:</span>
              {responsabili.length > 0 ? (
                <select className="input text-sm w-auto" defaultValue={responsabili[0].id} title="Responsabili della postazione">
                  {responsabili.map(r => <option key={r.id} value={r.id}>{nomeCompleto(r)}</option>)}
                </select>
              ) : <span className="text-sm text-stone-500">nessuno</span>}
            </div>
          </div>

          {/* Schede */}
          <div className="flex gap-2">
            {([['turni', 'Calendario Turni', CalendarDays], ['desiderata', 'Desiderata - Indisponibilità', CalendarHeart]] as const).map(([key, label, Icon]) => (
              <button key={key} onClick={() => setTab(key)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
                style={tab === key ? { background: 'var(--t-primario)', color: '#fff' } : { background: 'var(--t-tenue)', color: 'var(--t-accento)' }}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>

          {/* Navigatore mese + banner "mese chiuso" (finalizzato) + Sincronizza Calendario */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {finalizzato ? (
              <div className="flex items-center gap-1.5 rounded-lg px-3 py-1.5" style={{ background: '#fef9c3', border: '1px solid #fde047' }}>
                <Lock size={14} className="shrink-0" style={{ color: '#a16207' }} />
                <span className="text-sm font-semibold" style={{ color: '#713f12' }}>Mese chiuso: calendario definitivo, sola lettura</span>
              </div>
            ) : <span />}
            <div className="flex items-center gap-2 flex-wrap">
              {tab === 'turni' && (statoCal !== 'non_pubblicato' || finalizzato) && mia && (
                <button onClick={() => setSyncOpen(true)}
                  className="btn-secondary px-3 py-1.5 text-sm flex items-center gap-1.5"
                  title="Sincronizza i tuoi turni di questo mese con il tuo Google Calendar">
                  <CalendarCheck size={15} /> Sincronizza Calendario
                </button>
              )}
              {MeseNav}
            </div>
          </div>

          {/* ───── CALENDARIO TURNI ───── */}
          {tab === 'turni' && (
            statoCal === 'non_pubblicato' && !finalizzato ? (
              <Avviso>Il <strong>calendario turni</strong> di {MESI[mese - 1]} {anno} non è ancora stato pubblicato per questa postazione.</Avviso>
            ) : !turniConfigurati ? (
              <Avviso>Non ci sono turni configurati per {MESI[mese - 1]} {anno}.</Avviso>
            ) : (
              <>
                {pianificazione && (
                  <div className="card p-3 flex items-start gap-2" style={{ background: '#fef2f2' }}>
                    <Info size={16} className="shrink-0 mt-0.5" style={{ color: '#b91c1c' }} />
                    <p className="text-sm" style={{ color: '#7f1d1d' }}>Calendario in costruzione: dove vedi <strong>???</strong> manca un turnista. Cliccaci sopra per <strong>candidarti</strong>; il responsabile approverà o rifiuterà la richiesta. <strong>{turniVacanti === 0 ? 'Al momento non è rimasto nessun turno vacante.' : turniVacanti === 1 ? 'Al momento è rimasto 1 turno vacante.' : `Al momento sono rimasti ${turniVacanti} turni vacanti.`}</strong></p>
                  </div>
                )}
                {righePerFoglio.map(({ foglio, righe: righeF }) => (
                <div key={foglio.id} className="card overflow-auto w-fit max-w-full mx-auto pub-cal-card">
                  <div className="px-3 py-2 flex items-center justify-center gap-2" style={{ borderBottom: '1px solid var(--t-riga)' }}>
                    <LayoutGrid size={14} style={{ color: 'var(--t-accento)' }} />
                    <h3 className="text-sm font-bold uppercase text-center" style={{ color: 'var(--t-titolo)' }}>{foglio.nome} - Turni del mese di {MESI[mese - 1]} {anno}</h3>
                  </div>
                  {/* Desktop: card a larghezza-contenuto (w-fit), celle nowrap → nomi interi su una riga.
                      Mobile (≤640px, classi pub-cal-*): card a piena larghezza e nomi lunghi a capo, così
                      tutte le info stanno nello schermo del cellulare SENZA scroll orizzontale, mai troncate. */}
                  <table className="pub-cal-table" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr><th style={{ ...thStyle, whiteSpace: 'nowrap', textAlign: 'center' }} title="Giorno"><CalendarDays size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /></th><th style={{ ...thStyle, whiteSpace: 'nowrap' }}>Turno</th><th style={{ ...thStyle, whiteSpace: 'nowrap' }}>Turnisti</th>{hasRep && <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>Reperibile</th>}</tr></thead>
                    <tbody>
                      {righeF.map(({ ds, d, turno }) => {
                        const fest = isFestivo(d, festivoSet), pref = isPrefestivo(d, festivoSet)
                        const superF = isSuperfestivo(d, superSet) && !!superTurniByData.get(ds)?.includes(turno.id)
                        const dayColor = fest ? '#b91c1c' : pref ? '#b45309' : 'var(--t-titolo)'
                        const rowBg = fest ? '#fdecea' : pref ? '#fff5e6' : '#fff'
                        const overnight = turno.ora_fine <= turno.ora_inizio
                        const k = `${ds}|${turno.id}`
                        const ids = assegn.m.get(k) ?? []
                        const rep = assegn.rep.get(k)
                        const mancano = Math.max(0, turno.n_turnisti - ids.length)
                        const hoChiesto = mieRichieste.has(k)
                        return (
                          <tr key={k} style={{ background: rowBg }}>
                            <td className="pt-giorno" style={{ ...tdBase, whiteSpace: 'nowrap', textAlign: 'center' }}><div style={{ fontWeight: 700, color: dayColor, lineHeight: 1.1 }}><span style={{ fontSize: 15, display: 'block' }}>{d.getDate()}</span><span style={{ fontSize: 10, display: 'block', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{WD[d.getDay()]}</span></div>{superF && <Star size={11} fill="#facc15" style={{ color: '#ca8a04', display: 'block', margin: '2px auto 0' }} />}</td>
                            <td className="pt-turno" style={{ ...tdBase, whiteSpace: 'nowrap' }}>
                              <span className="inline-flex items-center gap-1" style={{ color: '#475569', fontSize: 14 }}>{overnight ? <Moon size={13} style={{ color: '#64748b' }} /> : <Sun size={13} style={{ color: '#f59e0b' }} />}{turno.nome || 'Turno'}</span>
                              <div style={{ fontSize: 10, color: '#94a3b8' }}>{turno.ora_inizio}–{turno.ora_fine}</div>
                            </td>
                            <td className="pt-turnisti" style={{ ...tdBase, whiteSpace: 'nowrap' }}>
                              <div className="flex gap-1.5 items-center flex-wrap">
                                {ids.length === 0 && !(pianificazione && mancano > 0) && <span className="text-[11px] text-stone-300 italic">—</span>}
                                {ids.map((id, idx) => {
                                  if (isGhost(id)) return <span key={`${id}|${idx}`} className="rounded px-2 py-0.5 text-[12px] font-medium whitespace-nowrap" style={{ background: '#eceae7', color: '#78716c', border: '1px dashed #b8b2a8', fontStyle: 'italic' }} title="Turnista non più in anagrafica">{ghostNome(id)}</span>
                                  const io = id === mia?.membershipId
                                  const stile = io ? { background: '#2e7d32', color: '#fff' } : { background: 'var(--t-tenue)', color: 'var(--t-testo)' }
                                  const cliccabile = cambiAttivi && (io || puoGestireCambi)
                                  return cliccabile
                                    ? <button key={`${id}|${idx}`} onClick={e => clickTurnista(e, ds, turno, id)} title="Chiedi il cambio di questo turno"
                                        className="rounded px-2 py-0.5 text-[12px] font-medium whitespace-nowrap transition-transform hover:scale-105"
                                        style={{ ...stile, cursor: 'pointer', border: io ? '1px solid #1b5e20' : '1px solid rgba(0,0,0,0.08)' }}>{nomeById.get(id) ?? '—'}{io && ' (tu)'}</button>
                                    : <span key={`${id}|${idx}`} className="rounded px-2 py-0.5 text-[12px] font-medium whitespace-nowrap" style={stile}>{nomeById.get(id) ?? '—'}{io && ' (tu)'}</span>
                                })}
                                {pianificazione && mancano > 0 && (hoChiesto ? (
                                  <button onClick={() => setAnnulla({ ds, turno })} title="Proposta inviata — clicca per annullarla" className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold transition-transform hover:scale-105" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', cursor: 'pointer' }}><Clock size={10} /> Proposta inviata</button>
                                ) : (
                                  Array.from({ length: mancano }).map((_, i) => (
                                    <button key={'q' + i} onClick={() => setProposta({ ds, turno })} title="Posto scoperto — clicca per candidarti"
                                      className="rounded px-2 py-0.5 text-[11px] font-bold transition-transform hover:scale-105"
                                      style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', cursor: 'pointer' }}>???</button>
                                  ))
                                ))}
                              </div>
                            </td>
                            {hasRep && (
                              <td className="pt-rep" style={{ ...tdBase, whiteSpace: 'nowrap' }}>
                                {rep
                                  ? (isGhost(rep)
                                    ? <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[12px] font-medium whitespace-nowrap" style={{ background: '#eceae7', color: '#78716c', border: '1px dashed #b8b2a8', fontStyle: 'italic' }} title="Turnista non più in anagrafica"><Phone size={10} /> {ghostNome(rep)}</span>
                                    : cambiAttivi && (rep === mia?.membershipId || puoGestireCambi)
                                    ? <button onClick={e => clickTurnista(e, ds, turno, rep, REP)} title="Chiedi il cambio di questa reperibilità"
                                        className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[12px] font-medium whitespace-nowrap transition-transform hover:scale-105"
                                        style={rep === mia?.membershipId ? { background: '#b45309', color: '#fff', cursor: 'pointer' } : { background: '#fff5e6', color: '#92400e', cursor: 'pointer' }}><Phone size={10} /> {nomeById.get(rep) ?? '—'}{rep === mia?.membershipId && ' (tu)'}</button>
                                    : <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[12px] font-medium whitespace-nowrap" style={rep === mia?.membershipId ? { background: '#b45309', color: '#fff' } : { background: '#fff5e6', color: '#92400e' }} title="Reperibile"><Phone size={10} /> {nomeById.get(rep) ?? '—'}{rep === mia?.membershipId && ' (tu)'}</span>)
                                  : <span className="text-[11px] text-stone-300 italic">—</span>}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                ))}
              </>
            )
          )}

          {/* ───── DESIDERATA ───── */}
          {tab === 'desiderata' && (
            mia && livMese(mia.membershipId) === 'esterno' && !godMode ? (
              <Avviso>Come <strong>esterno</strong> non puoi accedere alle desiderata/indisponibilità. Puoi però vedere il <strong>Calendario Turni</strong> e candidarti ai turni scoperti.</Avviso>
            ) : desStato === 'assente' ? (
              <Avviso>La raccolta <strong>desiderata / indisponibilità</strong> di {MESI[mese - 1]} {anno} non è ancora stata pubblicata.</Avviso>
            ) : desStato === 'programmata' ? (
              <Avviso>La raccolta desiderata di {MESI[mese - 1]} {anno} aprirà il <strong>{itDate(fin!.aperta_da!)}</strong>.</Avviso>
            ) : !versione || schema.length === 0 || !impaginazioneOk ? (
              <Avviso>Non ci sono turni configurati per {MESI[mese - 1]} {anno}.</Avviso>
            ) : (!sonoImportato && !godMode) ? (
              <Avviso>Non risulti tra i turnisti di <strong>{MESI[mese - 1]} {anno}</strong>: per questo mese non puoi esprimere desiderata / indisponibilità. Se pensi sia un errore, contatta il tuo responsabile.</Avviso>
            ) : (pubblicheMode || godMode) ? (
              /* ── DESIDERATA PUBBLICHE (o god mode admin): una colonna per turnista, modifichi la tua ── */
              <>
                {avvisoChiusura}
                <p className="text-xs text-stone-500">
                  {desEditabile
                    ? <>Scegli nella <strong>tua</strong> colonna; vedi anche le scelte degli altri. Raccolta aperta fino al {itDate(fin!.aperta_a!)}.</>
                    : <>Raccolta chiusa{fin?.aperta_a ? ` il ${itDate(fin.aperta_a)}` : ''} — sola lettura.</>}
                </p>
                {righePerFoglio.map(({ foglio, righe: righeF }) => (
                <div key={foglio.id} className={`card overflow-auto max-w-full mx-auto ${colonne.length <= 3 ? 'w-full sm:w-fit' : 'w-fit'}`}>
                  <div className="px-3 py-2 flex items-center justify-center gap-2" style={{ borderBottom: '1px solid var(--t-riga)' }}>
                    <LayoutGrid size={14} style={{ color: 'var(--t-accento)' }} />
                    <h3 className="text-sm font-bold uppercase text-center" style={{ color: 'var(--t-titolo)' }}>{foglio.nome} - Turni del mese di {MESI[mese - 1]} {anno}</h3>
                  </div>
                  {/* Cellulare: ≤3 turnisti → matrice a piena larghezza (niente scroll); >3 → scroll SOLO qui dentro (card overflow-auto). */}
                  <table className={`pub-cal-matrix ${colonne.length <= 3 ? 'pub-matrix-fit' : ''}`} style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th className="pt-gt" style={{ ...thStyle, position: 'sticky', left: 0, zIndex: 3, whiteSpace: 'nowrap' }}>Giorno · Turno</th>
                        {colonne.map(t => {
                          const io = t.id === mia?.membershipId
                          return <th key={t.id} className="pt-matrix-col" style={{ ...thStyle, textAlign: 'center', minWidth: 92, background: io ? '#15803d' : 'var(--t-titolo)' }}>{nomeCompleto(t)}{io ? ' (tu)' : ''}</th>
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {righeF.map(({ ds, d, turno }) => {
                        const fest = isFestivo(d, festivoSet), pref = isPrefestivo(d, festivoSet)
                        const superF = isSuperfestivo(d, superSet) && !!superTurniByData.get(ds)?.includes(turno.id)
                        const dayColor = fest ? '#b91c1c' : pref ? '#b45309' : 'var(--t-titolo)'
                        const overnight = turno.ora_fine <= turno.ora_inizio
                        // Copertura del turno: quanti hanno espresso "Vorrei" (X) sul numero di turnisti previsti (Y).
                        // Nelle DESIDERATA lo sfondo riga NON segue festivi/prefestivi (basta il colore del giorno):
                        // bianco se X<Y (scoperto), verde se X=Y (giusto), giallo se X>Y (in eccesso).
                        const nVogliono = colonne.reduce((n, t) => n + (desByKey.get(`${ds}|${turno.id}|${t.id}`) === 'desiderata' ? 1 : 0), 0)
                        const richiesti = turno.n_turnisti
                        const rowBg = nVogliono < richiesti ? '#ffffff' : nVogliono === richiesti ? '#dcfce7' : '#fef9c3'
                        const contColor = nVogliono < richiesti ? '#94a3b8' : nVogliono === richiesti ? '#166534' : '#a16207'
                        return (
                          <tr key={`${ds}|${turno.id}`} style={{ background: rowBg }}>
                            <td className="pt-gt" style={{ ...tdBase, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: rowBg, zIndex: 1 }}>
                              <div className="flex items-center gap-1.5">
                                <span style={{ fontWeight: 700, color: dayColor }}>{d.getDate()} {WD[d.getDay()]}</span>{superF && <Star size={11} fill="#facc15" style={{ color: '#ca8a04' }} />}
                                <span className="inline-flex items-center gap-1" style={{ color: '#475569' }}>{overnight ? <Moon size={12} style={{ color: '#64748b' }} /> : <Sun size={12} style={{ color: '#f59e0b' }} />}{turno.nome || 'Turno'}</span>
                              </div>
                              {/* orario a sinistra, contatore X/Y allineato a destra */}
                              <div className="flex items-center justify-between gap-3" style={{ fontSize: 10 }}>
                                <span style={{ color: '#94a3b8' }}>{turno.ora_inizio}–{turno.ora_fine}</span>
                                <span className="font-bold tabular-nums" style={{ color: contColor }} title={`${nVogliono} vorrebbero questo turno su ${richiesti} previsti`}>{nVogliono}/{richiesti}</span>
                              </div>
                            </td>
                            {colonne.map(t => {
                              const io = t.id === mia?.membershipId
                              const scelta = desByKey.get(`${ds}|${turno.id}|${t.id}`)
                              return (
                                <td key={t.id} className="pt-matrix-col" style={{ ...tdBase, textAlign: 'center', background: io ? 'rgba(22,163,74,0.06)' : undefined }}>
                                  {io && desEditabile ? (
                                    <button onClick={e => setDesPicker({ ds, turnoId: turno.id, scelta, x: e.clientX, y: e.clientY })} title="Imposta la tua preferenza"
                                      className="inline-flex items-center justify-center rounded-md border transition-colors"
                                      style={{ minWidth: 52, minHeight: 28, ...(scelta === 'desiderata' ? { background: '#16a34a', color: '#fff', borderColor: '#15803d' } : scelta === 'indisponibilita' ? { background: '#dc2626', color: '#fff', borderColor: '#b91c1c' } : { background: '#fff', color: 'var(--t-accento)', borderColor: 'var(--t-riga)' }) }}>
                                      {scelta === 'desiderata' ? <Check size={14} /> : scelta === 'indisponibilita' ? <Ban size={14} /> : <span className="text-[10px] font-semibold underline decoration-dotted">clicca qui</span>}
                                    </button>
                                  ) : scelta === 'desiderata' ? (
                                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full" style={{ background: '#dcfce7', color: '#166534' }} title="Vorrei"><Check size={13} /></span>
                                  ) : scelta === 'indisponibilita' ? (
                                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full" style={{ background: '#fee2e2', color: '#b91c1c' }} title="Non posso"><Ban size={13} /></span>
                                  ) : <span className="text-stone-300">·</span>}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: 'var(--t-tenue)', borderTop: '2px solid #cdd8c4' }}>
                        <td className="pt-gt" style={{ ...tdBase, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--t-tenue)', zIndex: 1, fontWeight: 700, color: 'var(--t-titolo)' }}>
                          <span className="inline-flex items-center gap-1"><Check size={12} style={{ color: '#16a34a' }} /> Disponibilità</span>
                        </td>
                        {colonne.map(t => {
                          const tot = righeF.reduce((n, r) => n + (desByKey.get(`${r.ds}|${r.turno.id}|${t.id}`) === 'desiderata' ? 1 : 0), 0)
                          const io = t.id === mia?.membershipId
                          return (
                            <td key={t.id} className="pt-matrix-col" style={{ ...tdBase, textAlign: 'center', fontWeight: 800, fontSize: 14, background: io ? 'rgba(22,163,74,0.12)' : 'var(--t-tenue)', color: tot > 0 ? '#166534' : '#94a3b8' }} title={`${nomeCompleto(t)}: ${tot} disponibilità in questo foglio`}>{tot}</td>
                          )
                        })}
                      </tr>
                    </tfoot>
                  </table>
                </div>
                ))}
              </>
            ) : desStato === 'chiusa' ? (
              <Avviso>La raccolta desiderata di {MESI[mese - 1]} {anno} si è chiusa il <strong>{itDate(fin!.aperta_a!)}</strong>.</Avviso>
            ) : (
              <>
                {avvisoChiusura}
                <p className="text-xs text-stone-500">Per ogni turno indica se lo <strong style={{ color: '#166534' }}>vorresti</strong> o se <strong style={{ color: '#b91c1c' }}>non puoi</strong>.</p>
                {righePerFoglio.map(({ foglio, righe: righeF }) => (
                <div key={foglio.id} className="card overflow-auto w-fit max-w-full mx-auto pub-cal-card">
                  <div className="px-3 py-2 flex items-center justify-center gap-2" style={{ borderBottom: '1px solid var(--t-riga)' }}>
                    <LayoutGrid size={14} style={{ color: 'var(--t-accento)' }} />
                    <h3 className="text-sm font-bold uppercase text-center" style={{ color: 'var(--t-titolo)' }}>{foglio.nome} - Turni del mese di {MESI[mese - 1]} {anno}</h3>
                  </div>
                  <table className="pub-cal-table" style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
                    <thead><tr><th style={{ ...thStyle, textAlign: 'center' }} title="Giorno"><CalendarDays size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /></th><th style={thStyle}>Turno</th><th style={{ ...thStyle, textAlign: 'center' }}>La tua scelta</th></tr></thead>
                    <tbody>
                      {righeF.map(({ ds, d, turno }) => {
                        const fest = isFestivo(d, festivoSet), pref = isPrefestivo(d, festivoSet)
                        const superF = isSuperfestivo(d, superSet) && !!superTurniByData.get(ds)?.includes(turno.id)
                        const dayColor = fest ? '#b91c1c' : pref ? '#b45309' : 'var(--t-titolo)'
                        const rowBg = fest ? '#fdecea' : pref ? '#fff5e6' : '#fff'
                        const overnight = turno.ora_fine <= turno.ora_inizio
                        const cur = miaPref.get(`${ds}|${turno.id}`)
                        return (
                          <tr key={`${ds}|${turno.id}`} style={{ background: rowBg }}>
                            <td className="pt-giorno" style={{ ...tdBase, whiteSpace: 'nowrap', textAlign: 'center' }}><div style={{ fontWeight: 700, color: dayColor, lineHeight: 1.1 }}><span style={{ fontSize: 15, display: 'block' }}>{d.getDate()}</span><span style={{ fontSize: 10, display: 'block', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{WD[d.getDay()]}</span></div>{superF && <Star size={11} fill="#facc15" style={{ color: '#ca8a04', display: 'block', margin: '2px auto 0' }} />}</td>
                            <td className="pt-turno" style={{ ...tdBase, whiteSpace: 'nowrap' }}>
                              <span className="inline-flex items-center gap-1">{overnight ? <Moon size={12} style={{ color: '#64748b' }} /> : <Sun size={12} style={{ color: '#f59e0b' }} />}{turno.nome || 'Turno'}</span>
                              <div style={{ fontSize: 10, color: '#94a3b8' }}>{turno.ora_inizio}–{turno.ora_fine}</div>
                            </td>
                            <td className="pt-scelta" style={{ ...tdBase, textAlign: 'center' }}>
                              <div className="inline-flex gap-1.5">
                                <button onClick={() => setPref(ds, turno.id, cur === 'desiderata' ? null : 'desiderata')}
                                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold border transition-colors"
                                  style={cur === 'desiderata' ? { background: '#16a34a', color: '#fff', borderColor: '#15803d' } : { background: '#fff', color: '#166534', borderColor: '#bbf7d0' }}>
                                  <Check size={12} /> Vorrei
                                </button>
                                <button onClick={() => setPref(ds, turno.id, cur === 'indisponibilita' ? null : 'indisponibilita')}
                                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold border transition-colors"
                                  style={cur === 'indisponibilita' ? { background: '#dc2626', color: '#fff', borderColor: '#b91c1c' } : { background: '#fff', color: '#b91c1c', borderColor: '#fecaca' }}>
                                  <Ban size={12} /> Non posso
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                ))}
              </>
            )
          )}

          {/* Popover "clicca qui": scelta della preferenza (Vorrei / Non posso) nelle desiderata pubbliche */}
          {desPicker && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setDesPicker(null)} />
              <div className="fixed z-50 card p-1.5 shadow-2xl" style={{ left: Math.max(8, Math.min(desPicker.x - 90, window.innerWidth - 196)), top: Math.max(8, Math.min(desPicker.y + 6, window.innerHeight - 170)), width: 188, animation: 'fadeSlideIn 120ms ease-out' }} onClick={e => e.stopPropagation()}>
                <p className="text-[11px] font-bold text-stone-500 px-1.5 pt-0.5 pb-1.5">La tua preferenza</p>
                <button onClick={() => { setPref(desPicker.ds, desPicker.turnoId, 'desiderata'); setDesPicker(null) }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                  style={desPicker.scelta === 'desiderata' ? { background: '#16a34a', color: '#fff' } : { background: '#f0fdf4', color: '#166534' }}><Check size={15} /> Vorrei fare il turno</button>
                <button onClick={() => { setPref(desPicker.ds, desPicker.turnoId, 'indisponibilita'); setDesPicker(null) }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-semibold mt-1 transition-colors"
                  style={desPicker.scelta === 'indisponibilita' ? { background: '#dc2626', color: '#fff' } : { background: '#fef2f2', color: '#b91c1c' }}><Ban size={15} /> Non posso</button>
                {desPicker.scelta && <button onClick={() => { setPref(desPicker.ds, desPicker.turnoId, null); setDesPicker(null) }} className="w-full text-center px-2 py-1 rounded-lg text-xs text-stone-500 hover:bg-stone-100 mt-1">Rimuovi preferenza</button>}
              </div>
            </>
          )}

          {/* Modal: candidatura su un turno scoperto (Modalità Pianificazione) */}
          {proposta && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(28,40,24,0.45)' }} onClick={() => setProposta(null)}>
              <div className="card w-full max-w-sm p-5" style={{ animation: 'fadeSlideIn 160ms ease-out' }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 mb-2"><Hand size={18} style={{ color: '#b45309' }} /><h3 className="text-base font-bold" style={{ color: 'var(--t-titolo)' }}>Candidati per questo turno</h3></div>
                <p className="text-sm text-stone-600">Vuoi proporti per:</p>
                <p className="text-sm font-semibold my-1" style={{ color: '#1f2d18' }}>{itDate(proposta.ds)} · {proposta.turno.nome || 'Turno'} <span className="text-stone-500 font-normal">({proposta.turno.ora_inizio}–{proposta.turno.ora_fine})</span></p>
                <p className="text-xs text-stone-500 mt-2 mb-4">La richiesta verrà inviata al responsabile, che la approverà o la rifiuterà.</p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setProposta(null)} className="btn-secondary text-sm py-1.5 px-3">No</button>
                  <button onClick={confermaProposta} disabled={inviando} className="btn-primary text-sm py-1.5 px-4">{inviando ? 'Invio…' : 'Sì, proponimi'}</button>
                </div>
              </div>
            </div>
          )}

          {/* Modal: conferma annullamento della propria candidatura */}
          {annulla && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(28,40,24,0.45)' }} onClick={() => !annullando && setAnnulla(null)}>
              <div className="card w-full max-w-sm p-5" style={{ animation: 'fadeSlideIn 160ms ease-out' }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 mb-2"><Clock size={18} style={{ color: '#92400e' }} /><h3 className="text-base font-bold" style={{ color: 'var(--t-titolo)' }}>Annullare la proposta?</h3></div>
                <p className="text-sm font-semibold my-1" style={{ color: '#1f2d18' }}>{itDate(annulla.ds)} · {annulla.turno.nome || 'Turno'} <span className="text-stone-500 font-normal">({annulla.turno.ora_inizio}–{annulla.turno.ora_fine})</span></p>
                <p className="text-xs text-stone-500 mt-2 mb-4">Se non è ancora stata approvata o rifiutata, la tua candidatura verrà ritirata e il responsabile non la vedrà.</p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setAnnulla(null)} disabled={annullando} className="btn-secondary text-sm py-1.5 px-3">No</button>
                  <button onClick={annullaProposta} disabled={annullando} className="btn-primary text-sm py-1.5 px-4" style={{ background: '#b45309' }}>{annullando ? 'Verifico…' : 'Sì, annulla'}</button>
                </div>
              </div>
            </div>
          )}

          {/* CAMBIO TURNO: tooltip «Chiedi cambio?» sul nome cliccato */}
          {tipCambio && (
            <div className="fixed inset-0" style={{ zIndex: 45 }} onClick={() => setTipCambio(null)}>
              <button onClick={e => { e.stopPropagation(); setWizCambio({ ds: tipCambio.ds, turno: tipCambio.turno, slot: tipCambio.slot, da: tipCambio.da }); setTipCambio(null) }}
                className="fixed flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg shadow-lg transition-transform hover:scale-105"
                style={{ top: Math.max(8, Math.min(tipCambio.y + 10, window.innerHeight - 56)), left: Math.max(8, Math.min(tipCambio.x - 30, window.innerWidth - 190)), background: 'var(--t-notte)', color: '#fff', zIndex: 46, animation: 'fadeSlideIn 120ms ease-out' }}>
                <ArrowRightLeft size={14} /> Cambio turno
              </button>
            </div>
          )}

          {/* CAMBIO TURNO: procedura guidata */}
          {wizCambio && postazioneId && (
            <CambioTurnoWizard
              postazioneId={postazioneId}
              postazioneNome={opzioni.find(o => o.postazioneId === postazioneId)?.nome ?? ''}
              ds={wizCambio.ds} turno={wizCambio.turno} slot={wizCambio.slot} da={wizCambio.da}
              personale={personale} autorizzatiMese={importatiMese} livMese={livMese} nomeById={nomeById}
              onChiudi={() => setWizCambio(null)} onFatto={cambioFatto}
            />
          )}

          {/* Modal: esito annullamento (già approvata / già rifiutata) */}
          {annullaMsg && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(28,40,24,0.45)' }} onClick={() => setAnnullaMsg(null)}>
              <div className="card w-full max-w-sm p-5" style={{ animation: 'fadeSlideIn 160ms ease-out' }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 mb-2"><Info size={18} style={{ color: 'var(--t-accento)' }} /><h3 className="text-base font-bold" style={{ color: 'var(--t-titolo)' }}>Proposta</h3></div>
                <p className="text-sm text-stone-600 mb-4">{annullaMsg}</p>
                <div className="flex justify-end"><button onClick={() => setAnnullaMsg(null)} className="btn-primary text-sm py-1.5 px-4">Ok</button></div>
              </div>
            </div>
          )}

          {/* Modal: Sincronizza Calendario (turni del mese del turnista → Google Calendar) */}
          {syncOpen && mia && postazioneId && (
            <SyncCalendarModal
              turnistaId={mia.membershipId}
              mese={meseKey}
              turni={turni}
              schema={schema}
              postazioneNome={opzioni.find(o => o.postazioneId === postazioneId)?.nome ?? ''}
              postazioneId={postazioneId}
              onClose={() => setSyncOpen(false)}
            />
          )}
        </>
      )}
    </div>
  )
}

// ─── Utilità cambi turno ─────────────────────────────────────────────
function itDs(ds: string): string { const [a, m, g] = ds.split('-'); return `${g}/${m}/${a}` }
/** Turni della persona che si SOVRAPPONGONO al turno target (gestisce le notti a cavallo). */
function sovrapposti(turniPersona: TurnoPersona[], ds: string, turno: TurnoSchema): TurnoPersona[] {
  const hm = (s: string) => { const [h, mi] = s.split(':').map(Number); return h * 60 + mi }
  const range = (base: number, i: string, f: string): [number, number] => { const s = base + hm(i); let e = base + hm(f); if (e <= s) e += 1440; return [s, e] }
  const [ts, te] = range(0, turno.ora_inizio, turno.ora_fine)
  return turniPersona.filter(t => { const [s, e] = range(t.data === ds ? 0 : -1440, t.ora_inizio, t.ora_fine); return s < te && ts < e })
}

/** Procedura guidata «Chiedi cambio»: cede il turno (data, turno, slot) di `da` a un
 *  collega scelto dalla lista (turnisti poi esterni) o a un NUOVO esterno creato al volo.
 *  Controlla le sovrapposizioni d'orario del destinatario (forzabili); con il flag
 *  «cambio automaticamente approvato» delle Regole il cambio è immediato, altrimenti
 *  resta in attesa dell'approvazione del responsabile (pagina Turni del Mese). */
function CambioTurnoWizard({ postazioneId, postazioneNome, ds, turno, slot, da, personale, autorizzatiMese, livMese, nomeById, onChiudi, onFatto }: {
  postazioneId: string; postazioneNome: string; ds: string; turno: TurnoSchema; slot: number; da: string
  personale: Turnista[]; autorizzatiMese: Set<string>; livMese: (id: string) => Livello; nomeById: Map<string, string>
  onChiudi: () => void; onFatto: () => void
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [nuovo, setNuovo] = useState(false)
  const [destId, setDestId] = useState('')
  const [extra, setExtra] = useState<Turnista[]>([])
  const [nNome, setNNome] = useState(''); const [nCognome, setNCognome] = useState(''); const [nEmail, setNEmail] = useState('')
  const [cerca, setCerca] = useState(''); const [sugg, setSugg] = useState<Utente[]>([])   // ricerca anagrafica (anti-duplicati)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [conflitti, setConflitti] = useState<TurnoPersona[]>([])
  const [esito, setEsito] = useState<'auto' | 'attesa' | null>(null)

  const tutti = useMemo(() => { const m = new Map(personale.map(p => [p.id, p])); extra.forEach(p => m.set(p.id, p)); return [...m.values()] }, [personale, extra])
  // Candidati = SOLO il personale AUTORIZZATO per questo mese (turnisti_mese) + eventuali
  // aggiunti al volo. Chi non è autorizzato non compare: lo si aggiunge con «Aggiungilo».
  const candidati = useMemo(() => { const ex = new Set(extra.map(e => e.id)); return tutti.filter(p => p.id !== da && (autorizzatiMese.has(p.id) || ex.has(p.id))) }, [tutti, da, autorizzatiMese, extra])
  const gTurnisti = useMemo(() => candidati.filter(p => livMese(p.id) !== 'esterno').sort(cmpTurnisti), [candidati, livMese])
  const gEsterni = useMemo(() => candidati.filter(p => livMese(p.id) === 'esterno').sort(cmpTurnisti), [candidati, livMese])
  const dest = tutti.find(p => p.id === destId) ?? null
  const repLabel = slot < 0 ? ' (reperibilità)' : ''
  const nomeTurno = `${turno.nome || 'Turno'} ${turno.ora_inizio}–${turno.ora_fine}${repLabel}`

  // Ricerca in anagrafica (dopo il 3° carattere) per NON creare doppioni: se la persona
  // esiste già nel sistema la si riusa (stessa identità), anche se non è in questa postazione.
  useEffect(() => {
    if (!nuovo) { setSugg([]); return }
    const q = cerca.trim()
    if (q.length < 3) { setSugg([]); return }
    let vivo = true
    const t = setTimeout(async () => {
      try { const r = await store.searchUtenti(q); if (vivo) setSugg(r) } catch { if (vivo) setSugg([]) }
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
  }, [cerca, nuovo])

  // Riusa un utente già esistente in anagrafica (niente duplicati). Se è già membro di
  // questa postazione lo seleziona; altrimenti lo aggiunge come esterno riusando l'identità.
  async function pickEsistente(s: Utente) {
    const giaMembro = tutti.find(t => t.utente_id === s.id)
    if (giaMembro) { setExtra(x => [...x.filter(e => e.id !== giaMembro.id), giaMembro]); setDestId(giaMembro.id); setNuovo(false); setCerca(''); setSugg([]); return }
    setBusy(true); setErr(null)
    try {
      await store.addMembro(postazioneId, { nome: s.nome, cognome: s.cognome, email: s.email, livello: 'esterno', utenteId: s.id })
      const lista = await store.getTurnisti(postazioneId)
      const trovato = lista.find(p => p.utente_id === s.id) ?? lista.find(p => p.email.toLowerCase() === s.email.toLowerCase())
      if (trovato) { setExtra(x => [...x.filter(e => e.id !== trovato.id), trovato]); setDestId(trovato.id) }
      setNuovo(false); setCerca(''); setSugg([]); setNNome(''); setNCognome(''); setNEmail('')
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  async function creaEsterno() {
    if (!nNome.trim() || !nCognome.trim() || !nEmail.trim()) { setErr('Nome, cognome ed email sono obbligatori.'); return }
    setBusy(true); setErr(null)
    try {
      await store.addMembro(postazioneId, { nome: nNome.trim(), cognome: nCognome.trim(), email: nEmail.trim(), livello: 'esterno' })
      const lista = await store.getTurnisti(postazioneId)
      const trovato = lista.find(p => p.email.toLowerCase() === nEmail.trim().toLowerCase())
      if (trovato) { setExtra(x => [...x.filter(e => e.id !== trovato.id), trovato]); setDestId(trovato.id) }
      setNuovo(false); setNNome(''); setNCognome(''); setNEmail(''); setCerca(''); setSugg([])
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  async function invia(forza: boolean) {
    if (!dest) return
    setBusy(true); setErr(null)
    try {
      if (!forza) {
        const turniDest = await store.getTurniPersonaData(dest.utente_id, ds)
        const conf = sovrapposti(turniDest, ds, turno)
        if (conf.length) { setConflitti(conf); setStep(3); setBusy(false); return }
      }
      // destinatario NON nel personale autorizzato del mese ⇒ il cambio richiede SEMPRE
      // l'approvazione del responsabile (anche col cambio automatico attivo). Approvandolo,
      // quel nominativo viene inserito nel personale autorizzato del mese (lato RPC).
      const fuoriMese = !autorizzatiMese.has(dest.id)
      const descr = `${nomeById.get(da) ?? '—'} → ${nomeCompleto(dest)}${fuoriMese ? ' (da autorizzare per il mese)' : ''} — ${nomeTurno} di ${itDs(ds)} (${postazioneNome})`
      const { auto } = await store.richiediCambio(postazioneId, ds, turno.id, slot, da, dest.id, forza, descr, undefined, fuoriMese)
      store.addNotifica({ postazioneId, mese: ds.slice(0, 7), tipo: 'cambio_turno', messaggio: auto ? `Cambio turno effettuato automaticamente: ${descr}.` : `Richiesta di cambio turno da approvare: ${descr}.`, target: '/admin/turni', perAdmin: true }).catch(() => {})
      setEsito(auto ? 'auto' : 'attesa'); setStep(4); onFatto()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const Riepilogo = (
    <div className="rounded-lg p-3 mb-3 text-sm" style={{ background: 'var(--t-tenue)', color: 'var(--t-testo)' }}>
      <p><strong>{nomeTurno}</strong></p>
      <p>{itDs(ds)} · {postazioneNome}</p>
      <p className="mt-1">Turno di <strong>{nomeById.get(da) ?? '—'}</strong></p>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(28,40,24,0.45)' }} onClick={() => !busy && onChiudi()}>
      <div className="card w-full max-w-md p-5" style={{ animation: 'fadeSlideIn 160ms ease-out' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-2">
          <ArrowRightLeft size={18} style={{ color: 'var(--t-accento)' }} />
          <h3 className="text-base font-bold" style={{ color: 'var(--t-titolo)' }}>Cambio turno {step < 4 && <span className="text-xs font-semibold text-stone-400">· passo {step === 3 ? 2 : step} di 2</span>}</h3>
        </div>

        {step === 1 && (
          <>
            <p className="text-sm text-stone-600 mb-2">Vuoi chiedere il <strong>cambio</strong> di questo turno?</p>
            {Riepilogo}
            <div className="flex justify-end gap-2">
              <button onClick={onChiudi} className="btn-secondary text-sm py-1.5 px-3">Annulla</button>
              <button onClick={() => setStep(2)} className="btn-primary text-sm py-1.5 px-4">Sì, continua</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-sm text-stone-600 mb-2">A <strong>chi</strong> vuoi cedere il turno?</p>
            {Riepilogo}
            {!nuovo ? (
              <>
                <div className="max-h-56 overflow-auto rounded-lg border mb-2" style={{ borderColor: 'var(--t-riga)' }}>
                  {[{ label: 'Turnisti', items: gTurnisti }, { label: 'Esterni', items: gEsterni }].filter(g => g.items.length).map(g => (
                    <div key={g.label}>
                      <p className="text-[10px] font-bold uppercase tracking-wider px-2.5 pt-2 pb-1" style={{ color: 'var(--t-etichetta)' }}>{g.label}</p>
                      {g.items.map(p => (
                        <button key={p.id} onClick={() => setDestId(p.id)}
                          className="w-full text-left px-2.5 py-1.5 text-sm flex items-center gap-2"
                          style={destId === p.id ? { background: 'var(--t-primario)', color: '#fff', fontWeight: 600 } : { color: 'var(--t-testo)' }}>
                          {destId === p.id && <Check size={14} />} {nomeCompleto(p)}
                        </button>
                      ))}
                    </div>
                  ))}
                  {gTurnisti.length + gEsterni.length === 0 && <p className="text-sm text-stone-400 italic p-3">Nessun altro nel personale autorizzato di questo mese: usa «Aggiungilo».</p>}
                </div>
                <button onClick={() => { setNuovo(true); setErr(null) }} className="text-xs font-semibold inline-flex items-center gap-1 mb-3" style={{ color: 'var(--t-accento)' }}>
                  <UserPlus2 size={13} /> Non è in lista? Aggiungilo
                </button>
              </>
            ) : (
              <div className="rounded-lg border p-3 mb-3 space-y-2" style={{ borderColor: 'var(--t-riga)' }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--t-titolo)' }}>Aggiungi una persona (come <strong>esterno</strong>)</p>
                <p className="text-[11px] text-stone-500">Il cambio verso un nominativo nuovo richiede <strong>sempre</strong> l'approvazione del responsabile, anche se il cambio automatico è attivo.</p>

                {/* Ricerca in anagrafica per non creare doppioni */}
                <div className="relative">
                  <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                  <input type="text" value={cerca} onChange={e => setCerca(e.target.value)} placeholder="È già nel sistema? Cerca per nome o cognome…" className="input text-sm w-full" style={{ paddingLeft: 26 }} />
                </div>
                {cerca.trim().length >= 3 && (
                  sugg.length > 0 ? (
                    <div className="rounded-lg border max-h-40 overflow-auto" style={{ borderColor: 'var(--t-riga)' }}>
                      {sugg.map(s => (
                        <button key={s.id} onClick={() => pickEsistente(s)} disabled={busy}
                          className="w-full text-left px-2.5 py-1.5 text-sm flex items-center gap-2 hover:bg-stone-50" style={{ color: 'var(--t-testo)' }}>
                          <UserPlus2 size={13} style={{ color: 'var(--t-accento)' }} className="shrink-0" />
                          <span className="font-medium">{nomeCompleto(s)}</span>
                          <span className="text-[11px] text-stone-400 truncate">{s.email}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-stone-400 italic">Nessuno trovato con questo nome: inseriscilo a mano qui sotto.</p>
                  )
                )}

                {/* Inserimento manuale (persona non ancora nel sistema) */}
                <div className="pt-2" style={{ borderTop: '1px solid var(--t-riga)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1.5">Oppure inseriscilo a mano</p>
                  <div className="flex gap-2">
                    <input type="text" value={nNome} onChange={e => setNNome(e.target.value)} placeholder="Nome" className="input text-sm flex-1" />
                    <input type="text" value={nCognome} onChange={e => setNCognome(e.target.value)} placeholder="Cognome" className="input text-sm flex-1" />
                  </div>
                  <input type="email" value={nEmail} onChange={e => setNEmail(e.target.value)} placeholder="Indirizzo email" className="input text-sm w-full mt-2" />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => { setNuovo(false); setCerca(''); setSugg([]) }} disabled={busy} className="btn-secondary text-xs py-1 px-2.5">Indietro</button>
                  <button onClick={creaEsterno} disabled={busy} className="btn-primary text-xs py-1 px-3">{busy ? 'Aggiungo…' : 'Aggiungi'}</button>
                </div>
              </div>
            )}
            {err && <p className="text-xs mb-2 inline-flex items-center gap-1" style={{ color: '#b91c1c' }}><AlertTriangle size={12} /> {err}</p>}
            {!nuovo && (
              <div className="flex justify-end gap-2">
                <button onClick={() => setStep(1)} disabled={busy} className="btn-secondary text-sm py-1.5 px-3">Indietro</button>
                <button onClick={() => invia(false)} disabled={busy || !dest} className="btn-primary text-sm py-1.5 px-4">{busy ? 'Invio…' : 'Invia'}</button>
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <div className="rounded-lg p-3 mb-3" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
              <p className="text-sm font-semibold mb-1 inline-flex items-center gap-1.5" style={{ color: '#b91c1c' }}><AlertTriangle size={15} /> Attenzione: sovrapposizione d'orario</p>
              <p className="text-xs mb-1.5" style={{ color: '#7f1d1d' }}><strong>{dest ? nomeCompleto(dest) : ''}</strong> ha già in quell'orario:</p>
              <ul className="list-disc ml-4 text-xs space-y-0.5" style={{ color: '#7f1d1d' }}>
                {conflitti.map((c, i) => <li key={i}>{c.turnoNome} {c.ora_inizio}–{c.ora_fine} di {itDs(c.data)} ({c.postazioneNome})</li>)}
              </ul>
            </div>
            {err && <p className="text-xs mb-2 inline-flex items-center gap-1" style={{ color: '#b91c1c' }}><AlertTriangle size={12} /> {err}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setStep(2); setErr(null) }} disabled={busy} className="btn-secondary text-sm py-1.5 px-3">Indietro</button>
              <button onClick={() => invia(true)} disabled={busy} className="text-sm font-semibold py-1.5 px-4 rounded-lg" style={{ background: '#dc2626', color: '#fff' }}>{busy ? 'Invio…' : 'Forza comunque'}</button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            {esito === 'auto' ? (
              <div className="rounded-lg p-3 mb-3 text-sm font-semibold inline-flex items-center gap-2" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}>
                <Check size={16} /> Cambio effettuato: il turno è passato a {dest ? nomeCompleto(dest) : '—'}.
              </div>
            ) : (
              <div className="rounded-lg p-3 mb-3 text-sm" style={{ background: '#fef9c3', color: '#713f12', border: '1px solid #fde047' }}>
                <p className="font-semibold inline-flex items-center gap-1.5 mb-1"><Clock size={14} /> Richiesta inviata</p>
                <p className="text-xs">Il cambio sarà effettivo dopo l'<strong>approvazione del responsabile</strong> (che è stato avvisato). Fino ad allora il turno resta a {nomeById.get(da) ?? '—'}.</p>
              </div>
            )}
            <div className="flex justify-end"><button onClick={onChiudi} className="btn-primary text-sm py-1.5 px-4">Chiudi</button></div>
          </>
        )}
      </div>
    </div>
  )
}
