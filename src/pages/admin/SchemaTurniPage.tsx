import { useState, useMemo, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Clock, Moon, Sun, Users as UsersIcon, CalendarClock, Save, AlertTriangle } from 'lucide-react'
import { store } from '../../lib/store'
import { RICORRENZE } from '../../types'
import { GIORNI_SETTIMANA } from '../../lib/constants'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmModal } from '../../components/ConfirmModal'
import { useUnsaved } from '../../contexts/UnsavedContext'
import type { TurnoSchema, Ricorrenza } from '../../types'

function eqDays(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort((x, y) => x - y), sb = [...b].sort((x, y) => x - y)
  return sa.every((v, i) => v === sb[i])
}
function sameTurno(a: TurnoSchema, b: TurnoSchema): boolean {
  return a.nome === b.nome && a.ora_inizio === b.ora_inizio && a.ora_fine === b.ora_fine &&
    a.n_turnisti === b.n_turnisti && a.ricorrenza === b.ricorrenza && eqDays(a.giorni_custom, b.giorni_custom)
}

/**
 * Card di un turno con SALVATAGGIO ESPLICITO.
 * I campi modificano solo lo stato locale `form`; il pulsante "Salva" (in alto
 * a destra) persiste su DB e invalida la query. Finché ci sono modifiche, la
 * card è "dirty": bordo arancione + Salva attivo. Lo stato dirty viene
 * comunicato al genitore (per il banner e la guardia anti-uscita).
 */
