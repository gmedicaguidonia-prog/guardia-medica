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
  maxSettimana?: number | null      // ore massime a settimana (da non superare)
  maxConsecutive?: number | null    // ore massime consecutive (turni attaccati)
  esistenti?: Map<string, string>   // modalità "aggiungi": assegnazioni già presenti da MANTENERE (vincono)
}
export interface AutoAssegnaResult {
  assegna: Map<string, string>       // `${ds}|${turnoId}|${slot}` → turnistaId
  totali: number                     // slot totali del mese
  coperti: number                    // slot assegnati
  nEsistenti: number                 // assegnazioni manuali mantenute (modalità "aggiungi")
  nFissi: number                     // assegnati dai turni fissi (Regole)
  perDesiderata: number              // assegnati grazie a un «vorrei»
  perRiempimento: number             // assegnati col riempimento (chi era libero, senza preferenza)
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
const oreTurnoOf = (t: TurnoSchema): number => { let mn = parseMin(t.ora_fine) - parseMin(t.ora_inizio); if (mn <= 0) mn += 1440; return mn / 60 }
/** Lunedì (chiave) della settimana che contiene `ds`. */
const lunediKey = (ds: string): string => {
  const [y, m, d] = ds.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return isoDate(date)
}
/** Ore della "catena" di turni attaccati (senza pause) che contiene `nuovo`. */
function runContenente(intervals: [number, number][], nuovo: [number, number]): number {
  const all = [...intervals, nuovo].sort((a, b) => a[0] - b[0])
  let s = all[0][0], e = all[0][1], run = 0
  for (let i = 1; i < all.length; i++) {
    if (all[i][0] <= e) e = Math.max(e, all[i][1])
    else { if (nuovo[0] >= s && nuovo[0] < e) run = Math.max(run, e - s); s = all[i][0]; e = all[i][1] }
  }
  if (nuovo[0] >= s && nuovo[0] < e) run = Math.max(run, e - s)
  return run / 60
}

// ── Helper riusabili anche dal trascinamento manuale (Turni del Mese) ──
/** Ore già assegnate a `tid` nella settimana (lun-dom) del giorno `ds`. */
export function oreSettimana(ass: Map<string, string>, schema: TurnoSchema[], tid: string, ds: string): number {
  const wk = lunediKey(ds), byId = new Map(schema.map(s => [s.id, s]))
  let h = 0
  for (const [key, t] of ass) {
    if (t !== tid) continue
    const [d, turnoId, slotStr] = key.split('|')
    if (+slotStr < 0 || lunediKey(d) !== wk) continue
    const turno = byId.get(turnoId); if (turno) h += oreTurnoOf(turno)
  }
  return h
}
/** Ore consecutive (catena di turni attaccati) di `tid` se aggiungo (ds, turno). */
export function oreConsecutive(ass: Map<string, string>, schema: TurnoSchema[], tid: string, ds: string, turno: TurnoSchema): number {
  const byId = new Map(schema.map(s => [s.id, s]))
  const intervals: [number, number][] = []
  for (const [key, t] of ass) {
    if (t !== tid) continue
    const [d, turnoId, slotStr] = key.split('|'); if (+slotStr < 0) continue
    const tt = byId.get(turnoId); if (tt) intervals.push(intervallo(d, tt))
  }
  return runContenente(intervals, intervallo(ds, turno))
}

/** Insieme dei "mai questo turno" dalle Regole (slot negativo): `${giornoSettimana}|${turnoId}|${tid}`. */
export function vietatiDaRegole(regole: RegolaTurno[]): Set<string> {
  const s = new Set<string>()
  regole.forEach(r => { if (r.turnista_id && r.slot < 0) s.add(`${r.giorno_settimana}|${r.turno_schema_id}|${r.turnista_id}`) })
  return s
}

interface Slot { ds: string; t: TurnoSchema; slot: number; weekend: boolean; g: number }

export function autoAssegna(inp: AutoAssegnaInput): AutoAssegnaResult {
  const { giorni, schema, poolIds, regole, desiderata, durataById, maxSettimana = null, maxConsecutive = null, esistenti } = inp
  const pool = new Set(poolIds)
  const dur = (id: string) => durataById.get(id) ?? 0

  // indici desiderata: cosa vuole / cosa non può ciascun turnista
  const indispo = new Set<string>(), vuoi = new Set<string>()
  desiderata.forEach(d => {
    const k = `${d.data}|${d.turno_schema_id}|${d.turnista_id}`
    if (d.tipo === 'indisponibilita') indispo.add(k); else vuoi.add(k)
  })
  const vietato = vietatiDaRegole(regole)   // "mai questo turno" per (giorno settimana, turno, tid)

  // stato corrente per turnista
  const ore = new Map<string, number>(), wknd = new Map<string, number>(), busy = new Map<string, [number, number][]>()
  poolIds.forEach(t => { ore.set(t, 0); wknd.set(t, 0); busy.set(t, []) })
  const oreSett = new Map<string, Map<string, number>>()   // tid → (lunedì settimana → ore) [per il max settimanale]
  const assegna = new Map<string, string>()

  // modalità "aggiungi": semina con le assegnazioni manuali da MANTENERE (vincono)
  if (esistenti) {
    const byId = new Map(schema.map(s => [s.id, s]))
    for (const [key, tid] of esistenti) {
      const [ds, turnoId, slotStr] = key.split('|')
      if (+slotStr < 0 || !pool.has(tid)) continue
      const turno = byId.get(turnoId); if (!turno) continue
      assegna.set(key, tid)
      ore.set(tid, ore.get(tid)! + dur(turnoId))
      if (isWeekend(ds)) wknd.set(tid, wknd.get(tid)! + 1)
      busy.get(tid)!.push(intervallo(ds, turno))
      const wk = lunediKey(ds); if (!oreSett.has(tid)) oreSett.set(tid, new Map()); const wm = oreSett.get(tid)!; wm.set(wk, (wm.get(wk) ?? 0) + dur(turnoId))
    }
  }
  const nEsistenti = assegna.size

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
    const wk = lunediKey(slot.ds)
    if (!oreSett.has(tid)) oreSett.set(tid, new Map())
    const wm = oreSett.get(tid)!; wm.set(wk, (wm.get(wk) ?? 0) + dur(slot.t.id))
  }
  const occupanti = (slot: Slot): Set<string> => {
    const set = new Set<string>()
    for (let k = 0; k < slot.t.n_turnisti; k++) { const v = assegna.get(`${slot.ds}|${slot.t.id}|${k}`); if (v) set.add(v) }
    return set
  }

