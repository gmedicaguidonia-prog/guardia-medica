import { useQuery } from '@tanstack/react-query'
import { store } from '../lib/store'
import { ATTIVAZIONE_DA } from '../lib/constants'
import { useImpaginazione } from './useImpaginazione'
import type { ConfigVersione, TurnoSchema, TurnistaMese } from '../types'

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
  const { data: personaleMese = [] } = useQuery<TurnistaMese[]>({ queryKey: ['personale-mese', postazioneId, meseKey], queryFn: () => store.getPersonaleMese(postazioneId!, meseKey), enabled: !!postazioneId })
  const { impaginazioneOk } = useImpaginazione(postazioneId, meseKey, schema)

  // Cumulativi: un passo non può risultare completo se manca un passo precedente.
  // Numeri INTERNI (attivazioni_mese.passo): 0=Personale, 1=Config, 2=Regole, 3=Impaginazione.
  // I numeri VISUALIZZATI sono +1 (Personale=①, Config=②, …).
  const passoPersonale = nuovaProcedura ? (attivazioni.includes(0) && personaleMese.length > 0) : true
  const passo1 = passoPersonale && (nuovaProcedura ? (attivazioni.includes(1) && schema.length > 0) : (!!configVer && schema.length > 0))
  const passo2 = passo1 && (nuovaProcedura ? attivazioni.includes(2) : true)
  const passo3 = passo2 && (nuovaProcedura ? (attivazioni.includes(3) && impaginazioneOk) : impaginazioneOk)
  return { nuovaProcedura, attivazioni, personaleMese, passoPersonale, passo1, passo2, passo3, tuttiOk: passoPersonale && passo1 && passo2 && passo3 }
}
