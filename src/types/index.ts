// ─── Ruoli / livelli di autorizzazione ─────────────────────────────
//  - 'admin'    → gestione completa
//  - 'turnista' → vede i propri turni nella pagina pubblica
//  - 'esterno'  → ospite/sostituto: vede i turni, accesso limitato
export type Livello = 'admin' | 'turnista' | 'esterno'

export const LIVELLI: { value: Livello; label: string }[] = [
  { value: 'admin',    label: 'Admin' },
  { value: 'turnista', label: 'Turnista' },
  { value: 'esterno',  label: 'Esterno' },
]

// ─── Turnista (anagrafica + autorizzazione all'accesso) ─────────────
export interface Turnista {
  id: string
  nome: string
  email: string
  livello: Livello
  created_at: string
}

// ─── Schema turni (il "progetto" flessibile dei turni) ──────────────

/** Quando si applica un turno nell'arco del mese. */
export type Ricorrenza =
  | 'tutti'       // tutti i giorni
  | 'feriali'     // Lun–Ven (esclusi i festivi)
  | 'weekend'     // Sabato e Domenica
  | 'prefestivi'  // sabati + vigilie di un festivo
  | 'festivi'     // domeniche + festività nazionali
  | 'custom'      // giorni specifici della settimana (vedi giorni_custom)

export const RICORRENZE: { value: Ricorrenza; label: string }[] = [
  { value: 'tutti',      label: 'Tutti i giorni' },
  { value: 'feriali',    label: 'Solo feriali (Lun–Ven)' },
  { value: 'weekend',    label: 'Weekend (Sab–Dom)' },
  { value: 'prefestivi', label: 'Solo prefestivi (Sab + vigilie)' },
  { value: 'festivi',    label: 'Solo festivi (Dom + festività)' },
  { value: 'custom',     label: 'Giorni specifici…' },
]

/** Un tipo di turno nello schema: es. "Notte" 20:00–08:00, 1 turnista,
 *  tutti i giorni. ora_fine ≤ ora_inizio ⇒ il turno attraversa la
 *  mezzanotte (termina il giorno successivo). */
/** Versione di configurazione turni, valida per un intervallo di mesi. */
export interface ConfigVersione {
  id: string
  valido_da: string          // primo mese valido 'YYYY-MM'
  valido_fino: string | null // ultimo mese valido 'YYYY-MM', null = per sempre
  created_at: string
}

export interface TurnoSchema {
  id: string
  versione_id: string     // versione di configurazione a cui appartiene
  nome: string            // "Giorno", "Notte", …
  ora_inizio: string      // "HH:MM"
  ora_fine: string        // "HH:MM"
  n_turnisti: number      // quanti turnisti servono per questo turno
  ricorrenza: Ricorrenza
  giorni_custom: number[] // [1..7] usato solo se ricorrenza === 'custom'
  ordine: number          // ordinamento in lista
  created_at: string
}

// ─── Turno assegnato (una casella: giorno + tipo turno + slot → turnista) ─
export interface Turno {
  id: string
  data: string              // "YYYY-MM-DD"
  turno_schema_id: string   // FK → schema_turni
  slot: number              // 0..n_turnisti-1
  turnista_id: string | null
  created_at: string
}

// ─── Regole turni fisse (settimanali, versionate) ───────────────────
export interface RegolaVersione {
  id: string
  valido_da: string
  valido_fino: string | null
  ore_min_settimana: number | null
  created_at: string
}
export interface RegolaTurno {
  id: string
  regola_versione_id: string
  giorno_settimana: number   // 1=Lun … 7=Dom
  turno_schema_id: string
  slot: number
  turnista_id: string | null
  created_at: string
}

// ─── Auth ───────────────────────────────────────────────────────────
export interface AuthUser {
  id: string
  email: string
  livello: Livello
  nome: string | null
}