  // tutti gli slot del mese (escluso il reperibile)
  const slots: Slot[] = []
  for (const d of giorni) {
    const ds = isoDate(d), g = giornoSettimana(d)
    for (const t of schema) if (turnoSiApplica(t, d)) for (let s = 0; s < t.n_turnisti; s++) slots.push({ ds, t, slot: s, weekend: isWeekend(ds), g })
  }

  // 1) turni fissi (slot ≥ 0; gli slot negativi sono i "mai", non assegnazioni)
  const fissi = regole.filter(r => r.turnista_id && r.slot >= 0 && pool.has(r.turnista_id))
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

  const nFissi = assegna.size - nEsistenti   // assegnati dai turni fissi (esclusi i manuali mantenuti)

  // candidati per uno slot ancora libero
  const candidati = (slot: Slot, soloVuoi: boolean): string[] => {
    if (assegna.has(`${slot.ds}|${slot.t.id}|${slot.slot}`)) return []
    const occ = occupanti(slot)
    return poolIds.filter(tid => {
      if (occ.has(tid)) return false
      if (vietato.has(`${slot.g}|${slot.t.id}|${tid}`)) return false   // "mai questo turno"
      if (soloVuoi && !vuoi.has(`${slot.ds}|${slot.t.id}|${tid}`)) return false
      if (!libero(tid, slot.ds, slot.t)) return false
      // limiti orario (Regole): non superare le ore settimanali né le ore consecutive
      if (maxSettimana != null && (oreSett.get(tid)?.get(lunediKey(slot.ds)) ?? 0) + dur(slot.t.id) > maxSettimana + 2) return false   // settimanali: tolleranza ±2
      if (maxConsecutive != null && runContenente(busy.get(tid)!, intervallo(slot.ds, slot.t)) > maxConsecutive) return false          // consecutive: MAI rotta in auto
      return true
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
  const perDesiderata = assegna.size - nEsistenti - nFissi
  riempi(false)   // 2b) poi chiunque sia libero (per coprire i buchi)
  const perRiempimento = assegna.size - nEsistenti - nFissi - perDesiderata

  return {
    assegna,
    totali: slots.length,
    coperti: assegna.size,
    nEsistenti, nFissi, perDesiderata, perRiempimento,
    perTurnista: poolIds.map(id => ({ id, ore: ore.get(id)!, weekend: wknd.get(id)! })).sort((a, b) => b.ore - a.ore),
  }
}

// ── Auto Reperibilità ───────────────────────────────────────────────
const REP = -1

export interface AutoRepInput {
  giorni: Date[]
  schema: TurnoSchema[]
  poolIds: string[]
  desiderata: Desiderata[]
  assegnazioni: Map<string, string>   // stato attuale: `${ds}|${turnoId}|${slot}` → tid (slot<0 = reperibile)
}

/** Riempie le caselle reperibilità (slot -1) ANCORA VUOTE usando le
 *  disponibilità «vorrei» NON usate: un turnista che voleva quel turno ma non
 *  è stato messo in turno, se non è già impegnato in sovrapposizione. Bilancia
 *  il numero di reperibilità. Non tocca i reperibili già presenti. */
export function autoReperibilita(inp: AutoRepInput): { rep: Map<string, string>; assegnati: number } {
  const { giorni, schema, poolIds, desiderata, assegnazioni } = inp
  const schemaById = new Map(schema.map(s => [s.id, s]))
  const vuoi = new Set<string>(), indispo = new Set<string>()
  desiderata.forEach(d => { const k = `${d.data}|${d.turno_schema_id}|${d.turnista_id}`; if (d.tipo === 'desiderata') vuoi.add(k); else indispo.add(k) })

  const busy = new Map<string, [number, number][]>(); poolIds.forEach(t => busy.set(t, []))
  const inTurno = new Map<string, Set<string>>()   // `${ds}|${turnoId}` → tids nei posti regolari
  const repPresente = new Set<string>()            // `${ds}|${turnoId}` già con reperibile
  const repCount = new Map<string, number>(); poolIds.forEach(t => repCount.set(t, 0))

  for (const [key, tid] of assegnazioni) {
    const [ds, turnoId, slotStr] = key.split('|')
    const turno = schemaById.get(turnoId); if (!turno) continue
    if (busy.has(tid)) busy.get(tid)!.push(intervallo(ds, turno))
    if (+slotStr < 0) { repPresente.add(`${ds}|${turnoId}`); if (repCount.has(tid)) repCount.set(tid, repCount.get(tid)! + 1) }
    else { const k = `${ds}|${turnoId}`; if (!inTurno.has(k)) inTurno.set(k, new Set()); inTurno.get(k)!.add(tid) }
  }

  const rep = new Map<string, string>()
  for (const d of giorni) {
    const ds = isoDate(d)
    for (const turno of schema) {
      if (!turnoSiApplica(turno, d)) continue
      const k = `${ds}|${turno.id}`
      if (repPresente.has(k)) continue
      const iv = intervallo(ds, turno)
      const inReg = inTurno.get(k) ?? new Set<string>()
      const cand = poolIds.filter(tid => {
        if (!vuoi.has(`${k}|${tid}`)) return false                                  // solo "vorrei" non usate
        if (indispo.has(`${k}|${tid}`)) return false
        if (inReg.has(tid)) return false                                            // già in turno regolare lì
        return !busy.get(tid)!.some(([s2, e2]) => iv[0] < e2 && s2 < iv[1])         // niente sovrapposizione
      })
      if (!cand.length) continue
      const tid = cand.reduce((a, b) => (repCount.get(b)! < repCount.get(a)! ? b : a))
      rep.set(`${ds}|${turno.id}|${REP}`, tid)
      busy.get(tid)!.push(iv); repCount.set(tid, repCount.get(tid)! + 1); repPresente.add(k)
    }
  }
  return { rep, assegnati: rep.size }
}
