import { useEffect, useState } from 'react'

/**
 * Controlla periodicamente `version.json` (scritto ad ogni build con il
 * commit SHA). Se la versione pubblicata è diversa da quella con cui sta
 * girando l'app, segnala che c'è un aggiornamento disponibile.
 *
 * `applyUpdate()` forza un refresh "duro" con cache-bust: l'HTML di GitHub
 * Pages viene cachato (fino a ~10 min), quindi un reload normale potrebbe
 * ricaricare ancora il bundle vecchio. Aggiungendo `?_r=<ts>` l'URL diventa
 * nuovo → cache miss → l'origin serve l'HTML aggiornato col nuovo bundle.
 */
export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    const current = __APP_VERSION__
    if (current === 'dev') return   // in locale niente controllo
    let stopped = false

    async function check() {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { v?: string }
        if (!stopped && data?.v && data.v !== current) setUpdateAvailable(true)
      } catch { /* offline o 404: ignora */ }
    }

    check()
    const id = window.setInterval(check, 30_000)
    const onWake = () => { if (document.visibilityState === 'visible') check() }
    window.addEventListener('focus', onWake)
    document.addEventListener('visibilitychange', onWake)
    return () => {
      stopped = true
      clearInterval(id)
      window.removeEventListener('focus', onWake)
      document.removeEventListener('visibilitychange', onWake)
    }
  }, [])

  function applyUpdate() {
    // Ricarica sempre dalla ROOT dell'app: evita il 404 di GitHub Pages sulle
    // rotte profonde (es. /admin/desiderata) durante il reload "duro".
    // Il router riporterà l'utente alla pagina giusta in base al ruolo.
    const base = import.meta.env.BASE_URL || '/'
    window.location.replace(`${base}?_r=${Date.now()}`)
  }

  return { updateAvailable, applyUpdate }
}
