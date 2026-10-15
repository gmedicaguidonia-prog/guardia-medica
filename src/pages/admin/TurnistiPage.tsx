import { Fragment, useMemo, useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Save, X, Users, Search, ChevronLeft, ChevronRight, Check, UserPlus, UserMinus, Pencil, Copy, RotateCcw, AlertTriangle, Loader2 } from 'lucide-react'
import { store } from '../../lib/store'
import { LIVELLI_PERSONALE, nomeCompleto, gruppiPerLivello, presenteNelMese } from '../../types'
import { ATTIVAZIONE_DA } from '../../lib/constants'
import { usePostazione } from '../../contexts/PostazioneContext'
import { useMeseSelezionato } from '../../hooks/useMeseSelezionato'
import { useUnsaved } from '../../contexts/UnsavedContext'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmModal } from '../../components/ConfirmModal'
import { IconaLivello } from '../../components/IconaLivello'
import { PaginaNav, paginaGruppi, NOMI_PER_PAGINA } from '../../components/PaginaNav'
import { useFinalizzato } from '../../hooks/useFinalizzato'
import type { Turnista, Livello, Utente, TurnistaMese, Turno } from '../../types'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

const BADGE: Record<Livello, { bg: string; fg: string }> = {
  admin:        { bg: '#fef9c3', fg: '#a16207' },
  responsabile: { bg: '#fef3c7', fg: '#ca8a04' },
  turnista:     { bg: '#dbeafe', fg: '#1e40af' },
  esterno:      { bg: '#dcfce7', fg: '#166534' },
}
function LivelloBadge({ livello }: { livello: Livello }) {
  const { bg, fg } = BADGE[livello]
  const label = LIVELLI_PERSONALE.find(l => l.value === livello)?.label ?? livello
  return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-medium" style={{ background: bg, color: fg }}><IconaLivello livello={livello} size={10} /> {label}</span>
}

