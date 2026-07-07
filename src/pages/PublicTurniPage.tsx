import { useState, useMemo, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, CalendarHeart, ChevronLeft, ChevronRight, Moon, Sun, MapPin, Info, Phone, Check, Ban, Clock, Hand, LayoutGrid } from 'lucide-react'
import { store } from '../lib/store'
import { giorniDelMese, turnoSiApplica } from '../lib/turniLogic'
import { isFestivo, isPrefestivo, isoDate } from '../lib/holidays'
import { nomeCompleto, cmpTurnisti } from '../types'
import { useImpaginazione } from '../hooks/useImpaginazione'
import { useMeseSelezionato } from '../hooks/useMeseSelezionato'
import { useRealtimePostazione } from '../hooks/useRealtime'
import { useDebug } from '../contexts/DebugContext'
import { IconaLivello } from '../components/IconaLivello'
import type { AuthUser, TurnoSchema, Turno, Turnista, TurnistaMese, Livello, MiaPostazione, Postazione, ConfigVersione, DesiderataFinestra, Desiderata, TipoDesiderata, StatoCalendario, RichiestaTurno } from '../types'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const WD = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab']
const REP = -1
const thStyle: CSSProperties = { background: '#2b3c24', color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 10px', textAlign: 'left', border: '1px solid #1f2d18' }
const tdBase: CSSProperties = { padding: '6px 10px', border: '1px solid #e5e7eb', verticalAlign: 'top' }
const itDate = (iso: string) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}` }

function Avviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="card p-5 flex items-start gap-3" style={{ background: '#f0f4ee' }}>
      <Info size={18} className="shrink-0 mt-0.5" style={{ color: '#476540' }} />
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

  // postazioni dell'utente
  const { data: mie = [], isLoading: loadingMie } = useQuery<MiaPostazione[]>({ queryKey: ['mie-postazioni', user?.id], queryFn: () => store.getMiePostazioni(user!.id), enabled: !!user })
  const { data: tuttePost = [] } = useQuery<Postazione[]>({ queryKey: ['postazioni'], queryFn: () => store.getPostazioni(), enabled: !!user && godMode })
  // postazione ricordata per la sessione (chiave condivisa con l'admin)
  const [postazioneId, setPostazioneId] = useState<string | null>(() => { try { return localStorage.getItem('gm_postazione') } catch { return null } })
  function scegliPostazione(id: string) { try { localStorage.setItem('gm_postazione', id) } catch { /* ignore */ } setPostazioneId(id) }
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
  const pianificazione = tab === 'turni' && statoCal === 'pianificazione'
  const { data: turni = [] } = useQuery<Turno[]>({ queryKey: ['turni', postazioneId, anno, mese], queryFn: () => store.getTurniMese(postazioneId!, anno, mese), enabled: !!postazioneId && tab === 'turni' && statoCal !== 'non_pubblicato' })
  const { data: finestra } = useQuery<DesiderataFinestra | null>({ queryKey: ['desiderata-finestra', postazioneId, meseKey], queryFn: () => store.getDesiderataFinestra(postazioneId!, meseKey), enabled: !!postazioneId && tab === 'desiderata' })
  const { data: desiderata = [] } = useQuery<Desiderata[]>({ queryKey: ['desiderata', postazioneId, anno, mese], queryFn: () => store.getDesiderataMese(postazioneId!, anno, mese), enabled: !!postazioneId && tab === 'desiderata' })
  const { data: personaleMese = [] } = useQuery<TurnistaMese[]>({ queryKey: ['personale-mese', postazioneId, meseKey], queryFn: () => store.getPersonaleMese(postazioneId!, meseKey), enabled: !!postazioneId && tab === 'desiderata' })
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
  const nomeById = useMemo(() => new Map(personale.map(p => [p.id, nomeCompleto(p)])), [personale])
  const giorni = useMemo(() => giorniDelMese(anno, mese), [anno, mese])
  // Una griglia per foglio (passo ③ Impaginazione): righe = (giorno, turno) di quel foglio
  const righePerFoglio = useMemo(() => fogliConTurni.map(fc => {
    const out: { ds: string; d: Date; turno: TurnoSchema }[] = []
    giorni.forEach(d => fc.turni.forEach(c => { if (turnoSiApplica(c, d)) out.push({ ds: isoDate(d), d, turno: c }) }))
    return { foglio: fc.foglio, righe: out }
  }), [fogliConTurni, giorni])

  // calendario: assegnazioni
  const assegn = useMemo(() => {
    const m = new Map<string, string[]>(), rep = new Map<string, string>()
    turni.forEach(t => { if (!t.turnista_id) return; const k = `${t.data}|${t.turno_schema_id}`; if (t.slot === REP) rep.set(k, t.turnista_id); else { const a = m.get(k) ?? []; a.push(t.turnista_id); m.set(k, a) } })
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
    if (!sonoImportato && !godMode) return   // non importato per il mese: non può esprimere desiderata
    await store.setDesiderata(postazioneId!, ds, turnoId, mia.membershipId, tipo)
    await qc.invalidateQueries({ queryKey: ['desiderata', postazioneId, anno, mese] })
  }

  // pianificazione: candidatura su un posto scoperto (badge ???)
  const [proposta, setProposta] = useState<{ ds: string; turno: TurnoSchema } | null>(null)
  const [inviando, setInviando] = useState(false)
  async function confermaProposta() {
    if (!proposta || !mia) return
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
    <div className="flex items-center gap-2">
      <button onClick={() => cambiaMese(-1)} disabled={!canPrev} className="btn-secondary px-2 py-1" style={{ opacity: canPrev ? 1 : 0.35, cursor: canPrev ? 'pointer' : 'not-allowed' }} title={canPrev ? 'Mese precedente' : 'Niente da vedere prima'}><ChevronLeft size={16} /></button>
      <span className="font-bold text-lg text-center" style={{ color: '#3a3d30', minWidth: 140 }}>{MESI[mese - 1]} {anno}</span>
      <button onClick={() => cambiaMese(1)} disabled={!canNext} className="btn-secondary px-2 py-1" style={{ opacity: canNext ? 1 : 0.35, cursor: canNext ? 'pointer' : 'not-allowed' }} title={canNext ? 'Mese successivo' : 'Niente da vedere dopo'}><ChevronRight size={16} /></button>
    </div>
  )

  return (
    <div className="max-w-screen-2xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarDays size={22} style={{ color: '#476540' }} />
        <h1 className="text-2xl font-bold" style={{ color: '#2b3c24' }}>I miei turni</h1>
      </div>

      {opzioni.length === 0 ? (
        <Avviso>{loadingMie ? 'Caricamento…' : 'Non sei ancora inserito nel personale di nessuna postazione. Chiedi al responsabile di aggiungerti.'}</Avviso>
      ) : (
        <>
          {/* Selettore postazione */}
          <div className="card p-3 flex items-center gap-2 flex-wrap">
            <MapPin size={16} style={{ color: '#476540' }} />
            <span className="text-sm font-semibold" style={{ color: '#2b3c24' }}>Postazione:</span>
            {opzioni.length > 1 ? (
              <select value={postazioneId ?? ''} onChange={e => scegliPostazione(e.target.value)} className="input text-sm w-auto">
                {opzioni.map(o => <option key={o.postazioneId} value={o.postazioneId}>{o.nome}</option>)}
              </select>
            ) : <span className="text-sm" style={{ color: '#3a3d30' }}>{opzioni[0].nome}</span>}
            {mia && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#eef3ea', color: '#476540' }}>sei {sonoImportato ? livMese(mia.membershipId) : mia.livello}</span>}

            {/* Responsabile/i della postazione (allineati a destra) */}
            <div className="flex items-center gap-1.5 ml-auto">
              <IconaLivello livello="responsabile" size={15} color="#476540" />
              <span className="text-sm font-semibold" style={{ color: '#2b3c24' }}>Responsabile/i:</span>
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
                style={tab === key ? { background: '#456b3a', color: '#fff' } : { background: '#eef1ea', color: '#476540' }}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>

          {/* Selettore mese */}
          <div className="flex justify-end">{MeseNav}</div>

          {/* ───── CALENDARIO TURNI ───── */}
          {tab === 'turni' && (
            statoCal === 'non_pubblicato' ? (
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
                <div key={foglio.id} className="card overflow-auto w-fit max-w-full mx-auto">
                  <div className="px-3 py-2 flex items-center justify-center gap-2" style={{ borderBottom: '1px solid #eef0ea' }}>
                    <LayoutGrid size={14} style={{ color: '#476540' }} />
                    <h3 className="text-sm font-bold uppercase text-center" style={{ color: '#2b3c24' }}>{foglio.nome} - Turni del mese di {MESI[mese - 1]} {anno}</h3>
                  </div>
                  <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: 58 }} />
                      <col style={{ width: 96 }} />
                      <col />
                      {hasRep && <col style={{ width: 130 }} />}
                    </colgroup>
                    <thead><tr><th style={thStyle}>Giorno</th><th style={thStyle}>Turno</th><th style={thStyle}>Turnisti</th>{hasRep && <th style={thStyle}>Reperibile</th>}</tr></thead>
                    <tbody>
                      {righeF.map(({ ds, d, turno }) => {
                        const fest = isFestivo(d), pref = isPrefestivo(d)
                        const dayColor = fest ? '#b91c1c' : pref ? '#b45309' : '#2b3c24'
                        const rowBg = fest ? '#fdecea' : pref ? '#fff5e6' : '#fff'
                        const overnight = turno.ora_fine <= turno.ora_inizio
                        const k = `${ds}|${turno.id}`
                        const ids = assegn.m.get(k) ?? []
                        const rep = assegn.rep.get(k)
                        const mancano = Math.max(0, turno.n_turnisti - ids.length)
                        const hoChiesto = mieRichieste.has(k)
                        return (
                          <tr key={k} style={{ background: rowBg }}>
                            <td style={{ ...tdBase, whiteSpace: 'nowrap' }}><span style={{ fontWeight: 700, color: dayColor }}>{d.getDate()} {WD[d.getDay()]}</span></td>
                            <td style={tdBase}>
                              <span className="inline-flex items-center gap-1" style={{ color: '#475569' }}>{overnight ? <Moon size={12} style={{ color: '#64748b' }} /> : <Sun size={12} style={{ color: '#f59e0b' }} />}{turno.nome || 'Turno'}</span>
                              <div style={{ fontSize: 10, color: '#94a3b8' }}>{turno.ora_inizio}–{turno.ora_fine}</div>
                            </td>
                            <td style={{ ...tdBase, wordBreak: 'break-word' }}>
                              <div className="flex flex-wrap gap-1.5 items-center">
                                {ids.length === 0 && !(pianificazione && mancano > 0) && <span className="text-[11px] text-stone-300 italic">—</span>}
                                {ids.map(id => {
                                  const io = id === mia?.membershipId
                                  return <span key={id} className="rounded px-2 py-0.5 text-[11px] font-medium" style={io ? { background: '#2e7d32', color: '#fff' } : { background: '#eef1ea', color: '#3a3d30' }}>{nomeById.get(id) ?? '—'}{io && ' (tu)'}</span>
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
                              <td style={{ ...tdBase, wordBreak: 'break-word' }}>
                                {rep
                                  ? <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium" style={rep === mia?.membershipId ? { background: '#b45309', color: '#fff' } : { background: '#fff5e6', color: '#92400e' }} title="Reperibile"><Phone size={10} /> {nomeById.get(rep) ?? '—'}{rep === mia?.membershipId && ' (tu)'}</span>
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
                <div key={foglio.id} className="card overflow-auto w-fit max-w-full mx-auto">
                  <div className="px-3 py-2 flex items-center justify-center gap-2" style={{ borderBottom: '1px solid #eef0ea' }}>
                    <LayoutGrid size={14} style={{ color: '#476540' }} />
                    <h3 className="text-sm font-bold uppercase text-center" style={{ color: '#2b3c24' }}>{foglio.nome} - Turni del mese di {MESI[mese - 1]} {anno}</h3>
                  </div>
                  <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, position: 'sticky', left: 0, zIndex: 3, whiteSpace: 'nowrap' }}>Giorno · Turno</th>
                        {colonne.map(t => {
                          const io = t.id === mia?.membershipId
                          return <th key={t.id} style={{ ...thStyle, textAlign: 'center', minWidth: 92, background: io ? '#15803d' : '#2b3c24' }}>{nomeCompleto(t)}{io ? ' (tu)' : ''}</th>
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {righeF.map(({ ds, d, turno }) => {
                        const fest = isFestivo(d), pref = isPrefestivo(d)
                        const dayColor = fest ? '#b91c1c' : pref ? '#b45309' : '#2b3c24'
                        const rowBg = fest ? '#fdecea' : pref ? '#fff5e6' : '#fff'
                        const overnight = turno.ora_fine <= turno.ora_inizio
                        return (
                          <tr key={`${ds}|${turno.id}`} style={{ background: rowBg }}>
                            <td style={{ ...tdBase, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: rowBg, zIndex: 1 }}>
                              <div className="flex items-center gap-1.5">
                                <span style={{ fontWeight: 700, color: dayColor }}>{d.getDate()} {WD[d.getDay()]}</span>
                                <span className="inline-flex items-center gap-1" style={{ color: '#475569' }}>{overnight ? <Moon size={12} style={{ color: '#64748b' }} /> : <Sun size={12} style={{ color: '#f59e0b' }} />}{turno.nome || 'Turno'}</span>
                              </div>
                              <div style={{ fontSize: 10, color: '#94a3b8' }}>{turno.ora_inizio}–{turno.ora_fine}</div>
                            </td>
                            {colonne.map(t => {
                              const io = t.id === mia?.membershipId
                              const scelta = desByKey.get(`${ds}|${turno.id}|${t.id}`)
                              return (
                                <td key={t.id} style={{ ...tdBase, textAlign: 'center', background: io ? 'rgba(22,163,74,0.06)' : undefined }}>
                                  {io && desEditabile ? (
                                    <div className="inline-flex gap-1">
                                      <button onClick={() => setPref(ds, turno.id, scelta === 'desiderata' ? null : 'desiderata')} title="Vorrei"
                                        className="inline-flex items-center justify-center rounded-md w-7 h-7 border transition-colors"
                                        style={scelta === 'desiderata' ? { background: '#16a34a', color: '#fff', borderColor: '#15803d' } : { background: '#fff', color: '#166534', borderColor: '#bbf7d0' }}><Check size={13} /></button>
                                      <button onClick={() => setPref(ds, turno.id, scelta === 'indisponibilita' ? null : 'indisponibilita')} title="Non posso"
                                        className="inline-flex items-center justify-center rounded-md w-7 h-7 border transition-colors"
                                        style={scelta === 'indisponibilita' ? { background: '#dc2626', color: '#fff', borderColor: '#b91c1c' } : { background: '#fff', color: '#b91c1c', borderColor: '#fecaca' }}><Ban size={13} /></button>
                                    </div>
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
                      <tr style={{ background: '#eef3ea', borderTop: '2px solid #cdd8c4' }}>
                        <td style={{ ...tdBase, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#eef3ea', zIndex: 1, fontWeight: 700, color: '#2b3c24' }}>
                          <span className="inline-flex items-center gap-1"><Check size={12} style={{ color: '#16a34a' }} /> Disponibilità</span>
                        </td>
                        {colonne.map(t => {
                          const tot = righeF.reduce((n, r) => n + (desByKey.get(`${r.ds}|${r.turno.id}|${t.id}`) === 'desiderata' ? 1 : 0), 0)
                          const io = t.id === mia?.membershipId
                          return (
                            <td key={t.id} style={{ ...tdBase, textAlign: 'center', fontWeight: 800, fontSize: 14, background: io ? 'rgba(22,163,74,0.12)' : '#eef3ea', color: tot > 0 ? '#166534' : '#94a3b8' }} title={`${nomeCompleto(t)}: ${tot} disponibilità in questo foglio`}>{tot}</td>
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
                <div key={foglio.id} className="card overflow-auto w-fit max-w-full mx-auto">
                  <div className="px-3 py-2 flex items-center justify-center gap-2" style={{ borderBottom: '1px solid #eef0ea' }}>
                    <LayoutGrid size={14} style={{ color: '#476540' }} />
                    <h3 className="text-sm font-bold uppercase text-center" style={{ color: '#2b3c24' }}>{foglio.nome} - Turni del mese di {MESI[mese - 1]} {anno}</h3>
                  </div>
                  <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
                    <thead><tr><th style={thStyle}>Giorno</th><th style={thStyle}>Turno</th><th style={{ ...thStyle, textAlign: 'center' }}>La tua scelta</th></tr></thead>
                    <tbody>
                      {righeF.map(({ ds, d, turno }) => {
                        const fest = isFestivo(d), pref = isPrefestivo(d)
                        const dayColor = fest ? '#b91c1c' : pref ? '#b45309' : '#2b3c24'
                        const rowBg = fest ? '#fdecea' : pref ? '#fff5e6' : '#fff'
                        const overnight = turno.ora_fine <= turno.ora_inizio
                        const cur = miaPref.get(`${ds}|${turno.id}`)
                        return (
                          <tr key={`${ds}|${turno.id}`} style={{ background: rowBg }}>
                            <td style={{ ...tdBase, whiteSpace: 'nowrap' }}><span style={{ fontWeight: 700, color: dayColor }}>{d.getDate()} {WD[d.getDay()]}</span></td>
                            <td style={{ ...tdBase, whiteSpace: 'nowrap' }}>
                              <span className="inline-flex items-center gap-1">{overnight ? <Moon size={12} style={{ color: '#64748b' }} /> : <Sun size={12} style={{ color: '#f59e0b' }} />}{turno.nome || 'Turno'}</span>
                              <div style={{ fontSize: 10, color: '#94a3b8' }}>{turno.ora_inizio}–{turno.ora_fine}</div>
                            </td>
                            <td style={{ ...tdBase, textAlign: 'center' }}>
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

          {/* Modal: candidatura su un turno scoperto (Modalità Pianificazione) */}
          {proposta && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(28,40,24,0.45)' }} onClick={() => setProposta(null)}>
              <div className="card w-full max-w-sm p-5" style={{ animation: 'fadeSlideIn 160ms ease-out' }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 mb-2"><Hand size={18} style={{ color: '#b45309' }} /><h3 className="text-base font-bold" style={{ color: '#2b3c24' }}>Candidati per questo turno</h3></div>
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
                <div className="flex items-center gap-2 mb-2"><Clock size={18} style={{ color: '#92400e' }} /><h3 className="text-base font-bold" style={{ color: '#2b3c24' }}>Annullare la proposta?</h3></div>
                <p className="text-sm font-semibold my-1" style={{ color: '#1f2d18' }}>{itDate(annulla.ds)} · {annulla.turno.nome || 'Turno'} <span className="text-stone-500 font-normal">({annulla.turno.ora_inizio}–{annulla.turno.ora_fine})</span></p>
                <p className="text-xs text-stone-500 mt-2 mb-4">Se non è ancora stata approvata o rifiutata, la tua candidatura verrà ritirata e il responsabile non la vedrà.</p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setAnnulla(null)} disabled={annullando} className="btn-secondary text-sm py-1.5 px-3">No</button>
                  <button onClick={annullaProposta} disabled={annullando} className="btn-primary text-sm py-1.5 px-4" style={{ background: '#b45309' }}>{annullando ? 'Verifico…' : 'Sì, annulla'}</button>
                </div>
              </div>
            </div>
          )}

          {/* Modal: esito annullamento (già approvata / già rifiutata) */}
          {annullaMsg && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(28,40,24,0.45)' }} onClick={() => setAnnullaMsg(null)}>
              <div className="card w-full max-w-sm p-5" style={{ animation: 'fadeSlideIn 160ms ease-out' }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 mb-2"><Info size={18} style={{ color: '#476540' }} /><h3 className="text-base font-bold" style={{ color: '#2b3c24' }}>Proposta</h3></div>
                <p className="text-sm text-stone-600 mb-4">{annullaMsg}</p>
                <div className="flex justify-end"><button onClick={() => setAnnullaMsg(null)} className="btn-primary text-sm py-1.5 px-4">Ok</button></div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
