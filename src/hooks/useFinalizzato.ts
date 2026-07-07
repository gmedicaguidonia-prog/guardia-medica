import { useQuery, useQueryClient } from '@tanstack/react-query'
import { store } from '../lib/store'

/** Stato di finalizzazione (blocco) del mese per una postazione.
 *  `finalizzato` = true ⇒ il mese è in sola lettura finché non viene sbloccato
 *  (pagina ⑧ Finalizzazione, da chi ha accesso alla gestione). */
export function useFinalizzato(postazioneId: string | null | undefined, meseKey: string) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<{ autore: string | null; createdAt: string } | null>({
    queryKey: ['finalizzazione', postazioneId, meseKey],
    queryFn: () => store.getFinalizzazione(postazioneId!, meseKey),
    enabled: !!postazioneId,
    staleTime: 30_000,
  })
  return {
    finalizzato: !!data,
    info: data ?? null,
    loading: isLoading,
    invalida: () => qc.invalidateQueries({ queryKey: ['finalizzazione', postazioneId, meseKey] }),
  }
}
