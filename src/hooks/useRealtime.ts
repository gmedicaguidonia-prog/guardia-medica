import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

export interface RealtimeSub {
  tabella: string          // tabella Postgres da osservare
  invalida: unknown[][]    // query-key (anche solo prefisso) da invalidare all'evento
}

/**
 * Supabase Realtime per una postazione: osserva le modifiche (INSERT/UPDATE/
 * DELETE) sulle tabelle indicate — filtrate per `postazione_id` — e invalida le
 * query react-query corrispondenti, così la vista si aggiorna da sola senza
 * ricaricare la pagina.
 *
 * Le invalidazioni sono accorpate con un piccolo debounce (400 ms): una sola
 * operazione che tocca molte righe (es. salvataggio dell'intero mese) genera
 * UN solo refetch invece di decine. Le chiavi possono essere prefissi
 * (es. ['turni', postazioneId]) così vale per qualunque mese aperto.
 *
 * In modalità DEV (senza credenziali Supabase) è un no-op.
 */
export function useRealtimePostazione(postazioneId: string | null, subs: RealtimeSub[]) {
  const qc = useQueryClient()
  const subsRef = useRef(subs)
  subsRef.current = subs

  useEffect(() => {
    if (!isSupabaseConfigured || !postazioneId) return
    const pending = new Set<string>()
    let timer: ReturnType<typeof setTimeout> | null = null
    const flush = () => {
      timer = null
      const keys = [...pending]; pending.clear()
      keys.forEach(k => qc.invalidateQueries({ queryKey: JSON.parse(k) as unknown[] }))
    }
    const schedule = (chiavi: unknown[][]) => {
      for (const k of chiavi) pending.add(JSON.stringify(k))
      if (!timer) timer = setTimeout(flush, 400)
    }

    const ch = supabase.channel(`rt:postazione:${postazioneId}`)
    for (const s of subsRef.current) {
      ch.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: s.tabella, filter: `postazione_id=eq.${postazioneId}` },
        () => schedule(s.invalida),
      )
    }
    ch.subscribe()
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(ch) }
  }, [postazioneId, qc])
}
