// ─── Ruoli / livelli di autorizzazione ─────────────────────────────
//  - 'admin'        → proprietario permanente, gestione completa (badge rosso)
//  - 'responsabile' → gestione completa come admin, non permanente (badge giallo)
//  - 'turnista'     → vede i propri turni nella pagina pubblica
//  - 'esterno'      → ospite/sostituto: vede i turni, accesso limitato
export type Livello = 'admin' | 'responsabile' | 'turnista' | 'esterno'

export const LIVELLI: { value: Livello; label: string }[] = [
  { value: 'admin',        label: 'Admin' },
  { value: 'responsabile', label: 'Responsabile' },
  { value: 'turnista',     label: 'Turnista' },
  { value: 'esterno',      label: 'Esterno' },
]

/** Livelli con poteri di gestione (admin + responsabile = gli ex-admin). */
export function puoGestire(l: Livello | null | undefined): boolean {
  return l === 'admin' || l === 'responsabile'
}

// ─── Utente (identità globale: una persona, una email) ──────────────
export interface Utente {
  id: string
  nome: string
  cognome: string
  email: string
}

// ─── Turnista = APPARTENENZA (utente × postazione × livello) ─────────
//  id = id dell'appartenenza; utente_id = identità globale.
export interface Turnista {
  id: string
  utente_id: string
  nome: string       // dall'utente
  cognome: string    // dall'utente
  email: string      // dall'utente
  livello: Livello   // ruolo IN QUESTA postazione (responsabile|turnista|esterno)
  created_at: string
}

/** Livelli assegnabili nel personale di una postazione (admin è globale, non qui). */
export const LIVELLI_PERSONALE = LIVELLI.filter(l => l.value !== 'admin')

/** Nominativo completo nella forma "Cognome Nome". */
export function nomeCompleto(t: { nome?: string | null; cognome?: string | null }): string {
  const c = (t.cognome ?? '').trim()
  const n = (t.nome ?? '').trim()
  return [c, n].filter(Boolean).join(' ')
}
/** Comparatore alfabetico per "Cognome Nome" (ordinamento italiano). */
export function cmpTurnisti(a: { nome?: string | null; cognome?: string | null }, b: { nome?: string | null; cognome?: string | null }): number {
  return nomeCompleto(a).localeCompare(nomeCompleto(b), 'it')
}

/** Etichette di gruppo (plurali) per livello. */
export const LIVELLO_GRUPPO: Record<Livello, string> = {
  admin: 'Admin', responsabile: 'Responsabili', turnista: 'Turnisti', esterno: 'Esterni',
}
/** Raggruppa i turnisti per livello (Admin→Esterno), alfabetico "Cognome Nome" dentro ogni gruppo.
 *  Restituisce solo i gruppi non vuoti. Usato in TUTTE le viste che elencano turnisti. */
export function gruppiPerLivello<T extends { livello: Livello; nome?: string | null; cognome?: string | null }>(lista: T[]): { liv: Livello; label: string; items: T[] }[] {
  return (['admin', 'responsabile', 'turnista', 'esterno'] as Livello[])
    .map(liv => ({ liv, label: LIVELLO_GRUPPO[liv], items: lista.filter(t => t.livello === liv).slice().sort(cmpTurnisti) }))
    .filter(g => g.items.length)
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

// ─── Desiderata / Indisponibilità ───────────────────────────────────
//  Una preferenza espressa da (o per) un turnista su uno specifico turno:
//  'desiderata' = lo vorrebbe fare, 'indisponibilita' = non può farlo.
export type TipoDesiderata = 'desiderata' | 'indisponibilita'

export interface Desiderata {
  id: string
  data: string             // 'YYYY-MM-DD'
  turno_schema_id: string  // FK → schema_turni
  turnista_id: string
  tipo: TipoDesiderata
  created_at: string
}

/** Finestra (per mese) in cui la raccolta desiderata è aperta ai turnisti. */
export interface DesiderataFinestra {
  mese: string             // 'YYYY-MM'
  aperta_da: string | null // 'YYYY-MM-DD'
  aperta_a: string | null  // 'YYYY-MM-DD'
}

// ─── Postazioni (multi-tenancy) ─────────────────────────────────────
//  Ogni postazione è un "mondo" a sé: turnisti, configurazioni, regole,
//  desiderata e turni sono filtrati per postazione_id.
export interface Postazione {
  id: string
  nome: string
  attiva: boolean
  created_at: string
}

// ─── Auth ───────────────────────────────────────────────────────────
export interface AuthUser {
  id: string
  email: string
  livello: Livello
  nome: string | null
  cognome: string | null
  postazioneId: string | null   // postazione di appartenenza (per turnisti/esterni)
}
