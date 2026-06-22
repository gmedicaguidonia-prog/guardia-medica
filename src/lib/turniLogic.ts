import type { TurnoSchema } from '../types'
import { isFestivo, isPrefestivo, isFeriale, giornoSettimana } from './holidays'

/** Decide se un tipo di turno si applica in una certa data, in base alla
 *  sua ricorrenza (tutti / feriali / weekend / prefestivi / festivi / custom). */
export function turnoSiApplica(t: TurnoSchema, d: Date): boolean {
  switch (t.ricorrenza) {
    case 'tutti':      return true
    case 'feriali':    return isFeriale(d)
    case 'weekend':    return d.getDay() === 0 || d.getDay() === 6
    case 'prefestivi': return isPrefestivo(d)
    case 'festivi':    return isFestivo(d)
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

/** Elenco delle date (Date) di un mese (mese 1..12). */
export function giorniDelMese(anno: number, mese: number): Date[] {
  const n = new Date(anno, mese, 0).getDate()
  return Array.from({ length: n }, (_, i) => new Date(anno, mese - 1, i + 1))
}
