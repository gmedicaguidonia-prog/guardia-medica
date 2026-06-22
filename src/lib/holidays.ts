// Festività italiane + utilità per le ricorrenze dei turni.

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

const cacheFestivi = new Map<number, Set<string>>()
/** Festività nazionali italiane (date fisse) + Pasqua e Pasquetta, per anno. */
export function festiviAnno(anno: number): Set<string> {
  const cached = cacheFestivi.get(anno)
  if (cached) return cached
  const s = new Set<string>()
  const fissi = ['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26']
  fissi.forEach(md => s.add(`${anno}-${md}`))
  const p = pasqua(anno)
  const pasquetta = new Date(p); pasquetta.setDate(p.getDate() + 1)
  s.add(isoDate(p)); s.add(isoDate(pasquetta))
  cacheFestivi.set(anno, s)
  return s
}

export function isFestivo(d: Date): boolean {
  return d.getDay() === 0 || festiviAnno(d.getFullYear()).has(isoDate(d))
}
export function isPrefestivo(d: Date): boolean {
  if (isFestivo(d)) return false
  const dopo = new Date(d); dopo.setDate(d.getDate() + 1)
  return isFestivo(dopo)
}
export function isFeriale(d: Date): boolean {
  const wd = d.getDay()
  return wd >= 1 && wd <= 5 && !isFestivo(d)
}
/** 1 = Lunedì … 7 = Domenica */
export function giornoSettimana(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1
}
