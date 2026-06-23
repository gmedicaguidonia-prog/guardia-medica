import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil, Save, X, Users, Shield, User, UserCog, Lock, Crown } from 'lucide-react'
import { store } from '../../lib/store'
import { ADMIN_EMAIL } from '../../lib/constants'
import { LIVELLI, nomeCompleto, cmpTurnisti } from '../../types'
import { usePostazione } from '../../contexts/PostazioneContext'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmModal } from '../../components/ConfirmModal'
import type { Turnista, Livello, AuthUser } from '../../types'

const BADGE: Record<Livello, { bg: string; fg: string; Icon: React.ElementType }> = {
  admin:        { bg: '#fee2e2', fg: '#b91c1c', Icon: Crown },
  responsabile: { bg: '#fef3c7', fg: '#92400e', Icon: UserCog },
  turnista:     { bg: '#dbeafe', fg: '#1e40af', Icon: User },
  esterno:      { bg: '#dcfce7', fg: '#166534', Icon: Shield },
}

function LivelloBadge({ livello }: { livello: Livello }) {
  const { bg, fg, Icon } = BADGE[livello]
  const label = LIVELLI.find(l => l.value === livello)?.label ?? livello
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-medium"
      style={{ background: bg, color: fg }}>
      <Icon size={10} /> {label}
    </span>
  )
}

