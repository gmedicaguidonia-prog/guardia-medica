// Temi dell'interfaccia: cambiano SOLO i colori d'identità (variabili --t-* in
// index.css); i colori semantici (festivi rossi, avvisi gialli, badge ruoli)
// restano fissi. La scelta è salvata per UTENTE (utenti.tema) + localStorage
// come cache locale per applicarla subito all'avvio senza "lampo" di colore.

export interface Tema { id: string; nome: string; c1: string; c2: string }   // c1/c2 = i due colori del quadratino

export const TEMI: Tema[] = [
  { id: 'verde',     nome: 'Verde bosco (classico)', c1: '#476540', c2: '#f4f1ea' },
  { id: 'azzurro',   nome: 'Azzurro Windows',        c1: '#1668b0', c2: '#eff4f9' },
  { id: 'bordeaux',  nome: 'Bordeaux',               c1: '#7d2a38', c2: '#f7f1f0' },
  { id: 'antracite', nome: 'Antracite',              c1: '#3f4a54', c2: '#f1f2f3' },
]

const LS_TEMA = 'gm_tema'

export function temaValido(id: string | null | undefined): string {
  return TEMI.some(t => t.id === id) ? (id as string) : 'verde'
}

/** Applica il tema al documento e lo ricorda in localStorage (cache locale). */
export function applicaTema(id: string): void {
  const t = temaValido(id)
  if (t === 'verde') delete document.documentElement.dataset.tema
  else document.documentElement.dataset.tema = t
  try { localStorage.setItem(LS_TEMA, t) } catch { /* ignore */ }
}

/** Tema ricordato su questo dispositivo (per l'avvio, prima del profilo). */
export function temaSalvato(): string {
  try { return temaValido(localStorage.getItem(LS_TEMA)) } catch { return 'verde' }
}
