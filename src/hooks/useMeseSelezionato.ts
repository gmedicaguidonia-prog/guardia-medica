import { useState, useCallback } from 'react'

const KEY = 'gm_mese'

function init(): string {
  try {
    const s = localStorage.getItem(KEY)
    if (s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return s
  } catch { /* ignore */ }
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Mese/anno selezionato, RICORDATO per la sessione su localStorage (chiave
 * condivisa da tutte le pagine admin e dalla pagina pubblica). Così cambiando
 * pagina o ricaricando non si re-imposta al mese corrente.
 */
export function useMeseSelezionato() {
  const [meseKey, setKey] = useState<string>(init)
  const anno = +meseKey.slice(0, 4)
  const mese = +meseKey.slice(5, 7)
  const setMeseAnno = useCallback((a: number, m: number) => {
    const k = `${a}-${String(m).padStart(2, '0')}`
    try { localStorage.setItem(KEY, k) } catch { /* ignore */ }
    setKey(k)
  }, [])
  return { anno, mese, meseKey, setMeseAnno }
}
