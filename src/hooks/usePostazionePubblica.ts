import { useSyncExternalStore, useCallback } from 'react'

// Postazione scelta dal turnista nella pagina pubblica «I miei turni».
// Store esterno condiviso (come useMeseSelezionato): la pagina e la NavBar leggono/
// scrivono lo STESSO valore, così il selettore mesi in barra (mobile) usa gli stessi
// limiti della pagina e la query dei mesi-con-contenuto si deduplica. Persistito su
// localStorage e sincronizzato tra le schede.
const KEY = 'gm_postazione'

function leggiIniziale(): string | null {
  try { return localStorage.getItem(KEY) } catch { return null }
}

let corrente: string | null = leggiIniziale()
const listeners = new Set<() => void>()
function notifica() { listeners.forEach(l => l()) }
function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb) } }
function getSnapshot() { return corrente }

/** Imposta la postazione pubblica attiva, la ricorda su localStorage e avvisa i sottoscrittori. */
export function setPostazionePubblica(id: string | null) {
  if (id === corrente) return
  corrente = id
  try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY) } catch { /* ignore */ }
  notifica()
}

// Sincronizza tra schede diverse dello stesso browser.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key === KEY && e.newValue !== corrente) { corrente = e.newValue; notifica() }
  })
}

export function usePostazionePubblica() {
  const postazioneId = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const setPostazioneId = useCallback((id: string | null) => setPostazionePubblica(id), [])
  return { postazioneId, setPostazioneId }
}