export function TurnistiPage() {
  const qc = useQueryClient()
  const { confirm, confirmState } = useConfirm()
  const { user } = useOutletContext<{ user: AuthUser | null }>()
  const { postazioneId } = usePostazione()
  const ioSonoPerpetuo = (user?.email ?? '').toLowerCase() === ADMIN_EMAIL

  const { data: turnisti = [], isLoading } = useQuery<Turnista[]>({
    queryKey: ['turnisti', postazioneId],
    queryFn: () => store.getTurnisti(postazioneId!),
    enabled: !!postazioneId,
  })

  // Elenco in ordine alfabetico per "Cognome Nome"
  const turnistiOrdinati = useMemo(() => [...turnisti].sort(cmpTurnisti), [turnisti])

  // Un utente non può assegnare un livello più alto del proprio:
  // solo l'Admin può creare/assegnare il livello Admin.
  const isAdminUser = user?.livello === 'admin'
  const livelliAssegnabili = isAdminUser ? LIVELLI : LIVELLI.filter(l => l.value !== 'admin')

  // Form "aggiungi"
  const [nome, setNome]         = useState('')
  const [cognome, setCognome]   = useState('')
  const [email, setEmail]       = useState('')
  const [livello, setLivello]   = useState<Livello>('turnista')
  const [errore, setErrore]     = useState('')
  const [saving, setSaving]     = useState(false)

  // Editing inline
  const [editId, setEditId]           = useState<string | null>(null)
  const [editNome, setEditNome]       = useState('')
  const [editCognome, setEditCognome] = useState('')
  const [editEmail, setEditEmail]     = useState('')
  const [editLiv, setEditLiv]         = useState<Livello>('turnista')

  async function refetch() { await qc.invalidateQueries({ queryKey: ['turnisti'] }) }

  async function aggiungi() {
    if (!nome.trim())    { setErrore('Inserisci il nome.'); return }
    if (!cognome.trim()) { setErrore('Inserisci il cognome.'); return }
    if (!email.trim())   { setErrore("Inserisci l'email."); return }
    setSaving(true); setErrore('')
    try {
      await store.addTurnista(postazioneId!, { nome, cognome, email, livello })
      setNome(''); setCognome(''); setEmail(''); setLivello('turnista')
      await refetch()
    } catch (e) { setErrore((e as Error).message) }
    finally { setSaving(false) }
  }

  function startEdit(t: Turnista) {
    setEditId(t.id); setEditNome(t.nome); setEditCognome(t.cognome); setEditEmail(t.email); setEditLiv(t.livello); setErrore('')
  }
  async function saveEdit() {
    if (!editNome.trim() || !editCognome.trim() || !editEmail.trim()) { setErrore('Nome, cognome ed email obbligatori.'); return }
    setSaving(true); setErrore('')
    try {
      await store.updateTurnista(editId!, { nome: editNome, cognome: editCognome, email: editEmail, livello: editLiv })
      setEditId(null); await refetch()
    } catch (e) { setErrore((e as Error).message) }
    finally { setSaving(false) }
  }

  async function elimina(t: Turnista) {
    if (t.email.toLowerCase() === ADMIN_EMAIL) return
    const ok = await confirm({
      title:        `Rimuovi ${nomeCompleto(t)}`,
      message:      `${nomeCompleto(t)} non potrà più accedere all'app. Sei sicuro?`,
      confirmLabel: 'Rimuovi',
      danger:       true,
    })
    if (!ok) return
    await store.deleteTurnista(t.id)
    await refetch()
  }

  if (!postazioneId) return <div className="max-w-3xl mx-auto p-6 text-sm text-stone-500">Caricamento postazione…</div>

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <ConfirmModal {...confirmState.opts} open={confirmState.open}
        onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: '#2b3c24' }}>
          <Users size={22} style={{ color: '#476540' }} /> Turnisti
        </h1>
        <p className="text-sm text-stone-600 mt-0.5">
          Solo le persone in questo elenco possono accedere con il proprio account Google.
        </p>
      </div>

      {errore && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{errore}</div>
      )}

      {/* ── Aggiungi ── */}
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold text-stone-700 text-sm">Aggiungi turnista</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="label text-xs">Nome *</label>
            <input value={nome} onChange={e => setNome(e.target.value)}
              placeholder="Mario" className="input text-sm"
              onKeyDown={e => e.key === 'Enter' && aggiungi()} />
          </div>
          <div>
            <label className="label text-xs">Cognome *</label>
            <input value={cognome} onChange={e => setCognome(e.target.value)}
              placeholder="Rossi" className="input text-sm"
              onKeyDown={e => e.key === 'Enter' && aggiungi()} />
          </div>
          <div>
            <label className="label text-xs">Email Google *</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email"
              placeholder="mario.rossi@gmail.com" className="input text-sm"
              onKeyDown={e => e.key === 'Enter' && aggiungi()} />
          </div>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="label text-xs">Livello</label>
            <select value={livello} onChange={e => setLivello(e.target.value as Livello)} className="input text-sm w-56">
              {livelliAssegnabili.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <button onClick={aggiungi} disabled={saving} className="btn-primary text-sm">
            <Plus size={15} /> Aggiungi
          </button>
        </div>
      </div>

      {/* ── Elenco ── */}
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

            {turnistiOrdinati.map(t => {
              const isPerm = t.email.toLowerCase() === ADMIN_EMAIL
              const canModify = isAdminUser || t.livello !== 'admin'

              if (editId === t.id) return (
                <tr key={t.id} className="bg-blue-50/40">
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1">
                      <input value={editCognome} onChange={e => setEditCognome(e.target.value)} className="input py-0.5 text-xs w-full" placeholder="Cognome" autoFocus />
                      <input value={editNome} onChange={e => setEditNome(e.target.value)} className="input py-0.5 text-xs w-full" placeholder="Nome" />
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={editEmail} onChange={e => setEditEmail(e.target.value)} type="email" className="input py-0.5 text-xs w-full" disabled={isPerm} />
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={editLiv} onChange={e => setEditLiv(e.target.value as Livello)} className="input py-0.5 text-xs w-full" disabled={isPerm}>
                      {livelliAssegnabili.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1 justify-end">
                      <button onClick={saveEdit} disabled={saving} className="btn-primary py-0.5 px-2 text-xs gap-1"><Save size={11} /> Salva</button>
                      <button onClick={() => setEditId(null)} className="btn-secondary py-0.5 px-1.5 text-xs"><X size={11} /></button>
                    </div>
                  </td>
                </tr>
              )

              return (
                <tr key={t.id} className="hover:bg-stone-50 group">
                  <td className="px-3 py-2 font-medium text-stone-800">{nomeCompleto(t)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-600">{t.email}</td>
                  <td className="px-3 py-2 text-center"><LivelloBadge livello={t.livello} /></td>
                  <td className="px-3 py-2">
                    {isPerm ? (
                      <div className="flex gap-2 items-center justify-end">
                        <span className="text-xs flex items-center gap-1 font-semibold" style={{ color: '#b91c1c' }}
                          title="Admin permanente: non eliminabile, modificabile solo da te"><Lock size={11} /> Permanente</span>
                        {ioSonoPerpetuo && (
                          <button onClick={() => startEdit(t)} className="p-1.5 rounded text-stone-500 hover:text-blue-600 hover:bg-blue-50" title="Modifica il tuo nominativo"><Pencil size={13} /></button>
                        )}
                      </div>
                    ) : canModify ? (
                      <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => startEdit(t)} className="p-1.5 rounded text-stone-500 hover:text-blue-600 hover:bg-blue-50" title="Modifica"><Pencil size={13} /></button>
                        <button onClick={() => elimina(t)} className="p-1.5 rounded text-stone-500 hover:text-red-600 hover:bg-red-50" title="Rimuovi"><Trash2 size={13} /></button>
                      </div>
                    ) : (
                      <div className="flex justify-end" title="Non puoi modificare un Admin"><Lock size={12} style={{ color: '#cbd5e1' }} /></div>
                    )}
                  </td>
                </tr>
              )
            })}

            {turnisti.length === 0 && !isLoading && (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-stone-500 text-sm">Nessun turnista. Aggiungine uno qui sopra.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
