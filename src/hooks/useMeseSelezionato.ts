import { useSyncExternalStore, useCallback } from 'react'

const KEY = 'gm_mese'
const VALID = /^\d{4}-(0[1-9]|1[0-2])$/

function meseCorrente(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function leggiIniziale(): string {
  try { const s = localStorage.getItem(KEY); if (s && VALID.test(s)) return s } catch { /* ignore */ }
  return meseCorrente()
}

// ── Store esterno condiviso (un solo valore per tutta l'app) ──
// Tutte le istanze del hook leggono/aggiornano lo STESSO mese: così cambiando
// mese in una pagina si aggiornano in tempo reale anche la sidebar e le altre
// viste, senza ricaricare.
let corrente = leggiIniziale()
const listeners = new Set<() => void>()
function notifica() { listeners.forEach(l => l()) }
function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb) } }
function getSnapshot() { return corrente }

/** Imposta il mese (formato 'YYYY-MM'), lo ricorda su localStorage e avvisa
 *  tutti i sottoscrittori. Usabile anche fuori da React (es. al login). */
export function setMeseKey(k: string) {
  if (!VALID.test(k) || k === corrente) return
  corrente = k
  try { localStorage.setItem(KEY, k) } catch { /* ignore */ }
  notifica()
}

// Sincronizza tra schede diverse dello stesso browser.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key === KEY && e.newValue && VALID.test(e.newValue) && e.newValue !== corrente) {
      corrente = e.newValue; notifica()
    }
  })
}

/**
 * Mese/anno selezionato, condiviso da tutte le pagine admin e dalla pagina
 * pubblica e RICORDATO su localStorage. Basato su uno store esterno: cambiarlo
 * in un punto qualsiasi si riflette immediatamente ovunque (sidebar inclusa).
 */
export function useMeseSelezionato() {
  const meseKey = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const anno = +meseKey.slice(0, 4)
  const mese = +meseKey.slice(5, 7)
  const setMeseAnno = useCallback((a: number, m: number) => {
    setMeseKey(`${a}-${String(m).padStart(2, '0')}`)
  }, [])
  return { anno, mese, meseKey, setMeseAnno }
}
