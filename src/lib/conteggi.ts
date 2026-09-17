import type { TurnoSchema } from '../types'
import { isFestivo, isPrefestivo, isSuperfestivo } from './holidays'

// ═══ Conteggi turni per turnista (riepilogo di ⑦ Turni del Mese e specchietto pubblico) ═══
// T turni · Ore · N notti · F festivi · PF prefestivi · SF superfestivi (solo turni abbinati
// nel passo ⑤) · R reperibilità (slot < 0: NON entra in T/Ore, si conta a parte).

export interface Conteggio { T: number; Ore: number; N: number; F: number; PF: number; SF: number; R: number }

export function oreTurno(inizio: string, fine: string): number {
  const [h1, m1] = inizio.split(':').map(Number)
  const [h2, m2] = fine.split(':').map(Number)
  let min = (h2 * 60 + m2) - (h1 * 60 + m1)
  if (min <= 0) min += 24 * 60   // turno a cavallo della mezzanotte
  return min / 60
}
export const fmtOre = (x: number) => (Number.isInteger(x) ? `${x}` : x.toFixed(1))

export interface AssegnazioneConteggio { ds: string; turnoId: string; slot: number; tid: string }

export function calcolaConteggi(
  assegnazioni: Iterable<AssegnazioneConteggio>,
  turnoById: Map<string, TurnoSchema>,
  festivoSet: Set<string>,
  superSet: Set<string>,
  superTurniByData: Map<string, string[]>,
): Map<string, Conteggio> {
  const stat = new Map<string, Conteggio>()
  for (const a of assegnazioni) {
    const turno = turnoById.get(a.turnoId); if (!turno) continue
    const s = stat.get(a.tid) ?? { T: 0, Ore: 0, N: 0, F: 0, PF: 0, SF: 0, R: 0 }
    if (a.slot < 0) { s.R++; stat.set(a.tid, s); continue }
    s.T++
    s.Ore += oreTurno(turno.ora_inizio, turno.ora_fine)
    if (turno.ora_fine <= turno.ora_inizio) s.N++
    const [y, m, d] = a.ds.split('-').map(Number); const date = new Date(y, m - 1, d)
    if (isFestivo(date, festivoSet)) s.F++; else if (isPrefestivo(date, festivoSet)) s.PF++
    if (isSuperfestivo(date, superSet) && superTurniByData.get(a.ds)?.includes(a.turnoId)) s.SF++
    stat.set(a.tid, s)
  }
  return stat
}
