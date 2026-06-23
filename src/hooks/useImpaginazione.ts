import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { store } from '../lib/store'
import type { TurnoSchema, ImpaginazioneVersione, Foglio, FoglioTurno } from '../types'

export interface FoglioConTurni { foglio: Foglio; turni: TurnoSchema[] }

/**
 * Carica l'impaginazione (versione + fogli + assegnazioni turni) per la
 * postazione/mese e raggruppa i `schema` (turni del mese) per foglio.
 * `fogliConTurni` contiene solo i fogli con almeno un turno; `impaginazioneOk`
 * indica se il mese è impaginato (almeno un foglio con turni).
 */
export function useImpaginazione(postazioneId: string | null | undefined, meseKey: string, schema: TurnoSchema[], enabled = true) {
  const { data: versione, isLoading: loadingVer } = useQuery<ImpaginazioneVersione | null>({ queryKey: ['impag-versione', postazioneId, meseKey], queryFn: () => store.getImpaginazioneVersioneMese(postazioneId!, meseKey), enabled: enabled && !!postazioneId })
  const { data: fogli = [] } = useQuery<Foglio[]>({ queryKey: ['fogli', versione?.id], queryFn: () => store.getFogli(versione!.id), enabled: enabled && !!versione })
  const { data: foglioTurni = [] } = useQuery<FoglioTurno[]>({ queryKey: ['foglio-turni', versione?.id], queryFn: () => store.getFoglioTurni(versione!.id), enabled: enabled && !!versione })

  const foglioByTurno = useMemo(() => new Map(foglioTurni.map(ft => [ft.turno_schema_id, ft.foglio_id])), [foglioTurni])
  const fogliConTurni = useMemo<FoglioConTurni[]>(
    () => fogli.map(f => ({ foglio: f, turni: schema.filter(s => foglioByTurno.get(s.id) === f.id) })).filter(fc => fc.turni.length > 0),
    [fogli, schema, foglioByTurno],
  )
  const impaginazioneOk = fogliConTurni.length > 0
  return { versione, fogli, foglioByTurno, foglioTurni, fogliConTurni, impaginazioneOk, loadingImpag: loadingVer }
}
