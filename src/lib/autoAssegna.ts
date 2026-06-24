/**
 * Auto Assegnazione dei turni del mese.
 *
 * Ordine del calcolo (concordato):
 *  1. turni FISSI (Regole) → assegnati se il turnista non ha indisponibilità
 *     quel giorno e non va in sovrapposizione di orario;
 *  2. riempimento per DISPONIBILITÀ: prima chi ha messo «vorrei» (desiderata),
 *     poi — per non lasciare turni scoperti — chiunque non sia «indisponibile»;
 *     ad ogni passo si dà il turno al candidato più "indietro" (meno ore; per
 *     gli slot di weekend si bilanciano prima i weekend, poi le ore).
 *  3. gli slot senza candidati restano vuoti.
 *
 * Funzione PURA: non tocca il DB. Restituisce la mappa chiave→turnista da
 * mettere "in sospeso" (chiave = `${data}|${turnoId}|${slot}`, slot ≥ 0).
 */
import type { TurnoSchema, RegolaTurno, Desiderata } from '../types'
import { turnoSiApplica } from './turniLogic'
import { giornoSettimana, isoDate } from './holidays'

export interface AutoAssegnaInput {
  giorni: Date[]                     // giorni del mese
  schema: TurnoSchema[]              // tipi di turno
  poolIds: string[]                  // turnisti assegnabili (importati, esterni esclusi)
  regole: RegolaTurno[]              // turni fissi (con turnista_id)
  desiderata: Desiderata[]           // desiderata/indisponibilità del mese
  durataById: Map<string, number>   // ore di ciascun tipo di turno
}
export interface AutoAssegnaResult {
  assegna: Map<string, string>       // `${ds}|${turnoId}|${slot}` → turnistaId
  totali: number                     // slot totali del mese
  coperti: number                    // slot assegnati
  perTurnista: { id: string; ore: number; weekend: number }[]
}

const parseMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
/** Intervallo assoluto in minuti (gestisce l'attraversamento della mezzanotte). */
function intervallo(ds: string, t: TurnoSchema): [number, number] {
  const [y, mo, d] = ds.split('-').map(Number)
  const base = Math.round(Date.UTC(y, mo - 1, d) / 86400000) * 1440
  let s = parseMin(t.ora_inizio), e = parseMin(t.ora_fine)
  if (e <= s) e += 1440
  return [base + s, base + e]
}
const isWeekend = (ds: string) => { const [y, m, d] = ds.split('-').map(Number); const g = new Date(y, m - 1, d).getDay(); return g === 0 || g === 6 }

interface Slot { ds: string; t: TurnoSchema; slot: number; weekend: boolean }

export function autoAssegna(inp: AutoAssegnaInput): AutoAssegnaResult {
  const { giorni, schema, poolIds, regole, desiderata, durataById } = inp
  const pool = new Set(poolIds)
  const dur = (id: string) => durataById.get(id) ?? 0

  // indici desiderata: cosa vuole / cosa non può ciascun turnista
  const indispo = new Set<string>(), vuoi = new Set<string>()
  desiderata.forEach(d => {
    const k = `${d.data}|${d.turno_schema_id}|${d.turnista_id}`
    if (d.tipo === 'indisponibilita') indispo.add(k); else vuoi.add(k)
  })

  // stato corrente per turnista
  const ore = new Map<string, number>(), wknd = new Map<string, number>(), busy = new Map<string, [number, number][]>()
  poolIds.forEach(t => { ore.set(t, 0); wknd.set(t, 0); busy.set(t, []) })
  const assegna = new Map<string, string>()

  const libero = (tid: string, ds: string, t: TurnoSchema): boolean => {
    if (indispo.has(`${ds}|${t.id}|${tid}`)) return false
    const [s, e] = intervallo(ds, t)
    for (const [s2, e2] of busy.get(tid)!) if (s < e2 && s2 < e) return false   // sovrapposizione
    return true
  }
  const poni = (tid: string, slot: Slot) => {
    assegna.set(`${slot.ds}|${slot.t.id}|${slot.slot}`, tid)
    ore.set(tid, ore.get(tid)! + dur(slot.t.id))
    if (slot.weekend) wknd.set(tid, wknd.get(tid)! + 1)
    busy.get(tid)!.push(intervallo(slot.ds, slot.t))
  }
  const occupanti = (slot: Slot): Set<string> => {
    const set = new Set<string>()
    for (let k = 0; k < slot.t.n_turnisti; k++) { const v = assegna.get(`${slot.ds}|${slot.t.id}|${k}`); if (v) set.add(v) }
    return set
  }

  // tutti gli slot del mese (escluso il reperibile)
  const slots: Slot[] = []
  for (const d of giorni) {
    const ds = isoDate(d)
    for (const t of schema) if (turnoSiApplica(t, d)) for (let s = 0; s < t.n_turnisti; s++) slots.push({ ds, t, slot: s, weekend: isWeekend(ds) })
  }

  // 1) turni fissi
  const fissi = regole.filter(r => r.turnista_id && pool.has(r.turnista_id))
  if (fissi.length) for (const slot of slots) {
    if (assegna.has(`${slot.ds}|${slot.t.id}|${slot.slot}`)) continue
    const [y, m, d] = slot.ds.split('-').map(Number)
    const g = giornoSettimana(new Date(y, m - 1, d))
    const r = fissi.find(r => r.giorno_settimana === g && r.turno_schema_id === slot.t.id && r.slot === slot.slot)
    if (!r || !r.turnista_id) continue
    if (occupanti(slot).has(r.turnista_id)) continue
    if (!libero(r.turnista_id, slot.ds, slot.t)) continue   // indisponibile o conflitto → lo lascio agli altri
    poni(r.turnista_id, slot)
  }

  // candidati per uno slot ancora libero
  const candidati = (slot: Slot, soloVuoi: boolean): string[] => {
    if (assegna.has(`${slot.ds}|${slot.t.id}|${slot.slot}`)) return []
    const occ = occupanti(slot)
    return poolIds.filter(tid => {
      if (occ.has(tid)) return false
      if (soloVuoi && !vuoi.has(`${slot.ds}|${slot.t.id}|${tid}`)) return false
      return libero(tid, slot.ds, slot.t)
    })
  }
  // punteggio: più basso = più "indietro" = ha la precedenza
  const score = (tid: string, weekend: boolean) => weekend ? wknd.get(tid)! * 100000 + ore.get(tid)! : ore.get(tid)!

  const riempi = (soloVuoi: boolean) => {
    for (;;) {
      // scelgo lo slot più "vincolato" (meno candidati), a parità i weekend prima
      let best: { slot: Slot; cand: string[] } | null = null
      for (const slot of slots) {
        const c = candidati(slot, soloVuoi)
        if (!c.length) continue
        if (!best || c.length < best.cand.length || (c.length === best.cand.length && slot.weekend && !best.slot.weekend)) best = { slot, cand: c }
      }
      if (!best) break
      const sel = best
      const tid = sel.cand.reduce((a, b) => (score(b, sel.slot.weekend) < score(a, sel.slot.weekend) ? b : a))
      poni(tid, sel.slot)
    }
  }

  riempi(true)    // 2a) prima le desiderata («vorrei»)
  riempi(false)   // 2b) poi chiunque sia libero (per coprire i buchi)

  return {
    assegna,
    totali: slots.length,
    coperti: assegna.size,
    perTurnista: poolIds.map(id => ({ id, ore: ore.get(id)!, weekend: wknd.get(id)! })).sort((a, b) => b.ore - a.ore),
  }
}
