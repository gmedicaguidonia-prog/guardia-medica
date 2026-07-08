import { Fragment, useMemo, useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Save, X, Users, Search, ChevronLeft, ChevronRight, Check, UserPlus, Pencil, Copy, RotateCcw, AlertTriangle } from 'lucide-react'
import { store } from '../../lib/store'
import { LIVELLI_PERSONALE, nomeCompleto, gruppiPerLivello } from '../../types'
import { ATTIVAZIONE_DA } from '../../lib/constants'
import { usePostazione } from '../../contexts/PostazioneContext'
import { useMeseSelezionato } from '../../hooks/useMeseSelezionato'
import { useUnsaved } from '../../contexts/UnsavedContext'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmModal } from '../../components/ConfirmModal'
import { IconaLivello } from '../../components/IconaLivello'
import { useFinalizzato } from '../../hooks/useFinalizzato'
import type { Turnista, Livello, Utente, TurnistaMese } from '../../types'

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
  const nonNelMese = useMemo(() => gruppiPerLivello(turnisti.filter(t => !staged.has(t.id))), [turnisti, staged])

  function cambiaMese(delta: number) { let m = mese + delta, a = anno; if (m < 1) { m = 12; a-- } else if (m > 12) { m = 1; a++ } setMeseAnno(a, m) }

  // ── operazioni STAGED sul personale del mese (in memoria) ──
  function aggiungiAlMese(t: Turnista) { setStaged(prev => new Map(prev).set(t.id, t.livello)) }
  function cambiaRuoloMese(id: string, livello: Livello) { setStaged(prev => new Map(prev).set(id, livello)) }
  function togliDalMese(id: string) { setStaged(prev => { const n = new Map(prev); n.delete(id); return n }) }
  async function copiaPersonale() {
    if (!meseSorgente) return
    const src = await store.getPersonaleMese(postazioneId!, meseSorgente)
    const anagr = new Set(turnisti.map(t => t.id))
    setStaged(prev => { const n = new Map(prev); for (const p of src) if (anagr.has(p.turnista_id)) n.set(p.turnista_id, p.livello); return n })
  }
  function annulla() { setStaged(new Map(serverMap)) }

  const [salvando, setSalvando] = useState(false)
  const { finalizzato } = useFinalizzato(postazioneId, meseKey)   // mese bloccato ⇒ niente salvataggi
  async function confermaPersonale() {
    if (staged.size === 0) return
    if (finalizzato) { await notify({ title: 'Mese finalizzato', message: `${MESI[mese - 1]} ${anno} è bloccato: per modificare il personale sbloccalo dalla pagina ⑧ Finalizzazione.` }); return }
    setSalvando(true)
    try {
      for (const [id, liv] of staged) { const srv = serverMap.get(id); if (srv === undefined) await store.addTurnistaMese(postazioneId!, meseKey, id, liv); else if (srv !== liv) await store.setLivelloMese(postazioneId!, meseKey, id, liv) }
      for (const id of serverMap.keys()) if (!staged.has(id)) await store.removeTurnistaMese(meseKey, id)
      if (nuovaProcedura) await store.attivaPasso(postazioneId!, meseKey, 0)
      store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'personale', messaggio: `Personale di ${MESI[mese - 1]} ${anno} ${nuovaProcedura ? 'confermato' : 'salvato'} (${staged.size} person${staged.size === 1 ? 'a' : 'e'}).`, target: '/admin/turnisti', perAdmin: true }).catch(() => {})
      await qc.invalidateQueries({ queryKey: ['personale-mese', postazioneId, meseKey] })
      await qc.invalidateQueries({ queryKey: ['attivazioni', postazioneId, meseKey] })
    } catch (e) { console.error('[Personale] salvataggio fallito:', e); void notify({ title: 'Errore', message: `Errore nel salvataggio del personale: ${(e as Error).message ?? 'sconosciuto'}` }) }
    finally { setSalvando(false) }
  }

  // ── Anagrafica globale ──
  const [apriAnagrafica, setApriAnagrafica] = useState(false)
  const [nome, setNome] = useState(''); const [cognome, setCognome] = useState(''); const [email, setEmail] = useState('')
  const [utenteId, setUtenteId] = useState<string | null>(null)
  const [livello, setLivello] = useState<Livello>('turnista')
  const [errore, setErrore] = useState(''); const [saving, setSaving] = useState(false)
  const [sugg, setSugg] = useState<Utente[]>([])
  async function cerca(term: string) { setUtenteId(null); if (term.trim().length < 3) { setSugg([]); return } try { setSugg(await store.searchUtenti(term)) } catch { setSugg([]) } }
  function scegli(u: Utente) { setNome(u.nome); setCognome(u.cognome); setEmail(u.email); setUtenteId(u.id); setSugg([]) }
  function resetForm() { setNome(''); setCognome(''); setEmail(''); setUtenteId(null); setLivello('turnista'); setSugg([]) }
  async function aggiungiAnagrafica() {
    if (!nome.trim() || !cognome.trim() || !email.trim()) { setErrore('Nome, cognome ed email obbligatori.'); return }
    setSaving(true); setErrore('')
    try {
      await store.addMembro(postazioneId!, { nome, cognome, email, livello, utenteId: utenteId ?? undefined })
      store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'personale', messaggio: `${cognome} ${nome} aggiunto in anagrafica (${livello}).`, target: '/admin/turnisti', perAdmin: true }).catch(() => {})
      resetForm(); await qc.invalidateQueries({ queryKey: ['turnisti'] })
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
    if (await store.turnistaHaStorico(t.id)) {
      await notify({ title: 'Non eliminabile', message: `${nomeCompleto(t)} ha già turni/desiderata o fa parte del personale di uno o più mesi: non può essere cancellato dall'anagrafica (si creerebbero buchi nei mesi passati). Se non serve più, toglilo dal personale dei mesi futuri.` })
      return
    }
    if (!(await confirm({ title: 'Elimina dall’anagrafica', message: `Eliminare definitivamente ${nomeCompleto(t)} dall’anagrafica? Non ha storico, quindi è sicuro.`, confirmLabel: 'Elimina', danger: true }))) return
    await store.removeMembro(t.id)
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
      {errore && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{errore}</div>}

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
        ) : gruppiMese.map(g => (
          <div key={g.liv}>
            <p className="text-[11px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: BADGE[g.liv].fg }}><IconaLivello livello={g.liv} size={11} /> {g.label} · {g.items.length}</p>
            <div className="space-y-1">
              {g.items.map(t => (
                <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: '#f7f8f4' }}>
                  <span className="text-sm font-medium flex-1 truncate" style={{ color: 'var(--t-titolo)' }}>{nomeCompleto(t)}</span>
                  <select value={staged.get(t.id) ?? 'turnista'} onChange={e => cambiaRuoloMese(t.id, e.target.value as Livello)} className="input text-xs py-1" style={{ width: 'auto' }} title="Ruolo per questo mese">
                    {LIVELLI_PERSONALE.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                  <button onClick={() => togliDalMese(t.id)} title="Togli dal mese" className="p-1.5 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors"><X size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        ))}

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
          : nonNelMese.map(g => (
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
            <div className="relative">
              <div className="grid sm:grid-cols-3 gap-3">
                <div><label className="label text-xs flex items-center gap-1"><Search size={11} /> Nome *</label>
                  <input value={nome} onChange={e => { setNome(e.target.value); cerca(e.target.value) }} placeholder="Mario" className="input text-sm" /></div>
                <div><label className="label text-xs flex items-center gap-1"><Search size={11} /> Cognome *</label>
                  <input value={cognome} onChange={e => { setCognome(e.target.value); cerca(e.target.value) }} placeholder="Rossi" className="input text-sm" /></div>
                <div><label className="label text-xs">Email Google *</label>
                  <input value={email} onChange={e => { setEmail(e.target.value); setUtenteId(null) }} type="email" placeholder="mario.rossi@gmail.com" className="input text-sm" /></div>
              </div>
              {sugg.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 card p-1 shadow-xl max-h-56 overflow-auto">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-stone-400 px-2 py-1">Già in anagrafica — clicca per usare</p>
                  {sugg.map(u => (
                    <button key={u.id} onClick={() => scegli(u)} className="flex items-center justify-between gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-stone-100 text-sm">
                      <span className="font-medium" style={{ color: 'var(--t-titolo)' }}>{nomeCompleto(u)}</span><span className="text-xs text-stone-400 font-mono">{u.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-end gap-3">
              <div><label className="label text-xs">Livello di default</label>
                <select value={livello} onChange={e => setLivello(e.target.value as Livello)} className="input text-sm w-56">
                  {LIVELLI_PERSONALE.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select></div>
              {utenteId && <span className="text-xs text-emerald-700 mb-2">✓ utente esistente</span>}
              <button onClick={aggiungiAnagrafica} disabled={saving} className="btn-primary text-sm ml-auto"><Plus size={15} /> Aggiungi in anagrafica</button>
            </div>

            <table className="w-full text-sm mt-1">
              <tbody className="divide-y divide-gray-100">
                {gruppiPerLivello(turnisti).map(g => (
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
                          <button onClick={() => rimuoviAnagrafica(t)} className="p-1.5 rounded text-stone-500 hover:text-red-600 hover:bg-red-50" title="Elimina dall’anagrafica"><Trash2 size={13} /></button>
                        </div></td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
                {turnisti.length === 0 && !isLoading && <tr><td colSpan={4} className="px-1 py-3 text-center text-stone-500 text-sm">Anagrafica vuota.</td></tr>}
              </tbody>
            </table>
            <p className="text-[11px] text-stone-400">Il <strong>livello di default</strong> dell’anagrafica viene proposto quando aggiungi una persona a un mese; poi puoi cambiarne il ruolo mese per mese qui sopra. Chi ha storico non è cancellabile (per non lasciare buchi nei mesi passati).</p>
          </div>
        )}
      </div>
    </div>
  )
}
