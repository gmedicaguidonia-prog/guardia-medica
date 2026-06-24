import { Fragment, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil, Save, X, Users, Shield, User, UserCog, Crown, Search } from 'lucide-react'
import { store } from '../../lib/store'
import { LIVELLI_PERSONALE, nomeCompleto, gruppiPerLivello } from '../../types'
import { usePostazione } from '../../contexts/PostazioneContext'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmModal } from '../../components/ConfirmModal'
import type { Turnista, Livello, Utente, AuthUser } from '../../types'

const BADGE: Record<Livello, { bg: string; fg: string; Icon: React.ElementType }> = {
  admin:        { bg: '#fee2e2', fg: '#b91c1c', Icon: Crown },
  responsabile: { bg: '#fef3c7', fg: '#92400e', Icon: UserCog },
  turnista:     { bg: '#dbeafe', fg: '#1e40af', Icon: User },
  esterno:      { bg: '#dcfce7', fg: '#166534', Icon: Shield },
}
function LivelloBadge({ livello }: { livello: Livello }) {
  const { bg, fg, Icon } = BADGE[livello]
  const label = LIVELLI_PERSONALE.find(l => l.value === livello)?.label ?? livello
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-medium" style={{ background: bg, color: fg }}>
      <Icon size={10} /> {label}
    </span>
  )
}

