import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { store } from '../lib/store'
import { ATTIVAZIONE_DA } from '../lib/constants'
import { useImpaginazione } from './useImpaginazione'
import { useFestivita } from './useFestivita'
import type { ConfigVersione, TurnoSchema, TurnistaMese } from '../types'

/** Numero INTERNO del passo Festività in `attivazioni_mese.passo` (NON in conflitto con 0-4). */
export const PASSO_FESTIVITA = 5

/**
 * Stato di completamento dei passi per un mese (procedura sequenziale).
 * Usato per il GATING dei passi Desiderata e Turni del Mese.
 *
 * "Completo" (dal mese ATTIVAZIONE_DA in poi):
 *  - Personale (interno 0): attivato + almeno una persona nel mese
 *  - Config (interno 1): attivato + almeno un turno
 *  - Regole (interno 2): solo attivato (regole vuote ammesse)
 *  - Impaginazione (interno 3): attivato + impaginazione valida (≥1 foglio con turni)
 *  - Festività (interno 5): attivato (azione esplicita) + ogni superfestivo del mese
 *    ha ≥1 turno abbinato. Se il mese non ha superfestivi, basta l'attivazione
 *    (casella «Nessun superfestivo questo mese»).
 * Per i mesi precedenti vale il vecchio criterio (config+impaginazione presenti).
 */
export function usePassiCompleti(postazioneId: string | null | undefined, meseKey: string) {
  const nuovaProcedura = meseKey >= ATTIVAZIONE_DA
  const { data: attivazioni = [] } = useQuery<number[]>({ queryKey: ['attivazioni', postazioneId, meseKey], queryFn: () => store.getAttivazioni(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: configVer } = useQuery<ConfigVersione | null>({ queryKey: ['versione', postazioneId, meseKey], queryFn: () => store.getVersioneMese(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: schema = [] } = useQuery<TurnoSchema[]>({ queryKey: ['schema', configVer?.id], queryFn: () => store.getSchemaVersione(configVer!.id), enabled: !!configVer })
  const { data: personaleMese = [] } = useQuery<TurnistaMese[]>({ queryKey: ['personale-mese', postazioneId, meseKey], queryFn: () => store.getPersonaleMese(postazioneId!, meseKey), enabled: !!postazioneId })
  const { impaginazioneOk } = useImpaginazione(postazioneId, meseKey, schema)

  // Festività: superfestivi del mese + loro abbinamenti ai turni (per il gate).
  const { superSet } = useFestivita(postazioneId)
  const { data: superTurni = [] } = useQuery<{ data: string; turnoSchemaId: string }[]>({ queryKey: ['superfestivo-turni', postazioneId, meseKey], queryFn: () => store.getSuperfestivoTurni(postazioneId!, meseKey), enabled: !!postazioneId })
  const superDelMese = useMemo(() => [...superSet].filter(d => d.startsWith(meseKey)), [superSet, meseKey])
  const dateConTurni = useMemo(() => new Set(superTurni.map(t => t.data)), [superTurni])
  const tuttiSuperAbbinati = useMemo(() => superDelMese.every(d => dateConTurni.has(d)), [superDelMese, dateConTurni])

  // Cumulativi: un passo non può risultare completo se manca un passo precedente.
  const passoPersonale = nuovaProcedura ? (attivazioni.includes(0) && personaleMese.length > 0) : true
  const passo1 = passoPersonale && (nuovaProcedura ? (attivazioni.includes(1) && schema.length > 0) : (!!configVer && schema.length > 0))
  const passo2 = passo1 && (nuovaProcedura ? attivazioni.includes(2) : true)
  const passo3 = passo2 && (nuovaProcedura ? (attivazioni.includes(3) && impaginazioneOk) : impaginazioneOk)
  const passoFestivita = passo3 && (nuovaProcedura ? (attivazioni.includes(PASSO_FESTIVITA) && tuttiSuperAbbinati) : true)
  return { nuovaProcedura, attivazioni, personaleMese, passoPersonale, passo1, passo2, passo3, passoFestivita, tuttiOk: passoPersonale && passo1 && passo2 && passo3 && passoFestivita }
}
