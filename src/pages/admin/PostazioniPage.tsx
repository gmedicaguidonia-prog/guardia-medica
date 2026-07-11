import { useState, useEffect } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, Plus, Trash2, Pencil, Save, X, Shield, ShieldCheck, UserPlus, Lock, Crown, SlidersHorizontal, ScrollText, Search, UserRound, UsersRound, Ban, RotateCcw, ChevronLeft, ChevronRight, DatabaseBackup, History, CalendarDays, Loader2, AlertTriangle } from 'lucide-react'
import { store } from '../../lib/store'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmModal } from '../../components/ConfirmModal'
import { IconaLivello } from '../../components/IconaLivello'
import { usePostazione } from '../../contexts/PostazioneContext'
import { ADMIN_EMAIL } from '../../lib/constants'
import { nomeCompleto } from '../../types'
import type { AuthUser, Postazione, UtenteAdmin, UtenteAnagrafica, MembershipUtente, Supervisore, LogPostazione, Livello, BackupGiorno, BackupInfo, BackupMese, UtenteOrfano } from '../../types'

function fmtDT(iso: string) {
  return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function meseLabel(mese: string) {
  const [a, m] = mese.split('-').map(Number)
  return new Date(a, m - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
}
function giornoLabel(g: string) {
  const [a, m, d] = g.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
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
  const [eliminaTarget, setEliminaTarget] = useState<Postazione | null>(null)

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
  async function eliminaConfermata(p: Postazione, utentiDaCancellare: string[]) {
    await store.eliminaPostazione(p.id, utentiDaCancellare)
    const suffix = utentiDaCancellare.length ? ` (con ${utentiDaCancellare.length} utente/i)` : ''
    await store.addLogPostazione(`Postazione «${p.nome}» eliminata${suffix}. Backup pre-eliminazione creato.`, nomeAutore)
    if (p.id === postazioneId) setPostazioneId(postazioni.find(x => x.id !== p.id)?.id ?? '')
    await qc.invalidateQueries({ queryKey: ['postazioni'] })
    await qc.invalidateQueries({ queryKey: ['log-postazioni'] })
    await qc.invalidateQueries({ queryKey: ['anagrafica-utenti'] })
  }

  if (user?.livello !== 'admin') {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="card p-5 text-sm text-stone-600">Solo l'<strong>Admin</strong> può accedere al <strong>Centro di Controllo</strong>.</div>
      </div>
    )
  }

  return (
    <div className="py-6 space-y-4" style={{ paddingLeft: '5%', paddingRight: '5%' }}>
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />
      {eliminaTarget && <EliminaPostazioneModal postazione={eliminaTarget} onChiudi={() => setEliminaTarget(null)} onConferma={eliminaConfermata} />}

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--t-titolo)' }}>
          <SlidersHorizontal size={22} style={{ color: 'var(--t-accento)' }} /> Centro di Controllo
        </h1>
        <p className="text-sm text-stone-600 mt-0.5">Le impostazioni generali del programma, divise per funzione.</p>
      </div>

      {/* Sezioni del Centro di Controllo: impaginazione liquida a colonne (2–3 in base
          alla larghezza), ogni sezione con uno sfondo pastello molto trasparente. */}
      <div className="columns-1 md:columns-2 xl:columns-3" style={{ columnGap: 16 }}>

      {/* Blocco: Postazioni */}
      <div className="card p-4 space-y-3" style={{ background: '#60a5fa1f', breakInside: 'avoid', marginBottom: 18 }}>
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
                    <button onClick={() => setEliminaTarget(p)} className="p-1.5 rounded text-stone-500 hover:text-red-600 hover:bg-red-50" title="Elimina postazione"><Trash2 size={13} /></button>
                  </>
                )}
              </div>
            ))}
            {postazioni.length === 0 && <p className="text-sm text-stone-500">Nessuna postazione. Creane una qui sopra.</p>}
          </div>
        )}
      </div>

      {/* Blocco: Backup & Ripristino (solo admin) */}
      <BackupBox />

      {/* Blocco: Amministratori */}
      <AmministratoriBox user={user} />

      {/* Blocco: Supervisori (accesso all'amministrazione, per postazione) */}
      <SupervisoriBox />

      {/* Blocco: Anagrafica Utenti — tutte le identità del sistema (ricerca, sospensione, ecc.) */}
      <AnagraficaUtentiBox />

      {/* Blocco: Log Postazioni — storico eventi globali (non si cancella con la postazione) */}
      <div className="card p-4 space-y-3" style={{ background: '#a78bfa1f', breakInside: 'avoid', marginBottom: 18 }}>
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
    <div className="card p-4 space-y-3" style={{ background: '#fbbf241f', breakInside: 'avoid', marginBottom: 18 }}>
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
// Etichetta + colore del ruolo complessivo mostrato nell'elenco (l'ordinamento è nel data layer).
const RUOLO_META: Record<string, { label: string; color: string }> = {
  admin:        { label: 'Admin',        color: '#a16207' },
  supervisore:  { label: 'Supervisore',  color: '#0369a1' },
  responsabile: { label: 'Responsabile', color: '#ca8a04' },
  turnista:     { label: 'Turnista',     color: '#1e40af' },
  esterno:      { label: 'Esterno',      color: '#166534' },
  '—':          { label: 'Nessun ruolo', color: '#9ca3af' },
}
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

  return (
    <div className="card p-4 space-y-3" style={{ background: '#34d3991f', breakInside: 'avoid', marginBottom: 18 }}>
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
          {rows.map(u => {
            const meta = RUOLO_META[u.ruolo] ?? RUOLO_META['—']
            return (
            <div key={u.id} className="rounded-lg overflow-hidden" style={{ background: '#f4f6f1' }}>
              <button onClick={() => setAperto(aperto === u.id ? null : u.id)} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left">
                {u.ruolo === 'supervisore'
                  ? <Shield size={15} className="shrink-0" style={{ color: u.attivo ? meta.color : '#9ca3af' }} />
                  : u.ruolo === '—'
                    ? <UserRound size={15} className="shrink-0" style={{ color: '#9ca3af' }} />
                    : <IconaLivello livello={u.ruolo as Livello} size={15} className="shrink-0" color={u.attivo ? undefined : '#9ca3af'} />}
                <span className="text-sm font-semibold" style={{ color: u.attivo ? 'var(--t-titolo)' : '#9ca3af', textDecoration: u.attivo ? 'none' : 'line-through' }}>{nomeCompleto(u)}</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: meta.color + '22', color: meta.color }}>{meta.label}</span>
                {!u.attivo && <span className="text-[9px] font-bold px-1 py-0.5 rounded shrink-0" style={{ background: '#fee2e2', color: '#b91c1c' }}>SOSPESO</span>}
                <span className="text-xs text-stone-400 hidden sm:inline truncate">{u.email}</span>
                <div className="flex-1" />
                <ChevronRight size={14} className="shrink-0 text-stone-400 transition-transform" style={{ transform: aperto === u.id ? 'rotate(90deg)' : 'none' }} />
              </button>
              {aperto === u.id && <SchedaUtente u={u} confirm={confirm} notify={notify} onChiudi={() => setAperto(null)} />}
            </div>
            )
          })}
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
    <div className="card p-4 space-y-3" style={{ background: '#38bdf81f', breakInside: 'avoid', marginBottom: 18 }}>
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

