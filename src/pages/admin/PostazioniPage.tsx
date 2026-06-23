import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, Plus, Trash2, Pencil, Save, X } from 'lucide-react'
import { store } from '../../lib/store'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmModal } from '../../components/ConfirmModal'
import { usePostazione } from '../../contexts/PostazioneContext'
import type { AuthUser, Postazione } from '../../types'

export function PostazioniPage() {
  const qc = useQueryClient()
  const { user } = useOutletContext<{ user: AuthUser | null }>()
  const { confirm, confirmState } = useConfirm()
  const { postazioneId, setPostazioneId } = usePostazione()

  const { data: postazioni = [], isLoading } = useQuery<Postazione[]>({ queryKey: ['postazioni'], queryFn: () => store.getPostazioni() })

  const [nuovoNome, setNuovoNome] = useState('')
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')

  async function crea() {
    if (!nuovoNome.trim()) return
    setSaving(true)
    try { const p = await store.creaPostazione(nuovoNome.trim()); setNuovoNome(''); await qc.invalidateQueries({ queryKey: ['postazioni'] }); setPostazioneId(p.id) }
    catch (e) { console.error(e); alert('Errore nella creazione.') }
    finally { setSaving(false) }
  }
  async function salvaNome(id: string) {
    if (!editNome.trim()) return
    await store.updatePostazione(id, { nome: editNome.trim() }); setEditId(null); await qc.invalidateQueries({ queryKey: ['postazioni'] })
  }
  async function elimina(p: Postazione) {
    const ok = await confirm({
      title: `Elimina «${p.nome}»`,
      message: `Verranno eliminati TUTTI i dati di questa postazione: personale (appartenenze), configurazioni, regole, desiderata e turni assegnati. L'operazione NON è reversibile.`,
      confirmLabel: 'Elimina tutto', danger: true,
    })
    if (!ok) return
    await store.deletePostazione(p.id); await qc.invalidateQueries({ queryKey: ['postazioni'] })
  }

  if (user?.livello !== 'admin') {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="card p-5 text-sm text-stone-600">Solo l'<strong>Admin</strong> può creare e gestire le postazioni.</div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: '#2b3c24' }}>
          <MapPin size={22} style={{ color: '#476540' }} /> Postazioni
        </h1>
        <p className="text-sm text-stone-600 mt-0.5">Ogni postazione ha il suo personale, turni, regole e desiderata. Seleziona quella attiva dal menu in alto; i <strong>Responsabili</strong> si assegnano dalla pagina <strong>Personale</strong> (livello Responsabile).</p>
      </div>

      {/* Crea */}
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold text-stone-700 text-sm">Nuova postazione</h2>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="label text-xs">Nome postazione</label>
            <input value={nuovoNome} onChange={e => setNuovoNome(e.target.value)} placeholder="Es. Tivoli" className="input text-sm" onKeyDown={e => e.key === 'Enter' && crea()} />
          </div>
          <button onClick={crea} disabled={saving || !nuovoNome.trim()} className="btn-primary text-sm"><Plus size={15} /> Crea postazione</button>
        </div>
      </div>

      {/* Elenco */}
      {isLoading ? <p className="text-sm text-stone-500">Caricamento…</p> : (
        <div className="space-y-3">
          {postazioni.map(p => (
            <div key={p.id} className="card p-4 flex items-center gap-2" style={p.id === postazioneId ? { boxShadow: 'inset 0 0 0 2px #476540' } : undefined}>
              <MapPin size={16} style={{ color: '#476540' }} className="shrink-0" />
              {editId === p.id ? (
                <>
                  <input value={editNome} onChange={e => setEditNome(e.target.value)} className="input py-0.5 text-sm flex-1" autoFocus onKeyDown={e => e.key === 'Enter' && salvaNome(p.id)} />
                  <button onClick={() => salvaNome(p.id)} className="btn-primary py-0.5 px-2 text-xs"><Save size={12} /> Salva</button>
                  <button onClick={() => setEditId(null)} className="btn-secondary py-0.5 px-1.5 text-xs"><X size={12} /></button>
                </>
              ) : (
                <>
                  <span className="font-bold text-sm flex-1" style={{ color: '#2b3c24' }}>{p.nome}</span>
                  {p.id === postazioneId && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#dcfce7', color: '#166534' }}>attiva</span>}
                  {p.id !== postazioneId && <button onClick={() => setPostazioneId(p.id)} className="text-xs px-2 py-0.5 rounded border" style={{ borderColor: '#d6d3cc', color: '#476540' }}>Attiva</button>}
                  <button onClick={() => { setEditId(p.id); setEditNome(p.nome) }} className="p-1.5 rounded text-stone-500 hover:text-blue-600 hover:bg-blue-50" title="Rinomina"><Pencil size={13} /></button>
                  <button onClick={() => elimina(p)} className="p-1.5 rounded text-stone-500 hover:text-red-600 hover:bg-red-50" title="Elimina postazione"><Trash2 size={13} /></button>
                </>
              )}
            </div>
          ))}
          {postazioni.length === 0 && <div className="card p-5 text-sm text-stone-500">Nessuna postazione. Creane una qui sopra.</div>}
        </div>
      )}
    </div>
  )
}
