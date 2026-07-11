// Account amministratore "permanente": non eliminabile/declassabile dalla UI.
// (Come negli altri progetti: viene seminato e protetto.)
export const ADMIN_EMAIL = 'marabelli.s@gmail.com'

// Da questo mese ('YYYY-MM') in poi vale la NUOVA procedura sequenziale: ogni
// mese va "attivato" passo per passo (config → regole → impaginazione →
// desiderata → turni). I mesi precedenti restano col vecchio comportamento.
// NB: abbassato a 2026-07 (08/07/2026) così anche luglio, se svuotato con
// "Cancella impostazioni", ripropone il gate "Copia/Conferma/Attiva nuova"
// come un mese vergine. I mesi di luglio già costruiti (Guidonia, Tivoli) sono
// stati marcati come attivati (backfill attivazioni_mese) per restare completi.
export const ATTIVAZIONE_DA = '2026-07'

// Giorni della settimana. Convenzione: 1 = Lunedì … 7 = Domenica
// (coerente con getDay() rimappato e con lo schema DB).
export const GIORNI_SETTIMANA: { num: number; abbr: string; nome: string }[] = [
  { num: 1, abbr: 'Lun', nome: 'Lunedì' },
  { num: 2, abbr: 'Mar', nome: 'Martedì' },
  { num: 3, abbr: 'Mer', nome: 'Mercoledì' },
  { num: 4, abbr: 'Gio', nome: 'Giovedì' },
  { num: 5, abbr: 'Ven', nome: 'Venerdì' },
  { num: 6, abbr: 'Sab', nome: 'Sabato' },
  { num: 7, abbr: 'Dom', nome: 'Domenica' },
]
