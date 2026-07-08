import { useState, useEffect, useMemo } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, Plus, Trash2, Pencil, Save, X, Shield, ShieldCheck, UserPlus, Lock, Crown, SlidersHorizontal, ScrollText, Search, UserRound, UsersRound, Ban, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react'
import { store } from '../../lib/store'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmModal } from '../../components/ConfirmModal'
import { IconaLivello } from '../../components/IconaLivello'
import { usePostazione } from '../../contexts/PostazioneContext'
import { ADMIN_EMAIL } from '../../lib/constants'
import { nomeCompleto } from '../../types'
import type { AuthUser, Postazione, UtenteAdmin, UtenteAnagrafica, MembershipUtente, Supervisore, LogPostazione } from '../../types'

function fmtDT(iso: string) {
  return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function PostazioniPage() {
  const qc = useQueryClient()
  const { user } = useOutletContext<{ user: AuthUser | null }>()
  const { confirm, notify, confirmState } = useConfirm()
  const { postazioneId, setPostazioneId } = usePostazione()

  const { data: postazioni = [], isLoading } = useQuery<Postazione[]>({ queryKey: ['postazioni'], queryFn: () => store.getPostazioni() })
  const { data: logPost = [] } = useQuery<LogPostazione[]>({ queryKey: ['log-postazioni'], queryFn: () => store.getLogPostazioni() })
  const nomeAutore = user ? nomeCompleto(user) : null

  const [nuovoNome, setNuovoNome] = useState('')
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')

  async function crea() {
    if (!nuovoNome.trim()) return
    setSaving(true)
    try {
      const nome = nuovoNome.trim()
      const p = await store.creaPostazione(nome); setNuovoNome('')
      await store.addLogPostazione(`Postazione «${nome}» creata.`, nomeAutore)
      await qc.invalidateQueries({ queryKey: ['postazioni'] })
      await qc.invalidateQueries({ queryKey: ['log-postazioni'] })
      setPostazioneId(p.id)
    }
    catch (e) { console.error(e); void notify({ title: 'Errore', message: 'Errore nella creazione.' }) }
    finally { setSaving(false) }
  }
  async function salvaNome(id: string) {
    if (!editNome.trim()) return
    const nuovo = editNome.trim()
    const vecchio = postazioni.find(p => p.id === id)?.nome ?? ''
    await store.updatePostazione(id, { nome: nuovo }); setEditId(null)
    if (nuovo !== vecchio) {
      await store.addLogPostazione(`Postazione «${vecchio}» rinominata in «${nuovo}».`, nomeAutore)
      await qc.invalidateQueries({ queryKey: ['log-postazioni'] })
    }
    await qc.invalidateQueries({ queryKey: ['postazioni'] })
  }
  async function elimina(p: Postazione) {
    const ok = await confirm({
      title: `Elimina «${p.nome}»`,
      message: `Verranno eliminati TUTTI i dati di questa postazione: personale (appartenenze), configurazioni, regole, desiderata e turni assegnati. L'operazione NON è reversibile.`,
      confirmLabel: 'Elimina tutto', danger: true,
    })
    if (!ok) return
    await store.deletePostazione(p.id)
    await store.addLogPostazione(`Postazione «${p.nome}» eliminata.`, nomeAutore)
    await qc.invalidateQueries({ queryKey: ['postazioni'] })
    await qc.invalidateQueries({ queryKey: ['log-postazioni'] })
  }

  if (user?.livello !== 'admin') {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="card p-5 text-sm text-stone-600">Solo l'<strong>Admin</strong> può accedere al <strong>Centro di Controllo</strong>.</div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--t-titolo)' }}>
          <SlidersHorizontal size={22} style={{ color: 'var(--t-accento)' }} /> Centro di Controllo
        </h1>
        <p className="text-sm text-stone-600 mt-0.5">Le impostazioni generali del programma, divise per funzione.</p>
      </div>

      {/* Blocco: Postazioni */}
      <div className="card p-4 space-y-3">
        <div>
          <h2 className="font-semibold text-stone-700 text-sm flex items-center gap-1.5"><MapPin size={15} style={{ color: 'var(--t-accento)' }} /> Postazioni</h2>
          <p className="text-xs text-stone-500 mt-0.5">Ogni postazione ha il suo personale, turni, regole e desiderata. Seleziona quella attiva dal menu in alto; i <strong>Responsabili</strong> si assegnano dalla pagina <strong>Personale</strong>.</p>
        </div>

        {/* crea */}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="label text-xs">Nuova postazione</label>
            <input value={nuovoNome} onChange={e => setNuovoNome(e.target.value)} placeholder="Es. Tivoli" className="input text-sm" onKeyDown={e => e.key === 'Enter' && crea()} />
          </div>
          <button onClick={crea} disabled={saving || !nuovoNome.trim()} className="btn-primary text-sm"><Plus size={15} /> Crea</button>
        </div>

        {/* elenco */}
        {isLoading ? <p className="text-sm text-stone-500">Caricamento…</p> : (
          <div className="space-y-1.5">
            {postazioni.map(p => (
              <div key={p.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: '#f4f6f1', boxShadow: p.id === postazioneId ? 'inset 0 0 0 2px var(--t-accento)' : undefined }}>
                <MapPin size={15} style={{ color: 'var(--t-accento)' }} className="shrink-0" />
                {editId === p.id ? (
                  <>
                    <input value={editNome} onChange={e => setEditNome(e.target.value)} className="input py-0.5 text-sm flex-1" autoFocus onKeyDown={e => e.key === 'Enter' && salvaNome(p.id)} />
                    <button onClick={() => salvaNome(p.id)} className="btn-primary py-0.5 px-2 text-xs"><Save size={12} /> Salva</button>
                    <button onClick={() => setEditId(null)} className="btn-secondary py-0.5 px-1.5 text-xs"><X size={12} /></button>
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-sm flex-1" style={{ color: 'var(--t-titolo)' }}>{p.nome}</span>
                    {p.id === postazioneId
                      ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#dcfce7', color: '#166534' }}>attiva</span>
                      : <button onClick={() => setPostazioneId(p.id)} className="text-xs px-2 py-0.5 rounded border" style={{ borderColor: '#d6d3cc', color: 'var(--t-accento)' }}>Attiva</button>}
                    <button onClick={() => { setEditId(p.id); setEditNome(p.nome) }} className="p-1.5 rounded text-stone-500 hover:text-blue-600 hover:bg-blue-50" title="Rinomina"><Pencil size={13} /></button>
                    <button onClick={() => elimina(p)} className="p-1.5 rounded text-stone-500 hover:text-red-600 hover:bg-red-50" title="Elimina postazione"><Trash2 size={13} /></button>
                  </>
                )}
              </div>
            ))}
            {postazioni.length === 0 && <p className="text-sm text-stone-500">Nessuna postazione. Creane una qui sopra.</p>}
          </div>
        )}
      </div>

      {/* Blocco: Amministratori */}
      <AmministratoriBox user={user} />

      {/* Blocco: Supervisori (accesso all'amministrazione, per postazione) */}
      <SupervisoriBox />

      {/* Blocco: Anagrafica Utenti — tutte le identità del sistema (ricerca, sospensione, ecc.) */}
      <AnagraficaUtentiBox />

      {/* Blocco: Log Postazioni — storico eventi globali (non si cancella con la postazione) */}
      <div className="card p-4 space-y-3">
        <div>
          <h2 className="font-semibold text-stone-700 text-sm flex items-center gap-1.5"><ScrollText size={15} style={{ color: 'var(--t-accento)' }} /> Log Postazioni</h2>
          <p className="text-xs text-stone-500 mt-0.5">Storico di creazioni, rinomine ed eliminazioni delle postazioni, con autore e data.</p>
        </div>
        {logPost.length === 0 ? (
          <p className="text-sm text-stone-500">Nessun evento registrato.</p>
        ) : (
          <div className="space-y-1.5">
            {logPost.map(l => (
              <div key={l.id} className="px-2.5 py-1.5 rounded-lg" style={{ background: '#f4f6f1' }}>
                <div className="text-sm" style={{ color: 'var(--t-titolo)' }}>{l.messaggio}</div>
                <div className="text-[11px] text-stone-500 mt-0.5">{l.autore ? `${l.autore} · ` : ''}{fmtDT(l.createdAt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Riquadro gestione amministratori globali ───────────────────────
function AmministratoriBox({ user }: { user: AuthUser | null }) {
  const qc = useQueryClient()
  const { confirm, notify, confirmState } = useConfirm()
  const { data: utenti = [], isLoading } = useQuery<UtenteAdmin[]>({ queryKey: ['utenti'], queryFn: () => store.getUtenti() })
  const [nuovo, setNuovo] = useState('')
  const [busy, setBusy] = useState(false)
  const [nNome, setNNome] = useState('')
  const [nCognome, setNCognome] = useState('')
  const [nEmail, setNEmail] = useState('')

  const admins = utenti.filter(u => u.admin)
  const candidati = utenti.filter(u => !u.admin)
  // il proprietario (e te stesso) non sono rimovibili
  const protetto = (u: UtenteAdmin) => u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase() || u.id === user?.id

  async function promuovi() {
    if (!nuovo) return
    setBusy(true)
    try { await store.setUtenteAdmin(nuovo, true); setNuovo(''); await qc.invalidateQueries({ queryKey: ['utenti'] }) }
    catch (e) { void notify({ title: 'Operazione non riuscita', message: `Impossibile aggiungere l'amministratore. ${(e as Error).message ?? ''}` }) }
    finally { setBusy(false) }
  }
  async function rimuovi(u: UtenteAdmin) {
    const ok = await confirm({
      title: 'Rimuovi amministratore',
      message: `Vuoi togliere i permessi di amministratore a ${nomeCompleto(u)}? Tornerà un utente normale (mantiene le sue appartenenze nelle postazioni). Avrà effetto al suo prossimo accesso.`,
      confirmLabel: 'Rimuovi admin', danger: true,
    })
    if (!ok) return
    try { await store.setUtenteAdmin(u.id, false); await qc.invalidateQueries({ queryKey: ['utenti'] }) }
    catch (e) { void notify({ title: 'Operazione non riuscita', message: `Impossibile rimuovere l'amministratore. ${(e as Error).message ?? ''}` }) }
  }
  async function creaNuovo() {
    if (!nEmail.trim() || !nNome.trim()) return
    setBusy(true)
    try { await store.creaUtenteAdmin(nNome, nCognome, nEmail); setNNome(''); setNCognome(''); setNEmail(''); await qc.invalidateQueries({ queryKey: ['utenti'] }) }
    catch (e) { void notify({ title: 'Operazione non riuscita', message: `Impossibile creare l'amministratore. ${(e as Error).message ?? ''}` }) }
    finally { setBusy(false) }
  }

  return (
    <div className="card p-4 space-y-3">
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />
      <div>
        <h2 className="font-semibold text-stone-700 text-sm flex items-center gap-1.5"><ShieldCheck size={15} style={{ color: 'var(--t-accento)' }} /> Amministratori</h2>
        <p className="text-xs text-stone-500 mt-0.5">Un amministratore vede e gestisce <strong>tutto</strong>, in ogni postazione. Il tuo nominativo è permanente e non rimovibile.</p>
      </div>

      {isLoading ? <p className="text-sm text-stone-500">Caricamento…</p> : (
        <div className="space-y-1.5">
          {admins.map(u => (
            <div key={u.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: '#f4f6f1' }}>
              <Crown size={14} style={{ color: '#b8860b' }} fill="#facc15" />
              <span className="text-sm font-semibold" style={{ color: 'var(--t-titolo)' }}>{nomeCompleto(u)}</span>
              <span className="text-xs text-stone-500 hidden sm:inline">{u.email}</span>
              <div className="flex-1" />
              {protetto(u)
                ? <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#fef9c3', color: '#854d0e' }}><Lock size={10} /> permanente</span>
                : <button onClick={() => rimuovi(u)} className="p-1.5 rounded text-stone-500 hover:text-red-600 hover:bg-red-50" title="Rimuovi amministratore"><Trash2 size={13} /></button>}
            </div>
          ))}
          {admins.length === 0 && <p className="text-sm text-stone-500">Nessun amministratore.</p>}
        </div>
      )}

      {/* Aggiungi (promuove una persona già in elenco) */}
      <div className="flex items-end gap-2 pt-1">
        <div className="flex-1">
          <label className="label text-xs">Aggiungi amministratore</label>
          <select value={nuovo} onChange={e => setNuovo(e.target.value)} className="input text-sm">
            <option value="">— scegli una persona —</option>
            {candidati.map(u => <option key={u.id} value={u.id}>{nomeCompleto(u)}</option>)}
          </select>
        </div>
        <button onClick={promuovi} disabled={busy || !nuovo} className="btn-primary text-sm"><UserPlus size={15} /> Rendi admin</button>
      </div>
      {candidati.length === 0 && <p className="text-xs text-stone-400">Tutte le persone in elenco sono già amministratori.</p>}

      {/* Nuovo admin "puro" (persona non ancora nel sistema, senza appartenenze) */}
      <div className="pt-2 mt-1" style={{ borderTop: '1px solid var(--t-riga)' }}>
        <label className="label text-xs">Oppure aggiungi una persona non ancora nel sistema</label>
        <div className="flex flex-wrap items-end gap-2">
          <input value={nNome} onChange={e => setNNome(e.target.value)} placeholder="Nome" className="input text-sm" style={{ maxWidth: 120 }} />
          <input value={nCognome} onChange={e => setNCognome(e.target.value)} placeholder="Cognome" className="input text-sm" style={{ maxWidth: 130 }} />
          <input value={nEmail} onChange={e => setNEmail(e.target.value)} type="email" placeholder="email del login Google" className="input text-sm flex-1" style={{ minWidth: 170 }} onKeyDown={e => e.key === 'Enter' && creaNuovo()} />
          <button onClick={creaNuovo} disabled={busy || !nEmail.trim() || !nNome.trim()} className="btn-secondary text-sm"><UserPlus size={14} /> Crea admin</button>
        </div>
        <p className="text-[11px] text-stone-400 mt-1">Accederà con quell'account Google. Sarà <strong>solo</strong> amministratore, senza appartenenze a postazioni (a meno che tu non lo aggiunga al personale).</p>
      </div>
    </div>
  )
}

// ─── Riquadro Anagrafica Utenti — tutte le identità del sistema (solo admin) ───
//  Ricerca + elenco paginato (20/pag). Cliccando un utente si apre la scheda con le
//  sue postazioni (ruolo + icona, link al Personale), la modifica dei dati, la
//  sospensione reversibile dell'accesso e l'eliminazione definitiva.
const PAGINA_UTENTI = 20
function AnagraficaUtentiBox() {
  const { confirm, notify, confirmState } = useConfirm()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(0)
  const [aperto, setAperto] = useState<string | null>(null)

  // ricerca "debounced": aspetta che l'utente smetta di digitare (e torna a pagina 1)
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(0) }, 300)
    return () => clearTimeout(t)
  }, [search])

  const { data, isFetching } = useQuery({
    queryKey: ['anagrafica-utenti', debounced, page],
    queryFn: () => store.getUtentiAnagrafica(debounced, page * PAGINA_UTENTI, PAGINA_UTENTI),
    placeholderData: (prev) => prev,
  })
  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const nPagine = Math.max(1, Math.ceil(total / PAGINA_UTENTI))

  const { data: supervisori = [] } = useQuery<Supervisore[]>({ queryKey: ['supervisori'], queryFn: () => store.getSupervisori() })
  const supSet = useMemo(() => new Set(supervisori.map(s => s.id)), [supervisori])

  return (
    <div className="card p-4 space-y-3">
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />
      <div>
        <h2 className="font-semibold text-stone-700 text-sm flex items-center gap-1.5"><UsersRound size={15} style={{ color: 'var(--t-accento)' }} /> Anagrafica Utenti</h2>
        <p className="text-xs text-stone-500 mt-0.5">Tutte le persone registrate nel sistema. Cerca un nominativo per vederne le postazioni, <strong>sospendere l'accesso</strong> (mantenendo lo storico), correggerne i dati o eliminarlo.</p>
      </div>

      {/* ricerca */}
      <div className="relative">
        <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca per nome, cognome o email…" className="input text-sm" style={{ paddingLeft: 30 }} />
      </div>

      {/* elenco */}
      {rows.length === 0 ? (
        <p className="text-sm text-stone-500">{isFetching ? 'Caricamento…' : debounced ? 'Nessun utente trovato.' : 'Nessun utente.'}</p>
      ) : (
        <div className="space-y-1.5" style={{ opacity: isFetching ? 0.6 : 1 }}>
          {rows.map(u => (
            <div key={u.id} className="rounded-lg overflow-hidden" style={{ background: '#f4f6f1' }}>
              <button onClick={() => setAperto(aperto === u.id ? null : u.id)} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left">
                <UserRound size={15} className="shrink-0" style={{ color: u.attivo ? 'var(--t-accento)' : '#9ca3af' }} />
                <span className="text-sm font-semibold" style={{ color: u.attivo ? 'var(--t-titolo)' : '#9ca3af', textDecoration: u.attivo ? 'none' : 'line-through' }}>{nomeCompleto(u)}</span>
                {u.admin && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: '#fef9c3', color: '#854d0e' }}><Crown size={9} /> ADMIN</span>}
                {supSet.has(u.id) && !u.admin && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: '#e0f2fe', color: '#075985' }}><Shield size={9} /> SUPERV.</span>}
                {!u.attivo && <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>SOSPESO</span>}
                <span className="text-xs text-stone-400 hidden sm:inline truncate">{u.email}</span>
                <div className="flex-1" />
                <ChevronRight size={14} className="shrink-0 text-stone-400 transition-transform" style={{ transform: aperto === u.id ? 'rotate(90deg)' : 'none' }} />
              </button>
              {aperto === u.id && <SchedaUtente u={u} confirm={confirm} notify={notify} onChiudi={() => setAperto(null)} />}
            </div>
          ))}
        </div>
      )}

      {/* paginazione */}
      {total > PAGINA_UTENTI && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-stone-500">{total} utenti · pagina {page + 1} di {nPagine}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1.5 rounded border disabled:opacity-40" style={{ borderColor: '#d6d3cc', color: 'var(--t-accento)' }}><ChevronLeft size={14} /></button>
            <button onClick={() => setPage(p => Math.min(nPagine - 1, p + 1))} disabled={page >= nPagine - 1} className="p-1.5 rounded border disabled:opacity-40" style={{ borderColor: '#d6d3cc', color: 'var(--t-accento)' }}><ChevronRight size={14} /></button>
          </div>
        </div>
      )}
    </div>
  )
}

