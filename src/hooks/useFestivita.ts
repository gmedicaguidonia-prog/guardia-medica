import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { store } from '../lib/store'
import { buildFestivoSet } from '../lib/holidays'
import type { Festivita } from '../types'

/**
 * Carica per una postazione: nazione, festività locali e override "superfestivo",
 * e ne deriva i Set pronti per isFestivo / isSuperfestivo / turnoSiApplica.
 *  - `festivoSet` = festività nazionali (della nazione) su un range di anni + locali.
 *    NON include le domeniche (le gestisce isFestivo).
 *  - `superSet` = SOLO le date con override super=true (nessun default: si marca a mano).
 */
export function useFestivita(postazioneId: string | null | undefined) {
  const enabled = !!postazioneId

  const { data: nazione = 'IT' } = useQuery<string>({
    queryKey: ['fest-nazione', postazioneId],
    queryFn: () => store.getNazione(postazioneId!),
    enabled, staleTime: 5 * 60_000,
  })
  const { data: locali = [] } = useQuery<Festivita[]>({
    queryKey: ['fest-custom', postazioneId],
    queryFn: () => store.getFestivitaCustom(postazioneId!),
    enabled, staleTime: 60_000,
  })
  const { data: superOverride = [] } = useQuery<{ data: string; superfestivo: boolean }[]>({
    queryKey: ['fest-super', postazioneId],
    queryFn: () => store.getFestivitaSuper(postazioneId!),
    enabled, staleTime: 60_000,
  })

  const anni = useMemo(() => {
    const y = new Date().getFullYear()
    const out: number[] = []
    for (let i = y - 2; i <= y + 5; i++) out.push(i)
    return out
  }, [])

  const festivoSet = useMemo(
    () => buildFestivoSet(nazione, locali.map(f => f.data), anni),
    [nazione, locali, anni],
  )
  const superSet = useMemo(
    () => new Set(superOverride.filter(s => s.superfestivo).map(s => s.data)),
    [superOverride],
  )

  return { nazione, locali, superOverride, festivoSet, superSet }
}
