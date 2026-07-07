import type { TurnoSchema } from '../types'
import { isFestivo, isPrefestivo, isFeriale, giornoSettimana } from './holidays'

/** Decide se un tipo di turno si applica in una certa data, in base alla
 *  sua ricorrenza (tutti / feriali / weekend / prefestivi / festivi / custom). */
export function turnoSiApplica(t: TurnoSchema, d: Date, festivoSet?: Set<string>): boolean {
  switch (t.ricorrenza) {
    case 'tutti':      return true
    case 'feriali':    return isFeriale(d, festivoSet)
    case 'weekend':    return d.getDay() === 0 || d.getDay() === 6
    case 'prefestivi': return isPrefestivo(d, festivoSet)
    case 'festivi':    return isFestivo(d, festivoSet)
    case 'custom':     return t.giorni_custom.includes(giornoSettimana(d))
    default:           return false
  }
}

/** Un turno PUÒ applicarsi in un certo giorno della settimana (1=Lun..7=Dom)?
 *  Usato dalla griglia settimanale delle Regole Turni. festivi/prefestivi
 *  possono cadere in qualsiasi giorno → consentiti ovunque. */
export function turnoApplicabileGiorno(t: TurnoSchema, giorno: number): boolean {
  switch (t.ricorrenza) {
    case 'feriali': return giorno >= 1 && giorno <= 5
    case 'weekend': return giorno === 6 || giorno === 7
    case 'custom':  return t.giorni_custom.includes(giorno)
    default:        return true
  }
}

/** Mese precedente in formato 'YYYY-MM'. */
export function mesePrecedente(key: string): string {
  const [a, m] = key.split('-').map(Number)
  const d = new Date(a, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
/** Inizio della versione successiva (la più vicina con valido_da > cur), o null. */
export function prossimoInizio(cur: { valido_da: string }, tutte: { valido_da: string }[]): string | null {
  const later = tutte.map(v => v.valido_da).filter(d => d > cur.valido_da).sort()
  return later.length ? later[0] : null
}
/** Ultimo mese EFFETTIVAMENTE valido: considera che una versione successiva
 *  subentra dal suo valido_da. null = per sempre. */
export function fineEffettiva(cur: { valido_da: string; valido_fino: string | null }, tutte: { valido_da: string }[]): string | null {
  let eff = cur.valido_fino
  const nxt = prossimoInizio(cur, tutte)
  if (nxt) { const cap = mesePrecedente(nxt); if (eff === null || cap < eff) eff = cap }
  return eff
}

/** Elenco delle date (Date) di un mese (mese 1..12). */
export function giorniDelMese(anno: number, mese: number): Date[] {
  const n = new Date(anno, mese, 0).getDate()
  return Array.from({ length: n }, (_, i) => new Date(anno, mese - 1, i + 1))
}

/**
 * Caso del "gate di attivazione" di un mese in una sezione versionata
 * (Configurazione Turni / Regole / Impaginazione). Decide quali pulsanti mostrare
 * in base alla versione che GOVERNA il mese precedente e al suo `valido_fino`:
 *  - 'vuoto'    → il mese prima non ha una configurazione con contenuto (Caso 1): solo "crea ex-novo".
 *  - 'copia'    → il mese prima ha una versione CHIUSA (valido_fino = mese prima) che NON copre
 *                 questo mese (Caso 2): "Copia dal mese prima" = nuova versione da qui (per sempre) + copia.
 *  - 'conferma' → il mese prima ha una versione che COPRE già questo mese, cioè valido_fino nullo
 *                 (per sempre) o ≥ meseKey (Caso 3): "Conferma dal mese prima" = solo attiva, la
 *                 versione continua senza crearne una nuova né chiuderla.
 */
export type CasoAttivazione = 'vuoto' | 'copia' | 'conferma'
export function casoAttivazione(
  versionePrec: { valido_fino: string | null } | null | undefined,
  meseKey: string,
): CasoAttivazione {
  if (!versionePrec) return 'vuoto'                                                       // il mese prima non è configurato
  if (versionePrec.valido_fino == null || versionePrec.valido_fino >= meseKey) return 'conferma'  // copre già questo mese
  return 'copia'                                                                          // chiuso al mese prima
}
