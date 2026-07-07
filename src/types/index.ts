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

/** Ha accesso all'amministrazione: è admin (globale) oppure Supervisore.
 *  ⚠️ Il ruolo 'responsabile' del mese NON dà più accesso: è solo un'etichetta.
 *  L'accesso si gestisce nella lista Supervisori (Centro di Controllo). */
export function haAccessoAdmin(u: { livello: Livello; isSupervisore?: boolean } | null | undefined): boolean {
  return !!u && (u.livello === 'admin' || !!u.isSupervisore)
}

// ─── Utente (identità globale: una persona, una email) ──────────────
export interface Utente {
  id: string
  nome: string
  cognome: string
  email: string
}

/** Utente impersonabile (debug "doppleganger"): livello = max dalle appartenenze. */
export interface UtenteImpersonabile {
  id: string
  nome: string
  cognome: string
  email: string
  livello: Livello
  postazioneId: string | null
}

/** Utente con il flag amministratore globale (riquadro "Amministratori"). */
export interface UtenteAdmin {
  id: string
  nome: string
  cognome: string
  email: string
  admin: boolean
}

/** Supervisore = chi ha accesso all'amministrazione (indipendente dal ruolo del mese). */
export interface Supervisore {
  id: string          // = utente_id
  nome: string
  cognome: string
  email: string
  tuttePostazioni: boolean   // true = tutte (anche future); ignora l'elenco sotto
  postazioni: string[]       // id delle postazioni gestite
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

/** Una postazione a cui l'utente appartiene (per la pagina pubblica). */
// Personale "del mese": chi è in servizio in un dato mese e con quale ruolo (congelato per quel mese).
// Indipendente dal ruolo globale in `turnisti`: i mesi passati restano fotografati.
export interface TurnistaMese {
  turnista_id: string
  livello: Livello
}

export interface MiaPostazione {
  postazioneId: string
  nome: string
  membershipId: string   // turnisti.id (= turnista_id nelle desiderata/turni)
  livello: Livello
}

/** Capitalizza ogni parola: iniziale maiuscola, resto minuscolo. "MARIO de luca" → "Mario De Luca". */
export function capNome(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/(^|[\s'’\-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
}
/** Nominativo completo nella forma "Cognome Nome" (con iniziali maiuscole). */
export function nomeCompleto(t: { nome?: string | null; cognome?: string | null }): string {
  const c = capNome((t.cognome ?? '').trim())
  const n = capNome((t.nome ?? '').trim())
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
  ore_max_settimana: number | null      // ore che i turnisti non dovrebbero superare (auto-assegnazione)
  ore_max_consecutive: number | null    // massimo di ore consecutive (turni attaccati) per turnista
  cambio_auto: boolean        // true = cambio turno automaticamente approvato
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

// ─── Regole speciali per turnista (limiti personali, versionate come le regole) ───
//  Si SOMMANO ai vincoli generali: vanno rispettate dall'Auto Assegnazione e
//  segnalate (con possibilità di forzare) nell'assegnazione manuale.
export type TipoRegolaTurnista = 'max_sett' | 'max_mese'
export const TIPI_REGOLA_TURNISTA: { value: TipoRegolaTurnista; label: string; unita: string }[] = [
  { value: 'max_sett', label: 'Massimo turni a settimana', unita: 'turni/sett.' },
  { value: 'max_mese', label: 'Massimo turni in un mese',  unita: 'turni/mese' },
]
export interface RegolaTurnista {
  id: string
  regola_versione_id: string
  turnista_id: string
  tipo: TipoRegolaTurnista
  valore: number
  created_at?: string
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
  pubbliche: boolean        // true = desiderata visibili a tutti i turnisti (vista a colonne)
}

// ─── Festività / Superfestivi ───────────────────────────────────────
/** Festività LOCALE (custom) di una postazione, aggiunta a mano. */
export interface Festivita {
  id: string
  data: string          // 'YYYY-MM-DD'
  descrizione: string
}
/** Una festività nel mese (nazionale calcolata o locale), con stato superfestivo e,
 *  se super, i turni del mese che ne usufruiscono. Usata dalla pagina Festività. */
export interface FestivitaMese {
  data: string          // 'YYYY-MM-DD'
  nome: string          // "Ferragosto" (nazionale) o la descrizione (locale)
  locale: boolean       // true = locale (custom), false = nazionale
  superfestivo: boolean // marcata come superfestivo per questa postazione
  turni: string[]       // turno_schema_id abbinati (rilevante solo se super)
}

// ─── Stato del calendario turni (per postazione × mese) ─────────────
//  Controlla cosa vede il turnista nella pagina pubblica "I miei turni":
//   - 'non_pubblicato' → niente, solo un avviso "non ancora pubblicato"
//   - 'pubblicato'     → il calendario con i turni pianificati
//   - 'pianificazione' → calendario pubblicato ma incompleto: i posti scoperti
//                        mostrano un badge «???» su cui i turnisti si candidano
export type StatoCalendario = 'non_pubblicato' | 'pubblicato' | 'pianificazione'

export const STATI_CALENDARIO: { value: StatoCalendario; label: string; descr: string }[] = [
  { value: 'non_pubblicato', label: 'Non Pubblicato',          descr: 'I turnisti non vedono il calendario: compare solo un avviso che non è ancora stato pubblicato.' },
  { value: 'pubblicato',     label: 'Pubblicato',              descr: 'I turnisti vedono il calendario con i turni pianificati.' },
  { value: 'pianificazione', label: 'Modalità Pianificazione', descr: 'Il calendario viene pubblicato anche se incompleto: dove manca un turnista compare un badge rosso «???». I turnisti possono cliccarci per candidarsi al turno e il responsabile approva o rifiuta le richieste.' },
]

/** Stile del badge/pulsante che riflette lo stato del calendario. */
export const STATO_CALENDARIO_STILE: Record<StatoCalendario, { bg: string; fg: string; border: string }> = {
  non_pubblicato: { bg: '#f1f5f9', fg: '#475569', border: '#cbd5e1' },
  pubblicato:     { bg: '#dcfce7', fg: '#166534', border: '#86efac' },
  pianificazione: { bg: '#dbeafe', fg: '#1e40af', border: '#93c5fd' },
}

// ─── Richieste di turno (candidature in "Modalità Pianificazione") ──
//  Un turnista si propone per un turno scoperto. Il responsabile poi approva
//  (lo mette in turno) o rifiuta. Lo stato resta registrato così il candidato,
//  se prova ad annullare, sa se è ancora in attesa, già approvata o rifiutata.
export type StatoRichiesta = 'in_attesa' | 'approvata' | 'rifiutata'

export interface RichiestaTurno {
  id: string
  data: string             // 'YYYY-MM-DD'
  turno_schema_id: string
  turnista_id: string      // appartenenza (turnisti.id) di chi si propone
  stato: StatoRichiesta
  created_at: string
}

// ─── Notifiche (eventi della gestione del mese) ─────────────────────
//  per_admin=true → Centro Notifiche dell'admin; turnista_id valorizzato →
//  Centro Messaggi di quel turnista. target = rotta admin per il bottone "Vai".
export interface Notifica {
  id: string
  postazioneId: string
  mese: string             // 'YYYY-MM' di riferimento
  tipo: string
  messaggio: string
  target: string | null    // es. '/admin/desiderata'
  perAdmin: boolean
  turnistaId: string | null
  autore: string | null    // nome di chi ha fatto l'operazione
  letta: boolean
  created_at: string
}
// Log eventi globali sulle postazioni (creazione/modifica/eliminazione).
// Tabella a sé: non legata a una postazione, così l'eliminazione non lo cancella.
export interface LogPostazione {
  id: string
  messaggio: string
  autore: string | null
  createdAt: string
}
// Versione (snapshot completo) del calendario turni di un mese, per il ripristino.
export interface BackupTurni {
  id: string
  mese: string
  motivo: string | null
  autore: string | null
  nTurni: number
  createdAt: string
}
// Una singola assegnazione dentro lo snapshot di una versione.
export interface SnapshotTurno {
  data: string
  turno_schema_id: string
  slot: number
  turnista_id: string | null
}
/** Categorie (sottodiv) del Centro Notifiche admin: ordine + etichetta + tipi. */
export const NOTIFICA_CATEGORIE: { key: string; label: string; tipi: string[] }[] = [
  { key: 'pianificazione', label: 'Pianificazione turni',     tipi: ['calendario_pianificazione', 'auto_assegnazione'] },
  { key: 'cambi',          label: 'Cambi turno',              tipi: ['cambio_richiesto', 'cambio_approvato', 'cambio_rifiutato'] },
  { key: 'candidature',    label: 'Candidature',              tipi: ['candidatura'] },
  { key: 'cancellazioni',  label: 'Cancellazioni / ritiri',   tipi: ['candidatura_ritirata', 'turno_svuotato'] },
  { key: 'calendario',     label: 'Modifica del calendario',  tipi: ['calendario_pubblicato', 'calendario_nascosto', 'turni_salvati'] },
  { key: 'disponibilita',  label: 'Disponibilità',            tipi: ['desiderata_creata', 'desiderata_pubblicata', 'desiderata_pubbliche', 'desiderata_chiusa', 'desiderata_compilate'] },
  { key: 'configurazione', label: 'Configurazione',           tipi: ['config_turni', 'regole', 'impaginazione', 'personale', 'postazione', 'admin'] },
]
const _NOTIFICA_TIPO_CAT = new Map<string, string>()
NOTIFICA_CATEGORIE.forEach(c => c.tipi.forEach(t => _NOTIFICA_TIPO_CAT.set(t, c.key)))
export function categoriaNotifica(tipo: string): string { return _NOTIFICA_TIPO_CAT.get(tipo) ?? 'configurazione' }

/** Candidatura in attesa di un turnista (mostrata nel Centro Messaggi, con "Ritira"). */
export interface CandidaturaAttesa {
  id: string
  data: string
  postazioneId: string
  turnoSchemaId: string
  turnistaId: string
  turnoNome: string
  postazioneNome: string
}

// ─── Impaginazione (fogli = griglie nominate di turni, versionate) ──
//  Ogni "foglio" raggruppa un sottoinsieme dei turni del mese; Desiderata,
//  Turni del Mese e la pagina pubblica generano UNA griglia per foglio.
export interface ImpaginazioneVersione {
  id: string
  valido_da: string
  valido_fino: string | null
  created_at: string
}
export interface Foglio {
  id: string
  versione_id: string
  nome: string
  ordine: number
  created_at: string
}
/** Assegnazione turno→foglio (un turno in un solo foglio per versione). */
export interface FoglioTurno {
  versione_id: string
  turno_schema_id: string
  foglio_id: string
}

// ─── Postazioni (multi-tenancy) ─────────────────────────────────────
//  Ogni postazione è un "mondo" a sé: turnisti, configurazioni, regole,
//  desiderata e turni sono filtrati per postazione_id.
export interface Postazione {
  id: string
  nome: string
  attiva: boolean
  created_at: string
  nazione?: string    // codice nazione per i festivi (default 'IT')
}

// ─── Auth ───────────────────────────────────────────────────────────
export interface AuthUser {
  id: string
  email: string
  livello: Livello
  nome: string | null
  cognome: string | null
  postazioneId: string | null   // postazione di appartenenza (per turnisti/esterni)
  isSupervisore: boolean        // ha accesso all'amministrazione (lista Supervisori)
  tuttePostazioni: boolean      // supervisore di TUTTE le postazioni (presenti e future)
  tema?: string | null          // tema interfaccia scelto dall'utente (vedi lib/temi.ts)
}
