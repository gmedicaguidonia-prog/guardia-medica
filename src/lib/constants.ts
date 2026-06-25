// Account amministratore "permanente": non eliminabile/declassabile dalla UI.
// (Come negli altri progetti: viene seminato e protetto.)
export const ADMIN_EMAIL = 'marabelli.s@gmail.com'

// Da questo mese ('YYYY-MM') in poi vale la NUOVA procedura sequenziale: ogni
// mese va "attivato" passo per passo (config → regole → impaginazione →
// desiderata → turni). I mesi precedenti restano col vecchio comportamento.
export const ATTIVAZIONE_DA = '2026-08'

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