function TurnoCard({ turno, onDelete, onDirty }: {
  turno: TurnoSchema
  onDelete: () => void
  onDirty: (id: string, dirty: boolean) => void
}) {
  const qc = useQueryClient()
  const [form, setForm]   = useState<TurnoSchema>(turno)
  const [saving, setSaving] = useState(false)
  const [errore, setErrore] = useState('')

  const dirty = useMemo(() => !sameTurno(form, turno), [form, turno])

  useEffect(() => { onDirty(turno.id, dirty) }, [dirty, turno.id, onDirty])
  useEffect(() => () => onDirty(turno.id, false), [turno.id, onDirty])  // pulizia all'unmount

  function patch(p: Partial<TurnoSchema>) { setForm(f => ({ ...f, ...p })) }
  function toggleGiorno(num: number) {
    const set = new Set(form.giorni_custom)
    set.has(num) ? set.delete(num) : set.add(num)
    patch({ giorni_custom: [...set].sort((a, b) => a - b) })
  }

  async function salva() {
    setSaving(true); setErrore('')
    try {
      await store.updateTurnoSchema(turno.id, {
        nome: form.nome, ora_inizio: form.ora_inizio, ora_fine: form.ora_fine,
        n_turnisti: form.n_turnisti, ricorrenza: form.ricorrenza, giorni_custom: form.giorni_custom,
      })
      await qc.invalidateQueries({ queryKey: ['schema'] })
    } catch (e) { setErrore((e as Error).message) }
    finally { setSaving(false) }
  }

  const overnight = form.ora_fine <= form.ora_inizio

  return (
    <div className="card p-4" style={dirty ? { boxShadow: 'inset 0 0 0 2px #f59e0b' } : undefined}>
      {/* Header: icona + nome + Salva (alto dx) + elimina */}
      <div className="flex items-center gap-2 mb-3">
        {overnight ? <Moon size={18} style={{ color: '#476540' }} /> : <Sun size={18} style={{ color: '#476540' }} />}
        <input value={form.nome} onChange={e => patch({ nome: e.target.value })}
          placeholder="Nome del turno (es. Notte)" className="input text-sm font-semibold flex-1" />
        <button onClick={salva} disabled={saving || !dirty}
          className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg border transition-colors disabled:cursor-default"
          style={dirty
            ? { background: '#2e7d32', color: '#fff', borderColor: '#27692b' }
            : { background: '#f3f4f6', color: '#9ca3af', borderColor: '#e5e7eb' }}
          title={dirty ? 'Salva le modifiche' : 'Niente da salvare'}>
          {saving ? <span className="text-[11px] font-bold">…</span> : <Save size={16} />}
        </button>
        <button onClick={onDelete}
          className="p-2 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
          title="Elimina turno"><Trash2 size={16} /></button>
      </div>

      {errore && <div className="mb-2 text-xs text-red-700 bg-red-50 rounded px-2 py-1">Errore: {errore}</div>}

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
            onChange={e => patch({ n_turnisti: Math.max(1, parseInt(e.target.value) || 1) })} className="input text-sm" />
        </div>
      </div>

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
                  style={on ? { background: '#476540', color: '#fff', borderColor: '#456b3a' }
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
  const { setHasUnsaved } = useUnsaved()

  const { data: schema = [], isLoading } = useQuery<TurnoSchema[]>({
    queryKey: ['schema'],
    queryFn: () => store.getSchema(),
  })

  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())
  const handleDirty = useCallback((id: string, dirty: boolean) => {
    setDirtyIds(prev => {
      const has = prev.has(id)
      if (dirty && !has) { const n = new Set(prev); n.add(id); return n }
      if (!dirty && has) { const n = new Set(prev); n.delete(id); return n }
      return prev   // nessun cambio → stessa reference → niente loop
    })
  }, [])
  const hasUnsaved = dirtyIds.size > 0

  // Guardia globale (blocco cambio pagina admin) + avviso chiusura/refresh tab
  useEffect(() => { setHasUnsaved(hasUnsaved); return () => setHasUnsaved(false) }, [hasUnsaved, setHasUnsaved])
  useEffect(() => {
    if (!hasUnsaved) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [hasUnsaved])

  async function aggiungiTurno() {
    await store.addTurnoSchema({ nome: '', ora_inizio: '08:00', ora_fine: '20:00', n_turnisti: 1, ricorrenza: 'tutti', giorni_custom: [] })
    await qc.invalidateQueries({ queryKey: ['schema'] })
  }
  async function eliminaTurno(t: TurnoSchema) {
    const ok = await confirm({ title: 'Elimina turno', message: `Vuoi eliminare il turno "${t.nome || 'senza nome'}"?`, confirmLabel: 'Elimina', danger: true })
    if (!ok) return
    handleDirty(t.id, false)
    await store.deleteTurnoSchema(t.id)
    await qc.invalidateQueries({ queryKey: ['schema'] })
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: '#2b3c24' }}>
            <CalendarClock size={22} style={{ color: '#476540' }} /> Configurazione Turni
          </h1>
          <p className="text-sm text-stone-600 mt-0.5 max-w-xl">
            Definisci i turni: nome, orari, quanti turnisti servono e quando si applicano.
            Dopo ogni modifica premi <strong>Salva</strong> sul turno.
          </p>
        </div>
        <button onClick={aggiungiTurno} className="btn-primary text-sm shrink-0"><Plus size={16} /> Aggiungi turno</button>
      </div>

      {hasUnsaved && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
          style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24' }}>
          <AlertTriangle size={16} className="shrink-0" />
          Hai modifiche non salvate in {dirtyIds.size} turno{dirtyIds.size === 1 ? '' : 'i'}: premi <strong>Salva</strong> (turni col bordo arancione).
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-stone-500">Caricamento…</p>
      ) : schema.length === 0 ? (
        <div className="card p-8 text-center">
          <CalendarClock size={32} className="mx-auto mb-2" style={{ color: '#9ab488' }} />
          <p className="text-sm text-stone-500 mb-3">Nessun turno definito.</p>
          <button onClick={aggiungiTurno} className="btn-primary text-sm mx-auto"><Plus size={16} /> Crea il primo turno</button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {schema.map(t => <TurnoCard key={t.id} turno={t} onDelete={() => eliminaTurno(t)} onDirty={handleDirty} />)}
        </div>
      )}
    </div>
  )
}