export function TurnistiPage() {
  const qc = useQueryClient()
  const { confirm, notify, confirmState } = useConfirm()
  const { setHasUnsaved } = useUnsaved()
  const { postazioneId, postazioneAttiva } = usePostazione()
  const { meseKey, mese, anno, setMeseAnno } = useMeseSelezionato()
  const nuovaProcedura = meseKey >= ATTIVAZIONE_DA

  const { data: turnisti = [], isLoading } = useQuery<Turnista[]>({ queryKey: ['turnisti', postazioneId], queryFn: () => store.getTurnisti(postazioneId!), enabled: !!postazioneId })
  const { data: personale = [], dataUpdatedAt } = useQuery<TurnistaMese[]>({ queryKey: ['personale-mese', postazioneId, meseKey], queryFn: () => store.getPersonaleMese(postazioneId!, meseKey), enabled: !!postazioneId, refetchOnWindowFocus: false })
  const { data: attivazioni = [] } = useQuery<number[]>({ queryKey: ['attivazioni', postazioneId, meseKey], queryFn: () => store.getAttivazioni(postazioneId!, meseKey), enabled: !!postazioneId })
  const confermato = attivazioni.includes(0)
  const { data: meseSorgente } = useQuery<string | null>({ queryKey: ['ultimo-mese-personale', postazioneId, meseKey], queryFn: () => store.ultimoMesePersonale(postazioneId!, meseKey), enabled: !!postazioneId })
  const meseLabel = (k: string) => { const [a, m] = k.split('-').map(Number); return `${MESI[m - 1]} ${a}` }

  const tById = useMemo(() => new Map(turnisti.map(t => [t.id, t])), [turnisti])

  // ── personale del mese STAGED (niente autosave: si salva con "Conferma") ──
  const serverMap = useMemo(() => new Map<string, Livello>(personale.map(p => [p.turnista_id, p.livello])), [personale])
  const [staged, setStaged] = useState<Map<string, Livello>>(() => new Map())
  const [iniziato, setIniziato] = useState(false)
  // La bozza si riallinea al server SOLO quando la query (ri)carica i dati del mese:
  // primo caricamento, cambio mese, salvataggio o CANCELLAZIONE del mese (invalidate →
  // refetch → dataUpdatedAt cambia). Durante l'editing locale non c'è refetch
  // (refetchOnWindowFocus off), quindi la bozza in sospeso viene preservata.
  useEffect(() => { setStaged(new Map(personale.map(p => [p.turnista_id, p.livello]))) }, [dataUpdatedAt])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setIniziato(false) }, [meseKey])
  const dirty = useMemo(() => {
    if (staged.size !== serverMap.size) return true
    for (const [k, v] of staged) if (serverMap.get(k) !== v) return true
    return false
  }, [staged, serverMap])
  useEffect(() => { setHasUnsaved(dirty); return () => setHasUnsaved(false) }, [dirty, setHasUnsaved])
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const personaleTurnisti = useMemo(() => [...staged].map(([id, liv]) => { const t = tById.get(id); return t ? { ...t, livello: liv } : null }).filter((t): t is Turnista => !!t), [staged, tById])
  const gruppiMese = useMemo(() => gruppiPerLivello(personaleTurnisti), [personaleTurnisti])
  // Gli utenti SOSPESI non sono proponibili per i nuovi mesi (restano solo nei mesi dove già lavorano).
  const nonNelMese = useMemo(() => gruppiPerLivello(turnisti.filter(t => !staged.has(t.id) && t.attivo && presenteNelMese(t, meseKey))), [turnisti, staged, meseKey])

  // Anagrafica della postazione: i SOSPESI non compaiono (si gestiscono solo dal
  // riquadro «Utenti sospesi» del Centro di Controllo).
  const anagrAttivi = useMemo(() => turnisti.filter(t => t.attivo && presenteNelMese(t, meseKey)), [turnisti, meseKey])
  const nSospesiNascosti = turnisti.filter(t => !t.attivo).length
  // chi è uscito dalla postazione da questo mese (o prima) non compare: si riaggiunge cercandolo nel modulo
  const nUscitiNascosti = turnisti.filter(t => t.attivo && !presenteNelMese(t, meseKey)).length

  // Paginazione degli elenchi di nomi (max NOMI_PER_PAGINA per pagina, gruppi conservati)
  const [pagMese, setPagMese] = useState(0)
  const [pagAgg, setPagAgg] = useState(0)
  const [pagAnagr, setPagAnagr] = useState(0)
  useEffect(() => { setPagMese(0); setPagAgg(0) }, [meseKey])
  const totAgg = useMemo(() => nonNelMese.reduce((s, g) => s + g.items.length, 0), [nonNelMese])
  const nPagMese = Math.max(1, Math.ceil(personaleTurnisti.length / NOMI_PER_PAGINA))
  const nPagAgg = Math.max(1, Math.ceil(totAgg / NOMI_PER_PAGINA))
  const nPagAnagr = Math.max(1, Math.ceil(anagrAttivi.length / NOMI_PER_PAGINA))
  useEffect(() => { if (pagMese > nPagMese - 1) setPagMese(0) }, [pagMese, nPagMese])
  useEffect(() => { if (pagAgg > nPagAgg - 1) setPagAgg(0) }, [pagAgg, nPagAgg])
  useEffect(() => { if (pagAnagr > nPagAnagr - 1) setPagAnagr(0) }, [pagAnagr, nPagAnagr])

  function cambiaMese(delta: number) { let m = mese + delta, a = anno; if (m < 1) { m = 12; a-- } else if (m > 12) { m = 1; a++ } setMeseAnno(a, m) }

  // ── operazioni STAGED sul personale del mese (in memoria) ──
  function aggiungiAlMese(t: Turnista) { setStaged(prev => new Map(prev).set(t.id, t.livello)) }
  function cambiaRuoloMese(id: string, livello: Livello) { setStaged(prev => new Map(prev).set(id, livello)) }
  // Turni (normali e reperibilità) del mese assegnati alle persone indicate: chi ne ha
  // non si può togliere dal personale del mese (resterebbero turni di chi «non c'è»).
  async function turniDi(ids: string[]): Promise<Map<string, Turno[]>> {
    const cerca = new Set(ids)
    const m = new Map<string, Turno[]>()
    for (const t of await store.getTurniMese(postazioneId!, anno, mese)) {
      if (t.turnista_id && cerca.has(t.turnista_id)) m.set(t.turnista_id, [...(m.get(t.turnista_id) ?? []), t])
    }
    return m
  }
  function messaggioBlocco(conTurni: Map<string, Turno[]>): string {
    const gm = (ds: string) => `${+ds.slice(8, 10)}/${+ds.slice(5, 7)}`
    const righe = [...conTurni].map(([id, ts]) => {
      const t = tById.get(id)
      const norm = ts.filter(x => x.slot >= 0).map(x => x.data).sort()
      const rep = ts.filter(x => x.slot < 0).map(x => x.data).sort()
      const parti: string[] = []
      if (norm.length) parti.push(`${norm.length} turn${norm.length === 1 ? 'o' : 'i'} (${norm.map(gm).join(', ')})`)
      if (rep.length) parti.push(`${rep.length} reperibilità (${rep.map(gm).join(', ')})`)
      return `${t ? nomeCompleto(t) : '—'}: ${parti.join(' e ')}`
    })
    return `Non si può togliere dal personale di ${MESI[mese - 1]} ${anno} chi ha turni assegnati in questo mese. ${righe.join(' · ')}. Togli o riassegna prima quei turni in ⑦ Turni del Mese, poi riprova.`
  }
  const [verificoId, setVerificoId] = useState<string | null>(null)
  async function togliDalMese(id: string) {
    setVerificoId(id)
    try {
      const conTurni = await turniDi([id])
      if (conTurni.size) { await notify({ title: 'Non si può togliere dal mese', message: messaggioBlocco(conTurni) }); return }
    } catch (e) {
      console.error('[Personale] verifica turni fallita:', e)
      void notify({ title: 'Verifica non riuscita', message: 'Non riesco a controllare i turni del mese: riprova tra poco.' }); return
    } finally { setVerificoId(null) }
    setStaged(prev => { const n = new Map(prev); n.delete(id); return n })
  }
  // Esce dalla postazione DA QUESTO MESE IN POI: l'iscrizione si chiude ma non si cancella (i mesi
  // precedenti restano invariati). Rifiutato se ha turni da questo mese in poi.
  async function rimuoviDallaPostazione(t: Turnista) {
    const post = postazioneAttiva?.nome ?? 'questa postazione'
    const meseTxt = `${MESI[mese - 1]} ${anno}`
    setVerificoId(t.id)
    let futuri: { data: string; slot: number }[]
    try { futuri = await store.getTurniTurnistaDal(t.id, meseKey) }
    catch (e) { console.error('[Personale] verifica turni fallita:', e); setVerificoId(null); void notify({ title: 'Verifica non riuscita', message: 'Non riesco a controllare i turni: riprova tra poco.' }); return }
    setVerificoId(null)
    if (futuri.length) {
      const perMese = new Map<string, string[]>()
      futuri.forEach(x => { const k = x.data.slice(0, 7); perMese.set(k, [...(perMese.get(k) ?? []), `${+x.data.slice(8, 10)}${x.slot < 0 ? ' (rep.)' : ''}`]) })
      const elenco = [...perMese].map(([k, gg]) => `${meseLabel(k)}: ${gg.join(', ')}`).join(' · ')
      await notify({ title: 'Non si può rimuovere', message: `${nomeCompleto(t)} ha ancora turni assegnati da ${meseTxt} in poi — ${elenco}. Toglili o riassegnali prima in ⑦ Turni del Mese, poi riprova.` })
      return
    }
    const ok = await confirm({ title: `Rimuovere da ${post}?`, message: `${nomeCompleto(t)} non farà più parte di ${post} da ${meseTxt} in poi: sparisce dal personale e da «Aggiungi al mese» di questo mese e dei successivi. I mesi precedenti restano invariati. Se servirà di nuovo, lo riaggiungi cercandolo in Gestione anagrafica.`, confirmLabel: 'Rimuovi', danger: true })
    if (!ok) return
    const bozzaPulita = !dirty
    setVerificoId(t.id)
    try {
      await store.rimuoviDallaPostazione(t.id, meseKey)
      store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'personale', messaggio: `${nomeCompleto(t)} non fa più parte di ${post} da ${meseTxt}.`, target: '/admin/turnisti', perAdmin: true }).catch(() => {})
      setStaged(prev => { const n = new Map(prev); n.delete(t.id); return n })
      await qc.invalidateQueries({ queryKey: ['turnisti'] })
      // a bozza pulita si rilegge il personale del mese (ora senza di lui); con modifiche in sospeso
      // no: il refetch riallineerebbe la bozza al server e le butterebbe via
      if (bozzaPulita) await qc.invalidateQueries({ queryKey: ['personale-mese', postazioneId] })
    } catch (e) { void notify({ title: 'Rimozione non riuscita', message: (e as Error).message }) }
    finally { setVerificoId(null) }
  }
  async function copiaPersonale() {
    if (!meseSorgente) return
    const src = await store.getPersonaleMese(postazioneId!, meseSorgente)
    // Gli utenti SOSPESI presenti nel mese sorgente non vengono copiati: avvisa con i nomi.
    const sospesi = src.map(p => tById.get(p.turnista_id)).filter((t): t is Turnista => !!t && !t.attivo)
    if (sospesi.length > 0) {
      const nomi = sospesi.map(t => nomeCompleto(t)).join(', ')
      await notify({
        title: sospesi.length === 1 ? 'Utente sospeso non copiato' : 'Utenti sospesi non copiati',
        message: sospesi.length === 1
          ? `L'utente ${nomi} risulta sospeso: le sue informazioni non verranno copiate nel nuovo mese.`
          : `Gli utenti ${nomi} risultano sospesi: le loro informazioni non verranno copiate nel nuovo mese.`,
      })
    }
    // Chi non fa più parte della postazione in questo mese non viene copiato: avvisa con i nomi.
    const usciti = src.map(p => tById.get(p.turnista_id)).filter((t): t is Turnista => !!t && t.attivo && !presenteNelMese(t, meseKey))
    if (usciti.length > 0) {
      const nomi = usciti.map(t => nomeCompleto(t)).join(', ')
      const post = postazioneAttiva?.nome ?? 'questa postazione'
      await notify({
        title: usciti.length === 1 ? 'Non copiato' : 'Non copiati',
        message: usciti.length === 1
          ? `${nomi} non fa più parte di ${post}: non viene copiato nel nuovo mese.`
          : `${nomi} non fanno più parte di ${post}: non vengono copiati nel nuovo mese.`,
      })
    }
    const copiabili = new Set(turnisti.filter(t => t.attivo && presenteNelMese(t, meseKey)).map(t => t.id))
    setStaged(prev => { const n = new Map(prev); for (const p of src) if (copiabili.has(p.turnista_id)) n.set(p.turnista_id, p.livello); return n })
  }
  function annulla() { setStaged(new Map(serverMap)) }

  const [salvando, setSalvando] = useState(false)
  const { finalizzato } = useFinalizzato(postazioneId, meseKey)   // mese bloccato ⇒ niente salvataggi
  async function confermaPersonale() {
    if (staged.size === 0) return
    if (finalizzato) { await notify({ title: 'Mese finalizzato', message: `${MESI[mese - 1]} ${anno} è bloccato: per modificare il personale sbloccalo dalla pagina ⑧ Finalizzazione.` }); return }
    setSalvando(true)
    try {
      const daTogliere = [...serverMap.keys()].filter(id => !staged.has(id))
      if (daTogliere.length) {
        const conTurni = await turniDi(daTogliere)
        if (conTurni.size) { await notify({ title: 'Personale non confermato', message: messaggioBlocco(conTurni) }); return }
      }
      for (const [id, liv] of staged) { const srv = serverMap.get(id); if (srv === undefined) await store.addTurnistaMese(postazioneId!, meseKey, id, liv); else if (srv !== liv) await store.setLivelloMese(postazioneId!, meseKey, id, liv) }
      for (const id of serverMap.keys()) if (!staged.has(id)) await store.removeTurnistaMese(meseKey, id)
      if (nuovaProcedura) await store.attivaPasso(postazioneId!, meseKey, 0)
      store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'personale', messaggio: `Personale di ${MESI[mese - 1]} ${anno} ${nuovaProcedura ? 'confermato' : 'salvato'} (${staged.size} person${staged.size === 1 ? 'a' : 'e'}).`, target: '/admin/turnisti', perAdmin: true }).catch(() => {})
      await qc.invalidateQueries({ queryKey: ['personale-mese', postazioneId, meseKey] })
      await qc.invalidateQueries({ queryKey: ['attivazioni', postazioneId, meseKey] })
    } catch (e) { console.error('[Personale] salvataggio fallito:', e); void notify({ title: 'Errore', message: `Errore nel salvataggio del personale: ${(e as Error).message ?? 'sconosciuto'}` }) }
    finally { setSalvando(false) }
  }

  // ── Anagrafica globale (form intelligente: crea nuovo con anti-duplicato, oppure modifica un esistente) ──
  const [apriAnagrafica, setApriAnagrafica] = useState(false)
  const [nome, setNome] = useState(''); const [cognome, setCognome] = useState(''); const [email, setEmail] = useState('')
  const [picked, setPicked] = useState<Utente | null>(null)   // utente esistente scelto ⇒ il form diventa "Modifica"
  const [livello, setLivello] = useState<Livello>('turnista')
  const [errore, setErrore] = useState(''); const [saving, setSaving] = useState(false)
  const [sugg, setSugg] = useState<Utente[]>([])
  const [turnistaAltrove, setTurnistaAltrove] = useState<string | null>(null)   // postazione in cui l'utente scelto è già turnista
  const inEdit = !!picked
  // suggerimenti SOLO se non stiamo già modificando un utente scelto (in modifica i campi si editano)
  async function cerca(term: string) { if (picked) return; if (term.trim().length < 3) { setSugg([]); return } try { setSugg(await store.searchUtenti(term)) } catch { setSugg([]) } }
  const [esito, setEsito] = useState<string | null>(null)   // esito dell'ultimo «Salva modifiche» (il modulo resta sulla persona)
  function scegli(u: Utente) {
    setNome(u.nome); setCognome(u.cognome); setEmail(u.email); setPicked(u); setSugg([]); setErrore(''); setEsito(null); setTurnistaAltrove(null)
    // in modifica il menu è il RUOLO DEL MESE in questa postazione: si parte da quello della
    // bozza del mese, altrimenti dal livello di default qui, altrimenti turnista
    const membro = turnisti.find(t => t.utente_id === u.id)
    setLivello(membro ? (staged.get(membro.id) ?? membro.livello) : 'turnista')
    // una persona è turnista in UNA sola postazione: se lo è già altrove, nell'anagrafica di
    // questa postazione entrerà come esterno (il ruolo del mese resta libero)
    store.getMembershipUtente(u.id).then(ms => {
      const altrove = ms.find(m => m.livello === 'turnista' && m.postazioneId !== postazioneId)
      if (altrove) setTurnistaAltrove(altrove.postazioneNome)
    }).catch(() => {})
  }
  function resetForm() { setNome(''); setCognome(''); setEmail(''); setPicked(null); setLivello('turnista'); setSugg([]); setErrore(''); setEsito(null); setTurnistaAltrove(null) }

  // NUOVO utente: prima di crearlo, avvisa se esiste già stessa email o stesso nome+cognome (anti-doppione)
  async function creaNuovo() {
    if (!nome.trim() || !cognome.trim() || !email.trim()) { setErrore('Nome, cognome ed email obbligatori.'); return }
    setErrore('')
    let dup: { perEmail: Utente | null; perNome: Utente | null }
    try { dup = await store.verificaDuplicati(nome, cognome, email) } catch { dup = { perEmail: null, perNome: null } }
    if (dup.perEmail) {
      if (await confirm({ title: 'Email già presente', message: `Esiste già ${nomeCompleto(dup.perEmail)} con questa email. Non si può creare un doppione: vuoi passare alla MODIFICA di quell'utente?`, confirmLabel: 'Modifica esistente' })) scegli(dup.perEmail)
      else setErrore('Email già usata da un altro utente: cambia email oppure modifica l\'utente esistente.')
      return
    }
    if (dup.perNome) {
      if (!(await confirm({ title: 'Stesso nome e cognome', message: `Esiste già ${nomeCompleto(dup.perNome)} (${dup.perNome.email}). Vuoi davvero creare una persona NUOVA e diversa con email ${email.trim().toLowerCase()}? Se è la stessa persona, annulla e modifica quella esistente.`, confirmLabel: 'Crea nuovo comunque', danger: true }))) return
    }
    setSaving(true)
    try {
      await store.addMembro(postazioneId!, { nome, cognome, email, livello })
      store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'personale', messaggio: `${cognome} ${nome} aggiunto in anagrafica (${livello}).`, target: '/admin/turnisti', perAdmin: true }).catch(() => {})
      resetForm(); await qc.invalidateQueries({ queryKey: ['turnisti'] })
    } catch (e) { setErrore((e as Error).message) }
    finally { setSaving(false) }
  }

  // MODIFICA anagrafica di un utente esistente: una sola riga `utenti` (referenziata per id) ⇒ cambia OVUNQUE
  // «Salva modifiche» (persona scelta): aggiorna i dati anagrafici (validi ovunque: conferma solo
  // se cambiati) e il RUOLO DEL MESE in questa postazione; se la persona non è nel personale del
  // mese chiede se aggiungerla (anche alla postazione, se serve). Il modulo resta sulla persona.
  // Tutto ciò che riguarda il mese va nella BOZZA: diventa effettivo con «Conferma personale del mese».
  const labelLiv = (l: Livello) => LIVELLI_PERSONALE.find(x => x.value === l)?.label ?? l
  async function salvaModifiche() {
    if (!picked) return
    if (!nome.trim() || !cognome.trim() || !email.trim()) { setErrore('Nome, cognome ed email obbligatori.'); return }
    const nuovi = { nome: nome.trim(), cognome: cognome.trim(), email: email.trim().toLowerCase() }
    const anagraficaCambiata = nuovi.nome !== picked.nome || nuovi.cognome !== picked.cognome || nuovi.email !== picked.email.toLowerCase()
    if (anagraficaCambiata && !(await confirm({ title: 'Modifica anagrafica', message: `Stai modificando l'anagrafica di ${picked.cognome} ${picked.nome}. Nome, cognome ed email valgono in TUTTO il programma: ogni mese, ogni postazione e i turni già assegnati. Continuare?`, confirmLabel: 'Salva ovunque' }))) return
    setSaving(true); setErrore(''); setEsito(null)
    const meseTxt = `${MESI[mese - 1]} ${anno}`
    const fatto: string[] = []
    let bozzaToccata = false
    try {
      if (anagraficaCambiata) {
        await store.aggiornaUtente(picked.id, nuovi)
        store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'personale', messaggio: `Anagrafica aggiornata: ${nuovi.cognome} ${nuovi.nome}.`, target: '/admin/turnisti', perAdmin: true }).catch(() => {})
        // il nome cambia ovunque ⇒ invalida tutte le query, TRANNE il personale del mese: un suo
        // refetch riallinea la bozza al server e butterebbe via le modifiche non ancora confermate
        await qc.invalidateQueries({ predicate: q => q.queryKey[0] !== 'personale-mese' })
        setPicked({ ...picked, ...nuovi })
        fatto.push('dati anagrafici aggiornati')
      }
      const membro = turnisti.find(t => t.utente_id === picked.id) ?? null
      const uscito = !!membro && !presenteNelMese(membro, meseKey)   // iscrizione chiusa da questo mese o prima
      if (membro && !uscito && staged.has(membro.id)) {
        if (staged.get(membro.id) !== livello) { cambiaRuoloMese(membro.id, livello); bozzaToccata = true; fatto.push(`ruolo a ${meseTxt}: ${labelLiv(livello)}`) }
      } else if (picked.attivo === false || membro?.attivo === false) {
        fatto.push('utente sospeso: non può essere aggiunto ai mesi')
      } else {
        const chi = `${nuovi.cognome} ${nuovi.nome}`
        const domanda = membro && !uscito
          ? `Vuoi aggiungere ${chi} al personale di ${meseTxt} come ${labelLiv(livello)}?`
          : membro && uscito
            ? `${chi} non fa più parte di ${postazioneAttiva?.nome ?? 'questa postazione'} da ${meseLabel(membro.fuori_dal!)}. Vuoi riaggiungerlo alla postazione e al personale di ${meseTxt} come ${labelLiv(livello)}?`
            : `${chi} non fa ancora parte di ${postazioneAttiva?.nome ?? 'questa postazione'}. Vuoi aggiungerlo alla postazione e al personale di ${meseTxt} come ${labelLiv(livello)}?${livello === 'turnista' && turnistaAltrove ? ` Nell'anagrafica della postazione risulterà esterno, perché è già turnista a ${turnistaAltrove}; a ${meseTxt} avrà il ruolo di Turnista.` : ''}`
        if (await confirm({ title: `Aggiungere a ${meseTxt}?`, message: domanda, confirmLabel: 'Sì, aggiungi' })) {
          let id = membro?.id
          if (membro && uscito) {
            await store.riammettiNellaPostazione(membro.id)
            store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'personale', messaggio: `${chi} riaggiunto a ${postazioneAttiva?.nome ?? 'postazione'} da ${meseTxt}.`, target: '/admin/turnisti', perAdmin: true }).catch(() => {})
            await qc.invalidateQueries({ queryKey: ['turnisti'] })
          } else if (!id) {
            const livelloPostazione: Livello = livello === 'turnista' && turnistaAltrove ? 'esterno' : livello
            await store.addMembro(postazioneId!, { ...nuovi, livello: livelloPostazione, utenteId: picked.id })
            store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'personale', messaggio: `${chi} aggiunto in anagrafica (${livelloPostazione}).`, target: '/admin/turnisti', perAdmin: true }).catch(() => {})
            id = (await store.getTurnisti(postazioneId!)).find(t => t.utente_id === picked.id)?.id
            await qc.invalidateQueries({ queryKey: ['turnisti'] })
          }
          if (id) { const nid = id; setStaged(prev => new Map(prev).set(nid, livello)); bozzaToccata = true; fatto.push(`aggiunto al personale di ${meseTxt} come ${labelLiv(livello)}`) }
        }
      }
      if (bozzaToccata) fatto.push('premi «Conferma personale del mese» per renderlo effettivo')
      setEsito(fatto.length ? fatto.join(' · ') : 'Nessuna modifica da salvare.')
    } catch (e) { setErrore((e as Error).message) }
    finally { setSaving(false) }
  }
  const [editId, setEditId] = useState<string | null>(null)
  const [eNome, setENome] = useState(''); const [eCognome, setECognome] = useState(''); const [eEmail, setEEmail] = useState(''); const [eUtente, setEUtente] = useState(''); const [eLiv, setELiv] = useState<Livello>('turnista')
  function startEdit(t: Turnista) { setEditId(t.id); setENome(t.nome); setECognome(t.cognome); setEEmail(t.email); setEUtente(t.utente_id); setELiv(t.livello); setErrore('') }
  async function salvaEdit() {
    if (!eNome.trim() || !eCognome.trim() || !eEmail.trim()) { setErrore('Nome, cognome ed email obbligatori.'); return }
    setSaving(true); setErrore('')
    try { await store.updateMembro(editId!, eUtente, { nome: eNome, cognome: eCognome, email: eEmail, livello: eLiv }); setEditId(null); await qc.invalidateQueries({ queryKey: ['turnisti'] }) }
    catch (e) { setErrore((e as Error).message) }
    finally { setSaving(false) }
  }
  async function rimuoviAnagrafica(t: Turnista) {
    // con storico non si cancella (buchi nei mesi passati): esce dalla postazione da questo mese in poi
    if (await store.turnistaHaStorico(t.id)) { await rimuoviDallaPostazione(t); return }
    if (!(await confirm({ title: 'Elimina dall’anagrafica', message: `Eliminare definitivamente ${nomeCompleto(t)} dall’anagrafica? Non ha storico, quindi è sicuro.`, confirmLabel: 'Elimina', danger: true }))) return
    await store.removeMembro(t.id)
    setStaged(prev => { if (!prev.has(t.id)) return prev; const n = new Map(prev); n.delete(t.id); return n })
    await qc.invalidateQueries({ queryKey: ['turnisti'] })
  }

  if (!postazioneId) return <div className="max-w-3xl mx-auto p-6 text-sm text-stone-500">Caricamento postazione…</div>

  const Header = (
    <div className="flex items-start gap-3">
      <Users size={22} style={{ color: 'var(--t-accento)' }} className="mt-1 shrink-0" />
      <div className="flex-1">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--t-titolo)' }}>Personale del mese{postazioneAttiva ? ` - ${postazioneAttiva.nome}` : ''}</h1>
        <p className="text-sm text-stone-600">Conferma chi è in servizio in <strong>{MESI[mese - 1]} {anno}</strong> e con quale ruolo. Ogni mese è indipendente: cambiare ruolo o togliere qualcuno non tocca i mesi passati. Ricordati di premere <strong>Conferma</strong>.</p>
        <p className="text-[11px] text-stone-500 mt-1">Il <strong>ruolo</strong> (responsabile / turnista / esterno) è solo un'etichetta di questo mese e <strong>non</strong> dà accesso all'amministrazione: chi può entrare e gestire i turni si decide in <strong>Centro di Controllo → Supervisori</strong>.</p>
      </div>
      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
        <button onClick={() => cambiaMese(-1)} className="btn-secondary px-2 py-1" title="Mese precedente"><ChevronLeft size={16} /></button>
        <span className="font-bold text-lg text-center" style={{ color: 'var(--t-testo)', minWidth: 130 }}>{MESI[mese - 1]} {anno}</span>
        <button onClick={() => cambiaMese(1)} className="btn-secondary px-2 py-1" title="Mese successivo"><ChevronRight size={16} /></button>
      </div>
    </div>
  )

  const mostraGate = staged.size === 0 && !iniziato && !dirty
  const mostraSalva = dirty || (nuovaProcedura && !confermato && staged.size > 0)

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-5">
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />
      {Header}
      {mostraGate ? (
        /* ── Gate iniziale: copia dal mese precedente o parti da zero ── */
        <div className="card p-8 text-center space-y-4">
          <Users size={32} className="mx-auto" style={{ color: 'var(--t-soft)' }} />
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--t-titolo)' }}>Personale di {MESI[mese - 1]} {anno}</h3>
            {meseSorgente
              ? <p className="text-sm text-stone-600 mt-1">Puoi copiarlo dall'ultimo mese configurato (<strong>{meseLabel(meseSorgente)}</strong>) e poi modificarlo, oppure partire da zero. Dopo, premi <strong>Conferma</strong>.</p>
              : <p className="text-sm text-stone-600 mt-1">Non c'è un mese precedente da cui copiare: aggiungi le persone in servizio questo mese.</p>}
          </div>
          <div className="flex gap-2 justify-center flex-wrap">
            {meseSorgente && <button onClick={copiaPersonale} className="btn-primary text-sm"><Copy size={16} /> Copia da {meseLabel(meseSorgente)}</button>}
            <button onClick={() => setIniziato(true)} className={`${meseSorgente ? 'btn-secondary' : 'btn-primary'} text-sm`}><Plus size={16} /> Aggiungi a mano</button>
          </div>
        </div>
      ) : (<>
      {/* ── Personale di QUESTO mese (staged) ── */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm font-bold" style={{ color: 'var(--t-titolo)' }}>In servizio a {MESI[mese - 1]} {anno}</h2>
          <span className="text-xs text-stone-500">· {staged.size} person{staged.size === 1 ? 'a' : 'e'}</span>
          {dirty
            ? <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24' }}><AlertTriangle size={12} /> Modifiche non salvate</span>
            : nuovaProcedura && (confermato
              ? <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}><Check size={12} /> Personale confermato</span>
              : <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24' }}>Da confermare (passo ①)</span>)}
        </div>

        {staged.size === 0 ? (
          <p className="text-xs text-stone-400 italic">Nessuno in servizio questo mese. Aggiungi le persone dall’elenco qui sotto, poi premi Conferma.</p>
        ) : paginaGruppi(gruppiMese, pagMese).map(g => (
          <div key={g.liv}>
            <p className="text-[11px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: BADGE[g.liv].fg }}><IconaLivello livello={g.liv} size={11} /> {g.label} · {g.items.length}</p>
            <div className="space-y-1">
              {g.items.map(t => (
                <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: '#f7f8f4' }}>
                  <span className="text-sm font-medium flex-1 truncate" style={{ color: 'var(--t-titolo)' }}>{nomeCompleto(t)}</span>
                  <select value={staged.get(t.id) ?? 'turnista'} onChange={e => cambiaRuoloMese(t.id, e.target.value as Livello)} className="input text-xs py-1" style={{ width: 'auto' }} title="Ruolo per questo mese">
                    {LIVELLI_PERSONALE.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                  <button onClick={() => togliDalMese(t.id)} disabled={verificoId !== null} title={`Togli ${nomeCompleto(t)} solo da ${MESI[mese - 1]} ${anno}: resta nella postazione e tra gli aggiungibili`}
                    className="p-1.5 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors shrink-0 disabled:opacity-50"><X size={14} /></button>
                  <button onClick={() => rimuoviDallaPostazione(t)} disabled={verificoId !== null} title={`Togli ${nomeCompleto(t)} dalla postazione da ${MESI[mese - 1]} ${anno} in poi: non comparirà più neanche tra gli aggiungibili`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg shrink-0 transition-colors disabled:opacity-50"
                    style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                    {verificoId === t.id ? <Loader2 size={12} className="animate-spin" /> : <UserMinus size={12} />}<span className="hidden sm:inline">Rimuovi dalla postazione</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

        <PaginaNav pagina={pagMese} nPagine={nPagMese} totale={personaleTurnisti.length} onCambia={setPagMese} />

        {(mostraSalva || dirty) && (
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <button onClick={confermaPersonale} disabled={staged.size === 0 || salvando}
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:cursor-default"
              style={(staged.size > 0 && !salvando) ? { background: '#2e7d32', color: '#fff' } : { background: '#f3f4f6', color: '#9ca3af' }}>
              <Check size={15} /> {salvando ? 'Salvo…' : (nuovaProcedura ? 'Conferma personale del mese' : 'Salva personale')}
            </button>
            {dirty && <button onClick={annulla} className="btn-secondary text-xs py-1.5 px-3"><RotateCcw size={13} /> Annulla</button>}
            {nuovaProcedura && <span className="text-[11px] text-stone-400">Necessario per procedere ai passi successivi.</span>}
          </div>
        )}
      </div>

      {/* ── Aggiungi al mese dall'anagrafica ── */}
      <div className="card p-4 space-y-2">
        <h2 className="text-sm font-bold" style={{ color: 'var(--t-titolo)' }}>Aggiungi al mese</h2>
        {isLoading ? <p className="text-xs text-stone-400">Caricamento…</p>
          : nonNelMese.length === 0 ? <p className="text-xs text-stone-400 italic">Tutti gli inseriti in anagrafica sono già nel personale di questo mese.</p>
          : paginaGruppi(nonNelMese, pagAgg).map(g => (
            <div key={g.liv}>
              <p className="text-[11px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: BADGE[g.liv].fg }}><IconaLivello livello={g.liv} size={11} /> {g.label}</p>
              <div className="flex flex-wrap gap-2">
                {g.items.map(t => (
                  <button key={t.id} onClick={() => aggiungiAlMese(t)} title={`Aggiungi ${nomeCompleto(t)} (${t.livello})`}
                    className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full shadow-sm border transition-transform hover:scale-105"
                    style={{ background: BADGE[t.livello].bg, color: BADGE[t.livello].fg, borderColor: 'rgba(0,0,0,0.06)' }}>
                    {nomeCompleto(t)} <Plus size={12} className="opacity-70" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        <PaginaNav pagina={pagAgg} nPagine={nPagAgg} totale={totAgg} onCambia={setPagAgg} />
      </div>
      </>)}

      {/* ── Gestione anagrafica (collassabile) ── */}
      <div className="card overflow-hidden">
        <button onClick={() => setApriAnagrafica(o => !o)} className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-stone-50 transition-colors">
          <UserPlus size={16} style={{ color: 'var(--t-accento)' }} />
          <span className="text-sm font-bold" style={{ color: 'var(--t-titolo)' }}>Gestione anagrafica</span>
          <span className="text-xs text-stone-400">— aggiungi nuove persone al sistema o modificale</span>
          <span className="ml-auto text-stone-400 text-xs">{apriAnagrafica ? '▲' : '▼'}</span>
        </button>

        {apriAnagrafica && (
          <div className="px-4 pb-4 space-y-3 border-t border-stone-100 pt-3">
            {inEdit && (
              <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af' }}>
                <Pencil size={13} className="shrink-0 mt-0.5" />
                <span>Stai <strong>modificando {picked!.cognome} {picked!.nome}</strong>. «Salva modifiche» aggiorna nome, cognome ed email (validi in <strong>tutto il programma</strong>) e il suo <strong>ruolo a {MESI[mese - 1]} {anno}</strong> in questa postazione; se non è ancora nel personale del mese ti chiede se aggiungerlo. Per creare una persona nuova, premi «Svuota form».</span>
              </div>
            )}
            {errore && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{errore}</div>}
            <div className="relative">
              <div className="grid sm:grid-cols-3 gap-3">
                <div><label className="label text-xs flex items-center gap-1">{!inEdit && <Search size={11} />} Nome *</label>
                  <input value={nome} onChange={e => { setNome(e.target.value); cerca(e.target.value) }} placeholder="Mario" className="input text-sm" /></div>
                <div><label className="label text-xs flex items-center gap-1">{!inEdit && <Search size={11} />} Cognome *</label>
                  <input value={cognome} onChange={e => { setCognome(e.target.value); cerca(e.target.value) }} placeholder="Rossi" className="input text-sm" /></div>
                <div><label className="label text-xs">Email Google *</label>
                  <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="mario.rossi@gmail.com" className="input text-sm" /></div>
              </div>
              {sugg.length > 0 && !inEdit && (
                <div className="absolute z-20 left-0 right-0 mt-1 card p-1 shadow-xl max-h-56 overflow-auto">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-stone-400 px-2 py-1">Già in anagrafica — clicca per modificarlo</p>
                  {sugg.map(u => (
                    <button key={u.id} onClick={() => scegli(u)} className="flex items-center justify-between gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-stone-100 text-sm">
                      <span className="font-medium" style={{ color: 'var(--t-titolo)' }}>{nomeCompleto(u)}</span><span className="text-xs text-stone-400 font-mono">{u.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-end gap-3 flex-wrap">
              <div><label className="label text-xs">{inEdit ? `Ruolo a ${MESI[mese - 1]} ${anno}` : 'Livello di default'}</label>
                <select value={livello} onChange={e => setLivello(e.target.value as Livello)} className="input text-sm w-48">
                  {LIVELLI_PERSONALE.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
                {inEdit && turnistaAltrove && <p className="text-[11px] mt-1" style={{ color: '#b45309' }}>È già <strong>turnista</strong> a {turnistaAltrove} (si può esserlo in una sola postazione): se entra in questa postazione ci risulterà esterno, ma il ruolo del mese può essere Turnista.</p>}
                {inEdit && picked?.attivo === false && <p className="text-[11px] mt-1" style={{ color: '#b91c1c' }}>Utente <strong>sospeso</strong>: puoi correggerne i dati, ma non aggiungerlo ai mesi.</p>}
              </div>
              {inEdit ? (
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                  <button onClick={salvaModifiche} disabled={saving} className="btn-primary text-sm"><Save size={15} /> Salva modifiche</button>
                  <button onClick={resetForm} className="btn-secondary text-sm"><RotateCcw size={14} /> Svuota form</button>
                </div>
              ) : (
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                  {(nome || cognome || email) && <button onClick={resetForm} className="btn-secondary text-sm"><RotateCcw size={14} /> Svuota form</button>}
                  <button onClick={creaNuovo} disabled={saving} className="btn-primary text-sm"><Plus size={15} /> Aggiungi in anagrafica</button>
                </div>
              )}
            </div>

            {inEdit && esito && <p className="text-xs font-medium flex items-start gap-1.5 rounded-lg px-3 py-2" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}><Check size={13} className="shrink-0 mt-0.5" /> <span>{esito}</span></p>}
            <table className="w-full text-sm mt-1">
              <tbody className="divide-y divide-gray-100">
                {paginaGruppi(gruppiPerLivello(anagrAttivi), pagAnagr).map(g => (
                  <Fragment key={g.liv}>
                    <tr><td colSpan={4} className="px-1 py-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: BADGE[g.liv].fg }}><span className="inline-flex items-center gap-1"><IconaLivello livello={g.liv} size={11} /> {g.label} · {g.items.length}</span></td></tr>
                    {g.items.map(t => editId === t.id ? (
                      <tr key={t.id} className="bg-blue-50/40">
                        <td className="px-1 py-1.5"><div className="flex gap-1"><input value={eCognome} onChange={e => setECognome(e.target.value)} className="input py-0.5 text-xs w-full" placeholder="Cognome" autoFocus /><input value={eNome} onChange={e => setENome(e.target.value)} className="input py-0.5 text-xs w-full" placeholder="Nome" /></div></td>
                        <td className="px-1 py-1.5"><input value={eEmail} onChange={e => setEEmail(e.target.value)} type="email" className="input py-0.5 text-xs w-full" /></td>
                        <td className="px-1 py-1.5"><select value={eLiv} onChange={e => setELiv(e.target.value as Livello)} className="input py-0.5 text-xs w-full">{LIVELLI_PERSONALE.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}</select></td>
                        <td className="px-1 py-1.5"><div className="flex gap-1 justify-end items-center">
                          <button onClick={salvaEdit} disabled={saving} className="btn-primary py-0.5 px-2 text-xs gap-1"><Save size={11} /></button>
                          <button onClick={() => setEditId(null)} className="btn-secondary py-0.5 px-1.5 text-xs"><X size={11} /></button>
                        </div></td>
                      </tr>
                    ) : (
                      <tr key={t.id} className="hover:bg-stone-50 group">
                        <td className="px-1 py-2 font-medium text-stone-800">{nomeCompleto(t)}</td>
                        <td className="px-1 py-2 font-mono text-xs text-gray-600">{t.email}</td>
                        <td className="px-1 py-2"><LivelloBadge livello={t.livello} /></td>
                        <td className="px-1 py-2"><div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(t)} className="p-1.5 rounded text-stone-500 hover:text-blue-600 hover:bg-blue-50" title="Modifica"><Pencil size={13} /></button>
                          <button onClick={() => rimuoviAnagrafica(t)} className="p-1.5 rounded text-stone-500 hover:text-red-600 hover:bg-red-50" title="Rimuovi dalla postazione (da questo mese in poi; chi non ci ha mai lavorato viene eliminato)"><Trash2 size={13} /></button>
                        </div></td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
                {anagrAttivi.length === 0 && !isLoading && <tr><td colSpan={4} className="px-1 py-3 text-center text-stone-500 text-sm">Anagrafica vuota.</td></tr>}
              </tbody>
            </table>
            <PaginaNav pagina={pagAnagr} nPagine={nPagAnagr} totale={anagrAttivi.length} onCambia={setPagAnagr} />
            {nUscitiNascosti > 0 && (
              <p className="text-[11px] font-medium" style={{ color: '#b45309' }}>
                {nUscitiNascosti === 1 ? '1 persona non fa' : `${nUscitiNascosti} persone non fanno`} più parte di questa postazione a {MESI[mese - 1]} {anno} e non {nUscitiNascosti === 1 ? 'compare' : 'compaiono'} in questo elenco: per riaggiungerla cercala nel modulo qui sopra.
              </p>
            )}
            {nSospesiNascosti > 0 && (
              <p className="text-[11px] font-medium" style={{ color: '#b45309' }}>
                {nSospesiNascosti === 1 ? '1 utente sospeso non compare' : `${nSospesiNascosti} utenti sospesi non compaiono`} in questo elenco: {nSospesiNascosti === 1 ? 'lo trovi' : 'li trovi'} in <strong>Centro di Controllo → Utenti sospesi</strong>.
              </p>
            )}
            <p className="text-[11px] text-stone-400">Il <strong>livello di default</strong> dell’anagrafica viene proposto quando aggiungi una persona a un mese; poi puoi cambiarne il ruolo mese per mese qui sopra. Chi ha storico non è cancellabile (per non lasciare buchi nei mesi passati).</p>
          </div>
        )}
      </div>
    </div>
  )
}
