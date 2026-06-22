import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Clock, Moon, Sun, Users as UsersIcon, CalendarClock } from 'lucide-react'
import { store } from '../../lib/store'
import { RICORRENZE } from '../../types'
import { GIORNI_SETTIMANA } from '../../lib/constants'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmModal } from '../../components/ConfirmModal'
import type { TurnoSchema, Ricorrenza } from '../../types'

/**
 * Card di un singolo turno dello schema. Tiene uno stato locale dei campi e
 * lo salva nel data-layer ad ogni modifica (write-through), SENZA invalidare
 * la query: così l'input non perde il focus mentre scrivi. La lista si
 * ricarica solo su aggiungi/elimina.
 */
function TurnoCard({ turno, onDelete }: { turno: TurnoSchema; onDelete: () => void }) {
  const [form, setForm] = useState<TurnoSchema>(turno)

  function patch(p: Partial<TurnoSchema>) {
    const next = { ...form, ...p }
    setForm(next)
    store.updateTurnoSchema(turno.id, p)   // persiste subito (localStorage)
  }

  function toggleGiorno(num: number) {
    const set = new Set(form.giorni_custom)
    set.has(num) ? set.delete(num) : set.add(num)
    patch({ giorni_custom: [...set].sort((a, b) => a - b) })
  }

  const overnight = form.ora_fine <= form.ora_inizio

  return (
    <div className="card p-4">
      {/* Riga 1: nome + elimina */}
      <div className="flex items-center gap-2 mb-3">
        {overnight ? <Moon size={18} style={{ color: '#476540' }} /> : <Sun size={18} style={{ color: '#476540' }} />}
        <input
          value={form.nome}
          onChange={e => patch({ nome: e.target.value })}
          placeholder="Nome del turno (es. Notte)"
          className="input text-sm font-semibold flex-1"
        />
        <button onClick={onDelete}
          className="p-2 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
          title="Elimina turno">
          <Trash2 size={16} />
        </button>
      </div>

      {/* Riga 2: orari + n turnisti */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="label text-xs flex items-center gap-1"><Clock size={12} /> Inizio</label>
          <input type="time" value={form.ora_inizio} onChange={e => patch({ ora_inizio: e.target.value })} className="input text-sm" />
        </div>
        <div>
          <label className="label text-xs flex items-center gap-1"><Clock size={12} /> Fine</label>
          <input type="time" value={form.ora_fine} onChange={e => patch({ ora_fine: e.target.value })} className="input text-sm" />
          {overnight && <p className="text-[10px] text-stone-400 mt-0.5">termina il giorno dopo</p>}
        </div>
        <div>
          <label className="label text-xs flex items-center gap-1"><UsersIcon size={12} /> N° turnisti</label>
          <input type="number" min={1} value={form.n_turnisti}
            onChange={e => patch({ n_turnisti: Math.max(1, parseInt(e.target.value) || 1) })}
            className="input text-sm" />
        </div>
      </div>

      {/* Riga 3: ricorrenza */}
      <div>
        <label className="label text-xs">Quando si applica</label>
        <select value={form.ricorrenza} onChange={e => patch({ ricorrenza: e.target.value as Ricorrenza })} className="input text-sm">
          {RICORRENZE.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>

        {form.ricorrenza === 'custom' && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {GIORNI_SETTIMANA.map(g => {
              const on = form.giorni_custom.includes(g.num)
              return (
                <button key={g.num} onClick={() => toggleGiorno(g.num)}
                  className="px-2.5 py-1 rounded-md text-xs font-medium border transition-colors"
                  style={on
                    ? { background: '#476540', color: '#fff', borderColor: '#456b3a' }
                    : { background: '#faf8f3', color: '#5a5a4a', borderColor: '#d6cdba' }}>
                  {g.abbr}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export function SchemaTurniPage() {
  const qc = useQueryClient()
  const { confirm, confirmState } = useConfirm()

  const { data: schema = [], isLoading } = useQuery<TurnoSchema[]>({
    queryKey: ['schema'],
    queryFn: () => store.getSchema(),
  })

  async function aggiungiTurno() {
    await store.addTurnoSchema({
      nome: '', ora_inizio: '08:00', ora_fine: '20:00',
      n_turnisti: 1, ricorrenza: 'tutti', giorni_custom: [],
    })
    await qc.invalidateQueries({ queryKey: ['schema'] })
  }

  async function eliminaTurno(t: TurnoSchema) {
    const ok = await confirm({
      title:        'Elimina turno',
      message:      `Vuoi eliminare il turno "${t.nome || 'senza nome'}" dallo schema?`,
      confirmLabel: 'Elimina',
      danger:       true,
    })
    if (!ok) return
    await store.deleteTurnoSchema(t.id)
    await qc.invalidateQueries({ queryKey: ['schema'] })
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <ConfirmModal {...confirmState.opts} open={confirmState.open}
        onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: '#2b3c24' }}>
            <CalendarClock size={22} style={{ color: '#476540' }} /> Configurazione Turni
          </h1>
          <p className="text-sm text-stone-600 mt-0.5 max-w-xl">
            Definisci i turni della guardia medica: nome, orari, quanti turnisti servono e in quali
            giorni si applicano. Questo schema verrà usato per generare i turni mese per mese.
          </p>
        </div>
        <button onClick={aggiungiTurno} className="btn-primary text-sm shrink-0">
          <Plus size={16} /> Aggiungi turno
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-stone-500">Caricamento…</p>
      ) : schema.length === 0 ? (
        <div className="card p-8 text-center">
          <CalendarClock size={32} className="mx-auto mb-2" style={{ color: '#9ab488' }} />
          <p className="text-sm text-stone-500 mb-3">Nessun turno definito.</p>
          <button onClick={aggiungiTurno} className="btn-primary text-sm mx-auto">
            <Plus size={16} /> Crea il primo turno
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {schema.map(t => (
            <TurnoCard key={t.id} turno={t} onDelete={() => eliminaTurno(t)} />
          ))}
        </div>
      )}
    </div>
  )
}