// ─── Riquadro Backup & Ripristino (solo admin) ──────────────────────
//  Backup notturno automatico (un JSON completo per postazione, per giorno).
//  Qui: retention configurabile, backup manuale immediato e ripristino guidato.
function BackupBox() {
  const { notify, confirmState } = useConfirm()
  const [retention, setRetention] = useState<number | null>(null)
  const [retInput, setRetInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)

  useEffect(() => { store.getBackupRetention().then(g => { setRetention(g); setRetInput(String(g)) }).catch(() => {}) }, [])

  async function salvaRetention() {
    const g = Math.max(1, Math.min(3650, parseInt(retInput, 10) || 0))
    setBusy(true)
    try { await store.setBackupRetention(g); setRetention(g); setRetInput(String(g)); void notify({ title: 'Salvato', message: `I backup giornalieri saranno conservati per ${g} giorni.` }) }
    catch (e) { void notify({ title: 'Errore', message: (e as Error).message }) }
    finally { setBusy(false) }
  }
  async function backupOra() {
    setBusy(true)
    try { const n = await store.backupOraTutte(); void notify({ title: 'Backup eseguito', message: `Salvato il backup di ${n} postazione/i.` }) }
    catch (e) { void notify({ title: 'Errore', message: (e as Error).message }) }
    finally { setBusy(false) }
  }

  return (
    <div className="card p-4 space-y-3" style={{ background: '#f472b61f', breakInside: 'avoid', marginBottom: 18 }}>
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />
      {restoreOpen && <RestoreModal onChiudi={() => setRestoreOpen(false)} />}
      <div>
        <h2 className="font-semibold text-stone-700 text-sm flex items-center gap-1.5"><DatabaseBackup size={15} style={{ color: 'var(--t-accento)' }} /> Backup &amp; Ripristino</h2>
        <p className="text-xs text-stone-500 mt-0.5">Ogni notte viene salvato un backup <strong>completo</strong> di ogni postazione (un file per postazione, per giorno): personale, configurazioni, regole, impaginazione, desiderata, turni, cambi e finalizzazioni. Alla cancellazione di una postazione ne viene fatto uno automatico.</p>
      </div>

      {/* retention */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="label text-xs">Conserva i backup per (giorni)</label>
          <input type="number" min={1} max={3650} value={retInput} onChange={e => setRetInput(e.target.value)} className="input text-sm" onKeyDown={e => e.key === 'Enter' && salvaRetention()} />
        </div>
        <button onClick={salvaRetention} disabled={busy || retInput === '' || Number(retInput) === retention} className="btn-secondary text-sm"><Save size={14} /> Salva</button>
      </div>
      <p className="text-[11px] text-stone-400">I backup più vecchi di questo limite vengono eliminati automaticamente ad ogni backup notturno.</p>

      {/* azioni */}
      <div className="flex flex-wrap gap-2 pt-2" style={{ borderTop: '1px solid var(--t-riga)' }}>
        <button onClick={backupOra} disabled={busy} className="btn-primary text-sm">{busy ? <Loader2 size={15} className="animate-spin" /> : <DatabaseBackup size={15} />} Esegui backup ora</button>
        <button onClick={() => setRestoreOpen(true)} disabled={busy} className="btn-secondary text-sm"><History size={15} /> Ripristina da backup…</button>
      </div>
    </div>
  )
}

// Modal di ripristino: giorno → postazione → «intera» (solo se eliminata) oppure un singolo mese.
function RestoreModal({ onChiudi }: { onChiudi: () => void }) {
  const qc = useQueryClient()
  const { confirm, notify, confirmState } = useConfirm()
  const [giorni, setGiorni] = useState<BackupGiorno[] | null>(null)
  const [giorno, setGiorno] = useState<string | null>(null)
  const [items, setItems] = useState<BackupInfo[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [mesiOpen, setMesiOpen] = useState<string | null>(null)
  const [mesi, setMesi] = useState<Record<string, BackupMese[]>>({})

  useEffect(() => { store.getBackupGiorni().then(setGiorni).catch(() => setGiorni([])) }, [])
  async function apriGiorno(g: string) { setGiorno(g); setItems(null); setMesiOpen(null); setItems(await store.getBackupDelGiorno(g)) }
  async function apriMesi(b: BackupInfo) {
    if (mesiOpen === b.id) { setMesiOpen(null); return }
    setMesiOpen(b.id)
    if (!mesi[b.id]) { const m = await store.getBackupMesi(b.id); setMesi(prev => ({ ...prev, [b.id]: m })) }
  }
  function refresh() { qc.invalidateQueries({ queryKey: ['postazioni'] }); qc.invalidateQueries({ queryKey: ['log-postazioni'] }) }

  async function ripristinaIntera(b: BackupInfo) {
    const ok = await confirm({ title: `Ripristina «${b.postazioneNome}»`, message: `Verrà ricreata l'intera postazione «${b.postazioneNome}» com'era nel backup del ${giornoLabel(giorno!)}: personale, turni, configurazioni, tutto. Procedere?`, confirmLabel: 'Ripristina tutto' })
    if (!ok) return
    setBusy(true)
    try { await store.ripristinaPostazioneIntera(b.id); refresh(); void notify({ title: 'Ripristino completato', message: `«${b.postazioneNome}» è stata ripristinata.` }); onChiudi() }
    catch (e) { void notify({ title: 'Ripristino non riuscito', message: (e as Error).message }); setBusy(false) }
  }
  async function ripristinaMese(b: BackupInfo, mese: string) {
    const ok = await confirm({ title: `Ripristina ${meseLabel(mese)}`, message: `Verranno ripristinati i dati di ${meseLabel(mese)} per «${b.postazioneNome}» dal backup del ${giornoLabel(giorno!)}. I dati non finalizzati di quel mese verranno reintegrati. Procedere?`, confirmLabel: 'Ripristina il mese' })
    if (!ok) return
    setBusy(true)
    try { await store.ripristinaPostazioneMese(b.id, mese); refresh(); void notify({ title: 'Ripristino completato', message: `${meseLabel(mese)} di «${b.postazioneNome}» ripristinato.` }); onChiudi() }
    catch (e) { void notify({ title: 'Ripristino non riuscito', message: (e as Error).message }); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onChiudi}>
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />
      <div className="card w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg flex items-center gap-2" style={{ color: 'var(--t-titolo)' }}><History size={18} style={{ color: 'var(--t-accento)' }} /> Ripristina da backup</h3>
          <button onClick={onChiudi} className="p-1.5 rounded hover:bg-stone-100 text-stone-500"><X size={18} /></button>
        </div>

        {/* step 1: giorni */}
        {!giorno && (
          giorni === null ? <p className="text-sm text-stone-500">Caricamento…</p> :
          giorni.length === 0 ? <p className="text-sm text-stone-500">Nessun backup disponibile. Esegui un backup manuale o attendi quello notturno.</p> : (
            <div className="space-y-1.5">
              <p className="text-xs text-stone-500">Scegli il giorno del backup:</p>
              {giorni.map(g => (
                <button key={g.giorno} onClick={() => apriGiorno(g.giorno)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:brightness-95" style={{ background: '#f4f6f1' }}>
                  <CalendarDays size={15} style={{ color: 'var(--t-accento)' }} />
                  <span className="text-sm font-semibold capitalize" style={{ color: 'var(--t-titolo)' }}>{giornoLabel(g.giorno)}</span>
                  <div className="flex-1" />
                  <span className="text-xs text-stone-500">{g.nPostazioni} post.</span>
                  <ChevronRight size={14} className="text-stone-400" />
                </button>
              ))}
            </div>
          )
        )}

        {/* step 2: postazioni del giorno */}
        {giorno && (
          <div className="space-y-2">
            <button onClick={() => { setGiorno(null); setItems(null) }} className="text-xs inline-flex items-center gap-1 text-stone-500 hover:text-stone-700"><ChevronLeft size={13} /> altri giorni</button>
            <p className="text-xs text-stone-500 capitalize">Backup del <strong>{giornoLabel(giorno)}</strong>:</p>
            {items === null ? <p className="text-sm text-stone-500">Caricamento…</p> : items.map(b => (
              <div key={b.id} className="rounded-lg overflow-hidden" style={{ background: '#f4f6f1' }}>
                <div className="flex items-center gap-2 px-3 py-2">
                  <MapPin size={15} style={{ color: 'var(--t-accento)' }} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--t-titolo)' }}>{b.postazioneNome}</span>
                  {b.esiste
                    ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#dcfce7', color: '#166534' }}>esiste</span>
                    : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#fee2e2', color: '#b91c1c' }}>eliminata</span>}
                </div>
                <div className="px-3 pb-2.5 flex flex-wrap gap-2 items-center">
                  {b.esiste
                    ? <span className="text-[11px] text-stone-400 italic">La postazione esiste ancora: puoi ripristinare un singolo mese.</span>
                    : <button onClick={() => ripristinaIntera(b)} disabled={busy} className="btn-primary text-xs py-1 px-2.5"><RotateCcw size={12} /> Ripristina intera</button>}
                  <button onClick={() => apriMesi(b)} disabled={busy} className="btn-secondary text-xs py-1 px-2.5"><CalendarDays size={12} /> {mesiOpen === b.id ? 'Nascondi mesi' : 'Ripristina un mese'}</button>
                </div>
                {mesiOpen === b.id && (
                  <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                    {!mesi[b.id] ? <span className="text-xs text-stone-400">Caricamento…</span> :
                     mesi[b.id].length === 0 ? <span className="text-xs text-stone-400 italic">Nessun mese con turni nel backup.</span> :
                     mesi[b.id].map(m => (
                       <button key={m.mese} onClick={() => ripristinaMese(b, m.mese)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium capitalize" style={{ background: '#fff', border: '1px solid var(--t-riga)', color: 'var(--t-testo)' }} title={`${m.nTurni} turni`}>
                         <RotateCcw size={11} /> {meseLabel(m.mese)} <span className="text-[10px] text-stone-400">· {m.nTurni}t</span>
                       </button>
                     ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {busy && <p className="text-xs text-stone-500 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Operazione in corso…</p>}
      </div>
    </div>
  )
}

// Modal di eliminazione postazione: avviso + backup automatico + scelta degli utenti
// che appartengono SOLO a questa postazione (cancellabili insieme ad essa).
function EliminaPostazioneModal({ postazione, onChiudi, onConferma }: {
  postazione: Postazione
  onChiudi: () => void
  onConferma: (p: Postazione, utenti: string[]) => Promise<void>
}) {
  const { notify, confirmState } = useConfirm()
  const [orfani, setOrfani] = useState<UtenteOrfano[] | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => { store.getUtentiOrfaniPostazione(postazione.id).then(setOrfani).catch(() => setOrfani([])) }, [postazione.id])

  function toggle(id: string) { setSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }

  async function esegui() {
    setBusy(true)
    try { await onConferma(postazione, [...sel]) }
    catch (e) { void notify({ title: 'Eliminazione non riuscita', message: (e as Error).message }); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={busy ? undefined : onChiudi}>
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />
      <div className="card w-full max-w-md max-h-[85vh] overflow-y-auto p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-lg flex items-center gap-2" style={{ color: '#b91c1c' }}><AlertTriangle size={18} /> Elimina «{postazione.nome}»</h3>
        <div className="text-sm space-y-2" style={{ color: '#5a5a4a' }}>
          <p>Verranno eliminati <strong>tutti</strong> i dati di questa postazione: personale, configurazioni, regole, impaginazione, desiderata, turni, cambi e finalizzazioni.</p>
          <p className="flex items-start gap-1.5 rounded-lg p-2" style={{ background: '#ecfdf5', color: '#065f46' }}><DatabaseBackup size={15} className="shrink-0 mt-0.5" /> Prima dell'eliminazione viene creato automaticamente un <strong>backup</strong>, così potrai ripristinarla per intero.</p>
        </div>

        {/* utenti orfani (solo qui) */}
        <div className="pt-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-1">Utenti presenti solo qui</p>
          {orfani === null ? <p className="text-xs text-stone-400">Caricamento…</p> :
           orfani.length === 0 ? <p className="text-xs text-stone-400 italic">Nessun utente appartiene esclusivamente a questa postazione: tutte le identità restano nel sistema.</p> : (
            <>
              <p className="text-xs text-stone-500 mb-1.5">Questi utenti non appartengono a nessun'altra postazione. Spunta quelli che vuoi <strong>eliminare</strong> dal sistema insieme alla postazione; gli altri restano come identità (senza appartenenze).</p>
              <div className="space-y-1">
                {orfani.map(u => (
                  <label key={u.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer" style={{ background: sel.has(u.id) ? '#fee2e2' : '#f4f6f1' }}>
                    <input type="checkbox" checked={sel.has(u.id)} onChange={() => toggle(u.id)} />
                    {u.livello && <IconaLivello livello={u.livello} size={14} />}
                    <span className="text-sm font-medium" style={{ color: 'var(--t-titolo)' }}>{u.nome} {u.cognome}</span>
                    <span className="text-xs text-stone-400 hidden sm:inline truncate">{u.email}</span>
                    <div className="flex-1" />
                    <span className="text-[10px] text-stone-400 shrink-0">{u.nTurni} turni</span>
                  </label>
                ))}
              </div>
            </>
           )}
        </div>

        <div className="flex justify-between items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--t-riga)' }}>
          <span className="text-xs text-stone-400">{sel.size > 0 ? `${sel.size} utente/i da eliminare` : 'Nessun utente da eliminare'}</span>
          <div className="flex gap-2">
            <button onClick={onChiudi} disabled={busy} className="btn-secondary text-sm">Annulla</button>
            <button onClick={esegui} disabled={busy || orfani === null} className="btn-danger text-sm inline-flex items-center gap-1.5">{busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Elimina postazione</button>
          </div>
        </div>
      </div>
    </div>
  )
}