export function TurnistiPage() {
  const qc = useQueryClient()
  const { confirm, confirmState } = useConfirm()
  const { postazioneId, postazioneAttiva } = usePostazione()
  useOutletContext<{ user: AuthUser | null }>()

  const { data: turnisti = [], isLoading } = useQuery<Turnista[]>({
    queryKey: ['turnisti', postazioneId], queryFn: () => store.getTurnisti(postazioneId!), enabled: !!postazioneId,
  })
  const gruppi = useMemo(() => gruppiPerLivello(turnisti), [turnisti])

  // ── Form aggiungi (con autocomplete sull'anagrafica globale) ──
  const [nome, setNome] = useState(''); const [cognome, setCognome] = useState(''); const [email, setEmail] = useState('')
  const [utenteId, setUtenteId] = useState<string | null>(null)
  const [livello, setLivello] = useState<Livello>('turnista')
  const [errore, setErrore] = useState(''); const [saving, setSaving] = useState(false)
  const [sugg, setSugg] = useState<Utente[]>([])

  async function cerca(term: string) {
    setUtenteId(null)
    if (term.trim().length < 3) { setSugg([]); return }
    try { setSugg(await store.searchUtenti(term)) } catch { setSugg([]) }
  }
  function scegli(u: Utente) { setNome(u.nome); setCognome(u.cognome); setEmail(u.email); setUtenteId(u.id); setSugg([]) }
  function resetForm() { setNome(''); setCognome(''); setEmail(''); setUtenteId(null); setLivello('turnista'); setSugg([]) }

  async function aggiungi() {
    if (!nome.trim() || !cognome.trim() || !email.trim()) { setErrore('Nome, cognome ed email obbligatori.'); return }
    setSaving(true); setErrore('')
    try {
      await store.addMembro(postazioneId!, { nome, cognome, email, livello, utenteId: utenteId ?? undefined })
      resetForm(); await qc.invalidateQueries({ queryKey: ['turnisti'] })
    } catch (e) { setErrore((e as Error).message) }
    finally { setSaving(false) }
  }

  // ── Edit inline ──
  const [editId, setEditId] = useState<string | null>(null)
  const [eNome, setENome] = useState(''); const [eCognome, setECognome] = useState(''); const [eEmail, setEEmail] = useState('')
  const [eUtente, setEUtente] = useState(''); const [eLiv, setELiv] = useState<Livello>('turnista')
  function startEdit(t: Turnista) { setEditId(t.id); setENome(t.nome); setECognome(t.cognome); setEEmail(t.email); setEUtente(t.utente_id); setELiv(t.livello); setErrore('') }
  async function salvaEdit() {
    if (!eNome.trim() || !eCognome.trim() || !eEmail.trim()) { setErrore('Nome, cognome ed email obbligatori.'); return }
    setSaving(true); setErrore('')
    try { await store.updateMembro(editId!, eUtente, { nome: eNome, cognome: eCognome, email: eEmail, livello: eLiv }); setEditId(null); await qc.invalidateQueries({ queryKey: ['turnisti'] }) }
    catch (e) { setErrore((e as Error).message) }
    finally { setSaving(false) }
  }
  async function rimuovi(t: Turnista) {
    const ok = await confirm({
      title: `Togli ${nomeCompleto(t)}`,
      message: `Rimuovere ${nomeCompleto(t)} dal personale di questa postazione? L'utente resta in anagrafica e nelle altre postazioni.`,
      confirmLabel: 'Togli', danger: true,
    })
    if (!ok) return
    await store.removeMembro(t.id); await qc.invalidateQueries({ queryKey: ['turnisti'] })
  }

  if (!postazioneId) return <div className="max-w-3xl mx-auto p-6 text-sm text-stone-500">Caricamento postazione…</div>

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: '#2b3c24' }}>
          <Users size={22} style={{ color: '#476540' }} className="shrink-0" /> Personale{postazioneAttiva ? ` - ${postazioneAttiva.nome}` : ''}
        </h1>
        <p className="text-sm text-stone-600 mt-0.5">Le persone abilitate per questa postazione. Cerca un nominativo già esistente o creane uno nuovo.</p>
      </div>

      {errore && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{errore}</div>}

      {/* ── Aggiungi ── */}
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold text-stone-700 text-sm">Aggiungi al personale</h2>
        <div className="relative">
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="label text-xs flex items-center gap-1"><Search size={11} /> Nome *</label>
              <input value={nome} onChange={e => { setNome(e.target.value); cerca(e.target.value) }} placeholder="Mario" className="input text-sm" />
            </div>
            <div>
              <label className="label text-xs flex items-center gap-1"><Search size={11} /> Cognome *</label>
              <input value={cognome} onChange={e => { setCognome(e.target.value); cerca(e.target.value) }} placeholder="Rossi" className="input text-sm" />
            </div>
            <div>
              <label className="label text-xs">Email Google *</label>
              <input value={email} onChange={e => { setEmail(e.target.value); setUtenteId(null) }} type="email" placeholder="mario.rossi@gmail.com" className="input text-sm" />
            </div>
          </div>
          {sugg.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 card p-1 shadow-xl max-h-56 overflow-auto" style={{ animation: 'fadeSlideIn 120ms ease-out' }}>
              <p className="text-[10px] uppercase tracking-wider font-bold text-stone-400 px-2 py-1">Già in anagrafica — clicca per usare</p>
              {sugg.map(u => (
                <button key={u.id} onClick={() => scegli(u)} className="flex items-center justify-between gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-stone-100 text-sm">
                  <span className="font-medium" style={{ color: '#2b3c24' }}>{nomeCompleto(u)}</span>
                  <span className="text-xs text-stone-400 font-mono">{u.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="label text-xs">Livello</label>
            <select value={livello} onChange={e => setLivello(e.target.value as Livello)} className="input text-sm w-56">
              {LIVELLI_PERSONALE.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          {utenteId && <span className="text-xs text-emerald-700 mb-2">✓ utente esistente</span>}
          <button onClick={aggiungi} disabled={saving} className="btn-primary text-sm ml-auto"><Plus size={15} /> Aggiungi</button>
        </div>
      </div>

      {/* ── Elenco (diviso per livello, alfabetico) ── */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-stone-600">Nominativo (Cognome Nome)</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-stone-600">Email</th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-stone-600 w-28">Livello</th>
              <th className="px-3 py-2 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && <tr><td colSpan={4} className="px-3 py-4 text-center text-stone-500">Caricamento…</td></tr>}

            {gruppi.map(g => (
              <Fragment key={g.liv}>
                <tr><td colSpan={4} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ background: '#f1efe7', color: BADGE[g.liv].fg }}>{g.label} · {g.items.length}</td></tr>
                {g.items.map(t => editId === t.id ? (
                  <tr key={t.id} className="bg-blue-50/40">
                    <td className="px-2 py-1.5">
                      <div className="flex gap-1">
                        <input value={eCognome} onChange={e => setECognome(e.target.value)} className="input py-0.5 text-xs w-full" placeholder="Cognome" autoFocus />
                        <input value={eNome} onChange={e => setENome(e.target.value)} className="input py-0.5 text-xs w-full" placeholder="Nome" />
                      </div>
                    </td>
                    <td className="px-2 py-1.5"><input value={eEmail} onChange={e => setEEmail(e.target.value)} type="email" className="input py-0.5 text-xs w-full" /></td>
                    <td className="px-2 py-1.5">
                      <select value={eLiv} onChange={e => setELiv(e.target.value as Livello)} className="input py-0.5 text-xs w-full">
                        {LIVELLI_PERSONALE.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex gap-1 justify-end">
                        <button onClick={salvaEdit} disabled={saving} className="btn-primary py-0.5 px-2 text-xs gap-1"><Save size={11} /> Salva</button>
                        <button onClick={() => setEditId(null)} className="btn-secondary py-0.5 px-1.5 text-xs"><X size={11} /></button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id} className="hover:bg-stone-50 group">
                    <td className="px-3 py-2 font-medium text-stone-800">{nomeCompleto(t)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">{t.email}</td>
                    <td className="px-3 py-2 text-center"><LivelloBadge livello={t.livello} /></td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => startEdit(t)} className="p-1.5 rounded text-stone-500 hover:text-blue-600 hover:bg-blue-50" title="Modifica"><Pencil size={13} /></button>
                        <button onClick={() => rimuovi(t)} className="p-1.5 rounded text-stone-500 hover:text-red-600 hover:bg-red-50" title="Togli dalla postazione"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}

            {turnisti.length === 0 && !isLoading && (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-stone-500 text-sm">Nessuno nel personale. Aggiungine uno qui sopra.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
