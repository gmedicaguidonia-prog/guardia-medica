// Account amministratore "permanente": non eliminabile/declassabile dalla UI.
// (Come negli altri progetti: viene seminato e protetto.)
export const ADMIN_EMAIL = 'marabelli.s@gmail.com'

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
