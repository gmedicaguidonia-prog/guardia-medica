import { useQuery } from '@tanstack/react-query'
import { store } from '../lib/store'
import { ATTIVAZIONE_DA } from '../lib/constants'
import { useImpaginazione } from './useImpaginazione'
import type { ConfigVersione, TurnoSchema } from '../types'

/**
 * Stato di completamento dei passi 1-2-3 per un mese (procedura sequenziale).
 * Usato per il GATING dei passi 4 (Desiderata) e 5 (Turni del Mese).
 *
 * "Completo" (dal mese ATTIVAZIONE_DA in poi):
 *  - passo 1 (Config): attivato + almeno un turno
 *  - passo 2 (Regole): solo attivato (regole vuote ammesse)
 *  - passo 3 (Impaginazione): attivato + impaginazione valida (≥1 foglio con turni)
 * Per i mesi precedenti vale il vecchio criterio (config+impaginazione presenti).
 */
export function usePassiCompleti(postazioneId: string | null | undefined, meseKey: string) {
  const nuovaProcedura = meseKey >= ATTIVAZIONE_DA
  const { data: attivazioni = [] } = useQuery<number[]>({ queryKey: ['attivazioni', postazioneId, meseKey], queryFn: () => store.getAttivazioni(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: configVer } = useQuery<ConfigVersione | null>({ queryKey: ['versione', postazioneId, meseKey], queryFn: () => store.getVersioneMese(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: schema = [] } = useQuery<TurnoSchema[]>({ queryKey: ['schema', configVer?.id], queryFn: () => store.getSchemaVersione(configVer!.id), enabled: !!configVer })
  const { impaginazioneOk } = useImpaginazione(postazioneId, meseKey, schema)

  const passo1 = nuovaProcedura ? (attivazioni.includes(1) && schema.length > 0) : (!!configVer && schema.length > 0)
  const passo2 = nuovaProcedura ? attivazioni.includes(2) : true
  const passo3 = nuovaProcedura ? (attivazioni.includes(3) && impaginazioneOk) : impaginazioneOk
  return { nuovaProcedura, attivazioni, passo1, passo2, passo3, tuttiOk: passo1 && passo2 && passo3 }
}
