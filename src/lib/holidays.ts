// Festività + utilità per le ricorrenze dei turni.
// I festivi possono essere PILOTATI DA DB (nazione della postazione + festività
// locali): le funzioni accettano un `festivoSet` opzionale (date ISO). Senza set,
// ricadono sulle festività nazionali italiane (retrocompatibilità).

/** Domenica di Pasqua (algoritmo di Gauss). */
export function pasqua(anno: number): Date {
  const a = anno % 19
  const b = Math.floor(anno / 100), c = anno % 100
  const d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mese = Math.floor((h + l - 7 * m + 114) / 31)
  const giorno = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(anno, mese - 1, giorno)
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Una festività nazionale con nome, per la visualizzazione. */
export interface FestivitaNazionale { data: string; nome: string }

/** Festività nazionali italiane (con nomi) per un anno: date fisse + Pasqua e Lunedì dell'Angelo. */
function festiviIT(anno: number): FestivitaNazionale[] {
  const fissi: { md: string; nome: string }[] = [
    { md: '01-01', nome: 'Capodanno' }, { md: '01-06', nome: 'Epifania' },
    { md: '04-25', nome: 'Liberazione' }, { md: '05-01', nome: 'Festa dei Lavoratori' },
    { md: '06-02', nome: 'Festa della Repubblica' }, { md: '08-15', nome: 'Ferragosto' },
    { md: '11-01', nome: 'Ognissanti' }, { md: '12-08', nome: 'Immacolata' },
    { md: '12-25', nome: 'Natale' }, { md: '12-26', nome: 'Santo Stefano' },
  ]
  const out: FestivitaNazionale[] = fissi.map(x => ({ data: `${anno}-${x.md}`, nome: x.nome }))
  const p = pasqua(anno)
  const pasquetta = new Date(p); pasquetta.setDate(p.getDate() + 1)
  out.push({ data: isoDate(p), nome: 'Pasqua' }, { data: isoDate(pasquetta), nome: "Lunedì dell'Angelo" })
  return out
}

/** Nazioni supportate (per ora solo Italia; predisposto per estensioni). */
export const NAZIONI: { value: string; label: string }[] = [
  { value: 'IT', label: 'Italia' },
]

/** Festività nazionali (con nomi) di una nazione per un anno. */
export function festiviNazionali(nazione: string, anno: number): FestivitaNazionale[] {
  switch (nazione) {
    case 'IT':
    default: return festiviIT(anno)
  }
}

const cacheFestivi = new Map<number, Set<string>>()
/** Set delle festività nazionali italiane (solo date, per anno). Retrocompatibilità. */
export function festiviAnno(anno: number): Set<string> {
  const cached = cacheFestivi.get(anno)
  if (cached) return cached
  const s = new Set(festiviIT(anno).map(f => f.data))
  cacheFestivi.set(anno, s)
  return s
}

/** Set festivo pronto per isFestivo: festività NAZIONALI della nazione su un range di
 *  anni + festività LOCALI (date ISO passate). NON include le domeniche (le aggiunge isFestivo). */
export function buildFestivoSet(nazione: string, customDates: Iterable<string>, years: number[]): Set<string> {
  const s = new Set<string>(customDates)
  for (const y of years) for (const f of festiviNazionali(nazione, y)) s.add(f.data)
  return s
}

/** È un giorno festivo? Domenica OPPURE nel set. Senza set → festività nazionali IT (retrocompat). */
export function isFestivo(d: Date, festivoSet?: Set<string>): boolean {
  if (d.getDay() === 0) return true
  if (festivoSet) return festivoSet.has(isoDate(d))
  return festiviAnno(d.getFullYear()).has(isoDate(d))
}
/** Vigilia di un festivo (non festivo, ma il giorno dopo lo è). */
export function isPrefestivo(d: Date, festivoSet?: Set<string>): boolean {
  if (isFestivo(d, festivoSet)) return false
  const dopo = new Date(d); dopo.setDate(d.getDate() + 1)
  return isFestivo(dopo, festivoSet)
}
/** Giorno feriale (Lun–Ven e non festivo). */
export function isFeriale(d: Date, festivoSet?: Set<string>): boolean {
  const wd = d.getDay()
  return wd >= 1 && wd <= 5 && !isFestivo(d, festivoSet)
}
/** È un SUPERFESTIVO? Solo se la data è nel set (NESSUN default: va marcato a mano). */
export function isSuperfestivo(d: Date, superSet?: Set<string>): boolean {
  return !!superSet && superSet.has(isoDate(d))
}
/** 1 = Lunedì … 7 = Domenica */
export function giornoSettimana(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1
}