// Scheda del singolo utente: dati modificabili, postazioni (link al Personale),
// sospensione reversibile ed eliminazione definitiva.
function SchedaUtente({ u, confirm, notify, onChiudi }: {
  u: UtenteAnagrafica
  confirm: ReturnType<typeof useConfirm>['confirm']
  notify: ReturnType<typeof useConfirm>['notify']
  onChiudi: () => void
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { setPostazioneId } = usePostazione()
  const [nome, setNome] = useState(u.nome)
  const [cognome, setCognome] = useState(u.cognome)
  const [email, setEmail] = useState(u.email)
  const [busy, setBusy] = useState(false)

  const { data: membership = [], isLoading } = useQuery<MembershipUtente[]>({ queryKey: ['membership', u.id], queryFn: () => store.getMembershipUtente(u.id) })

  const modificato = nome.trim() !== u.nome || cognome.trim() !== u.cognome || email.trim().toLowerCase() !== u.email.toLowerCase()
  function refresh() { qc.invalidateQueries({ queryKey: ['anagrafica-utenti'] }); qc.invalidateQueries({ queryKey: ['utenti'] }); qc.invalidateQueries({ queryKey: ['membership', u.id] }) }

  async function salva() {
    if (!nome.trim() || !email.trim()) return
    setBusy(true)
    try { await store.aggiornaUtente(u.id, { nome, cognome, email }); refresh() }
    catch (e) { void notify({ title: 'Modifica non riuscita', message: (e as Error).message }) }
    finally { setBusy(false) }
  }
  async function toggleAttivo() {
    if (u.attivo) {
      const ok = await confirm({ title: 'Sospendi accesso', message: `${nomeCompleto(u)} non potrà più accedere all'app, da nessuna postazione. Tutto il suo storico (turni passati, ecc.) resta intatto e potrai riattivarlo quando vuoi.`, confirmLabel: 'Sospendi', danger: true })
      if (!ok) return
    }
    setBusy(true)
    try { await store.setUtenteAttivo(u.id, !u.attivo); refresh() }
    catch (e) { void notify({ title: 'Operazione non riuscita', message: (e as Error).message }) }
    finally { setBusy(false) }
  }
  async function elimina() {
    const ok = await confirm({ title: 'Elimina definitivamente', message: `Eliminare ${nomeCompleto(u)} dal sistema, in modo irreversibile? È consentito solo se non ha alcuno storico; se lavora o ha lavorato, usa invece la sospensione.`, confirmLabel: 'Elimina', danger: true })
    if (!ok) return
    setBusy(true)
    try { await store.eliminaUtenteDefinitivo(u.id); onChiudi(); refresh() }
    catch (e) { void notify({ title: 'Non eliminabile', message: (e as Error).message }) }
    finally { setBusy(false) }
  }
  function vai(m: MembershipUtente) { setPostazioneId(m.postazioneId); navigate('/admin/turnisti') }

  return (
    <div className="px-3 py-3 space-y-3" style={{ borderTop: '1px solid var(--t-riga)', background: '#fff' }}>
      {/* dati anagrafici */}
      <div className="flex flex-wrap items-end gap-2">
        <div><label className="label text-[11px]">Nome</label><input value={nome} onChange={e => setNome(e.target.value)} className="input text-sm" style={{ maxWidth: 130 }} /></div>
        <div><label className="label text-[11px]">Cognome</label><input value={cognome} onChange={e => setCognome(e.target.value)} className="input text-sm" style={{ maxWidth: 140 }} /></div>
        <div className="flex-1" style={{ minWidth: 160 }}><label className="label text-[11px]">Email (login)</label><input value={email} onChange={e => setEmail(e.target.value)} type="email" className="input text-sm w-full" /></div>
        <button onClick={salva} disabled={busy || !modificato || !nome.trim() || !email.trim()} className="btn-primary text-xs py-1.5 px-3"><Save size={13} /> Salva</button>
      </div>

      {/* postazioni */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-1">Postazioni</p>
        {isLoading ? <p className="text-xs text-stone-400">Caricamento…</p> : membership.length === 0 ? (
          <p className="text-xs text-stone-400 italic">Non è inserito in nessuna postazione.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {membership.map(m => (
              <button key={m.membershipId} onClick={() => vai(m)} title="Vai al Personale di questa postazione" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-transform hover:scale-105" style={{ background: '#f4f6f1', border: '1px solid var(--t-riga)', color: 'var(--t-testo)' }}>
                <IconaLivello livello={m.livello} size={12} />
                {m.postazioneNome}
                <span className="text-[10px] text-stone-400">· {m.livello}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* azioni */}
      <div className="flex flex-wrap gap-2 pt-2" style={{ borderTop: '1px dashed var(--t-riga)' }}>
        <button onClick={toggleAttivo} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-lg disabled:opacity-50" style={u.attivo ? { background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' } : { background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}>
          {u.attivo ? <><Ban size={13} /> Sospendi accesso</> : <><RotateCcw size={13} /> Riattiva accesso</>}
        </button>
        <button onClick={elimina} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-lg disabled:opacity-50" style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}>
          <Trash2 size={13} /> Elimina definitivamente
        </button>
      </div>
    </div>
  )
}

// ─── Riquadro gestione Supervisori (accesso all'amministrazione, per postazione) ───
function SupervisoriBox() {
  const qc = useQueryClient()
  const { confirm, notify, confirmState } = useConfirm()
  const { data: supervisori = [], isLoading } = useQuery<Supervisore[]>({ queryKey: ['supervisori'], queryFn: () => store.getSupervisori() })
  const { data: utenti = [] } = useQuery<UtenteAdmin[]>({ queryKey: ['utenti'], queryFn: () => store.getUtenti() })
  const { data: postazioni = [] } = useQuery<Postazione[]>({ queryKey: ['postazioni'], queryFn: () => store.getPostazioni() })
  const [nuovo, setNuovo] = useState('')
  const [nuovaPost, setNuovaPost] = useState('')
  const [busy, setBusy] = useState(false)
  const [espanso, setEspanso] = useState<string | null>(null)
  const [selMenu, setSelMenu] = useState('')   // postazione scelta nel menu "+ aggiungi" (riga in modifica)
  const [nNome, setNNome] = useState(''); const [nCognome, setNCognome] = useState(''); const [nEmail, setNEmail] = useState('')

  const TUTTE = '__tutte__'
  const postOrd = [...postazioni].sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
  const nomePost = (id: string) => postazioni.find(p => p.id === id)?.nome ?? '—'
  const postOrdinate = (ids: string[]) => [...ids].sort((a, b) => nomePost(a).localeCompare(nomePost(b), 'it'))
  const supIds = new Set(supervisori.map(s => s.id))
  // gli admin hanno già accesso a tutto: non ha senso elencarli come supervisori
  const candidati = utenti.filter(u => !u.admin && !supIds.has(u.id))
  const inval = () => qc.invalidateQueries({ queryKey: ['supervisori'] })

  async function aggiungi() {
    if (!nuovo) return
    setBusy(true)
    try {
      await store.addSupervisore(nuovo)
      if (nuovaPost === TUTTE) await store.setSupervisoreTutte(nuovo, true)
      else if (nuovaPost) await store.setSupervisorePostazioni(nuovo, [nuovaPost])
      setNuovo(''); setNuovaPost(''); await inval()
    }
    catch (e) { void notify({ title: 'Operazione non riuscita', message: `${(e as Error).message ?? ''}` }) }
    finally { setBusy(false) }
  }
  async function rimuovi(s: Supervisore) {
    const ok = await confirm({
      title: 'Rimuovi supervisore',
      message: `Togliere l'accesso all'amministrazione a ${nomeCompleto(s)}? Non potrà più entrare in Admin (effetto al prossimo accesso). Le sue appartenenze e i suoi turni restano intatti.`,
      confirmLabel: 'Rimuovi', danger: true,
    })
    if (!ok) return
    try { await store.removeSupervisore(s.id); if (espanso === s.id) setEspanso(null); await qc.invalidateQueries({ queryKey: ['supervisori'] }) }
    catch (e) { void notify({ title: 'Operazione non riuscita', message: `${(e as Error).message ?? ''}` }) }
  }
  // menu a tendina "+ aggiungi": una postazione, oppure «Tutte» (svuota le singole → ricompaiono nel menu)
  async function aggiungiDaMenu(s: Supervisore, val: string) {
    if (!val) return
    try {
      if (val === TUTTE) { await store.setSupervisorePostazioni(s.id, []); await store.setSupervisoreTutte(s.id, true) }
      else { if (s.tuttePostazioni) await store.setSupervisoreTutte(s.id, false); await store.setSupervisorePostazioni(s.id, [...s.postazioni, val]) }
      await inval()
    } catch (e) { void notify({ title: 'Errore', message: `${(e as Error).message ?? ''}` }) }
  }
  async function togliPostazione(s: Supervisore, pid: string) {
    try { await store.setSupervisorePostazioni(s.id, s.postazioni.filter(x => x !== pid)); await inval() }
    catch (e) { void notify({ title: 'Errore', message: `${(e as Error).message ?? ''}` }) }
  }
  async function togliTutte(s: Supervisore) {
    try { await store.setSupervisoreTutte(s.id, false); await inval() }
    catch (e) { void notify({ title: 'Errore', message: `${(e as Error).message ?? ''}` }) }
  }
  async function creaNuovo() {
    if (!nEmail.trim() || !nNome.trim()) return
    setBusy(true)
    try {
      await store.creaUtenteSupervisore(nNome, nCognome, nEmail)
      setNNome(''); setNCognome(''); setNEmail('')
      await qc.invalidateQueries({ queryKey: ['supervisori'] }); await qc.invalidateQueries({ queryKey: ['utenti'] })
    }
    catch (e) { void notify({ title: 'Operazione non riuscita', message: `${(e as Error).message ?? ''}` }) }
    finally { setBusy(false) }
  }

  return (
    <div className="card p-4 space-y-3">
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />
      <div>
        <h2 className="font-semibold text-stone-700 text-sm flex items-center gap-1.5"><Shield size={15} style={{ color: '#0284c7' }} fill="#7dd3fc" /> Supervisori</h2>
        <p className="text-xs text-stone-500 mt-0.5">Chi può <strong>entrare in amministrazione</strong> e gestire i turni delle postazioni indicate, a prescindere dal ruolo del mese. L'accesso è stabile e lo decidi solo tu. Gli <strong>admin</strong> hanno già accesso a tutto e non serve elencarli qui.</p>
      </div>

      {isLoading ? <p className="text-sm text-stone-500">Caricamento…</p> : (
        <div className="space-y-1.5">
          {supervisori.map(s => {
            const mod = espanso === s.id
            const disponibili = postOrd.filter(p => s.tuttePostazioni || !s.postazioni.includes(p.id))
            return (
              <div key={s.id} className="rounded-lg overflow-hidden" style={{ background: '#f4f6f1' }}>
                <div className="flex items-center gap-2 px-2.5 py-1.5">
                  <Shield size={14} style={{ color: '#0284c7' }} fill="#7dd3fc" className="shrink-0" />
                  <span className="text-sm font-semibold" style={{ color: 'var(--t-titolo)' }}>{nomeCompleto(s)}</span>
                  <span className="text-xs text-stone-500 hidden sm:inline">{s.email}</span>
                  <div className="flex-1" />
                  <button onClick={() => { setEspanso(mod ? null : s.id); setSelMenu('') }} className={`p-1.5 rounded ${mod ? 'text-blue-600 bg-blue-50' : 'text-stone-500 hover:text-blue-600 hover:bg-blue-50'}`} title="Modifica postazioni"><Pencil size={13} /></button>
                  <button onClick={() => rimuovi(s)} className="p-1.5 rounded text-stone-500 hover:text-red-600 hover:bg-red-50" title="Rimuovi supervisore"><Trash2 size={13} /></button>
                </div>
                {/* badge postazioni: sempre visibili, con X solo quando è in modifica (matita) */}
                <div className="flex flex-wrap items-center gap-1 px-2.5 pb-1.5">
                  {s.tuttePostazioni ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold pl-2 pr-1.5 py-0.5 rounded-full" style={{ background: '#dbeafe', color: '#1e40af' }}>
                      Tutte le postazioni
                      {mod && <button onClick={() => togliTutte(s)} className="rounded-full hover:bg-black/10 p-0.5" title="Togli"><X size={11} /></button>}
                    </span>
                  ) : s.postazioni.length ? postOrdinate(s.postazioni).map(pid => (
                    <span key={pid} className="inline-flex items-center gap-1 text-[11px] font-medium pl-2 pr-1.5 py-0.5 rounded-full" style={{ background: '#e6efe1', color: '#2f5227' }}>
                      {nomePost(pid)}
                      {mod && <button onClick={() => togliPostazione(s, pid)} className="rounded-full hover:bg-black/10 p-0.5" title="Togli"><X size={11} /></button>}
                    </span>
                  )) : <span className="text-[11px] text-stone-400 italic">nessuna postazione assegnata</span>}
                </div>
                {/* in modifica: menu a tendina + pulsante "Aggiungi" (una postazione o «Tutte») */}
                {mod && (
                  <div className="px-2.5 pb-2.5 flex items-center gap-2">
                    <select value={selMenu} onChange={e => setSelMenu(e.target.value)} className="input text-xs" style={{ maxWidth: 220 }}>
                      <option value="">— scegli postazione —</option>
                      {!s.tuttePostazioni && <option value={TUTTE}>Tutte le postazioni</option>}
                      {disponibili.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                    <button onClick={async () => { await aggiungiDaMenu(s, selMenu); setSelMenu('') }} disabled={!selMenu} className="btn-primary text-xs py-1 px-2.5"><Plus size={13} /> Aggiungi</button>
                  </div>
                )}
              </div>
            )
          })}
          {supervisori.length === 0 && <p className="text-sm text-stone-500">Nessun supervisore. Aggiungine uno qui sotto.</p>}
        </div>
      )}

      {/* Aggiungi da elenco: scegli persona (alfabetico) + postazione (o «Tutte») */}
      <div className="flex flex-wrap items-end gap-2 pt-1">
        <div className="flex-1" style={{ minWidth: 150 }}>
          <label className="label text-xs">Aggiungi supervisore</label>
          <select value={nuovo} onChange={e => setNuovo(e.target.value)} className="input text-sm">
            <option value="">— scegli una persona —</option>
            {candidati.map(u => <option key={u.id} value={u.id}>{nomeCompleto(u)}</option>)}
          </select>
        </div>
        <div className="flex-1" style={{ minWidth: 150 }}>
          <label className="label text-xs">Postazione</label>
          <select value={nuovaPost} onChange={e => setNuovaPost(e.target.value)} className="input text-sm">
            <option value="">— scegli postazione —</option>
            <option value={TUTTE}>Tutte le postazioni</option>
            {postOrd.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
        <button onClick={aggiungi} disabled={busy || !nuovo} className="btn-primary text-sm"><UserPlus size={15} /> Rendi supervisore</button>
      </div>
      {candidati.length === 0 && <p className="text-xs text-stone-400">Nessuna persona da aggiungere (gli altri sono già admin o supervisori).</p>}

      {/* Crea nuovo supervisore "puro" (persona non ancora nel sistema) */}
      <div className="pt-2 mt-1" style={{ borderTop: '1px solid var(--t-riga)' }}>
        <label className="label text-xs">Oppure aggiungi una persona non ancora nel sistema</label>
        <div className="flex flex-wrap items-end gap-2">
          <input value={nNome} onChange={e => setNNome(e.target.value)} placeholder="Nome" className="input text-sm" style={{ maxWidth: 120 }} />
          <input value={nCognome} onChange={e => setNCognome(e.target.value)} placeholder="Cognome" className="input text-sm" style={{ maxWidth: 130 }} />
          <input value={nEmail} onChange={e => setNEmail(e.target.value)} type="email" placeholder="email del login Google" className="input text-sm flex-1" style={{ minWidth: 170 }} onKeyDown={e => e.key === 'Enter' && creaNuovo()} />
          <button onClick={creaNuovo} disabled={busy || !nEmail.trim() || !nNome.trim()} className="btn-secondary text-sm"><UserPlus size={14} /> Crea supervisore</button>
        </div>
        <p className="text-[11px] text-stone-400 mt-1">Accederà con quell'account Google. Poi apri la <strong>matita</strong> accanto al suo nome per scegliere le postazioni (o spunta «Tutte»).</p>
      </div>
    </div>
  )
}
