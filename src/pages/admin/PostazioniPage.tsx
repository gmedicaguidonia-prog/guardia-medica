import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, Plus, Trash2, Pencil, Save, X, Shield, ShieldCheck, UserPlus, Lock, Crown, SlidersHorizontal, ScrollText } from 'lucide-react'
import { store } from '../../lib/store'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmModal } from '../../components/ConfirmModal'
import { usePostazione } from '../../contexts/PostazioneContext'
import { ADMIN_EMAIL } from '../../lib/constants'
import { nomeCompleto } from '../../types'
import type { AuthUser, Postazione, UtenteAdmin, Supervisore, LogPostazione } from '../../types'

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
