import { useState, useEffect } from 'react'

interface VersioneValidita { id: string; valido_da: string; valido_fino: string | null }

/**
 * Stato STAGED per la validità di un periodo versionato (per sempre / fino a),
 * condiviso da Configurazione Turni, Regole Turni e Impaginazione.
 *
 * Niente auto-save: il clic su «Fino a» propone di default il mese visualizzato
 * (senza applicare nulla) e `dirty` segnala che c'è da salvare. Il salvataggio
 * vero e proprio resta a carico della pagina (store method + notifica diversi).
 */
export function useValiditaStaged(versione: VersioneValidita | null | undefined, meseKey: string) {
  const [fino, setFino] = useState(false)        // "Fino a" selezionato
  const [meseFino, setMeseFino] = useState('')   // 'YYYY-MM' quando "fino a"

  // riallinea la bozza al valore salvato quando cambia la versione (o il suo valido_fino)
  useEffect(() => {
    setFino(versione?.valido_fino != null)
    setMeseFino(versione?.valido_fino ?? '')
  }, [versione?.id, versione?.valido_fino])

  const draft = fino ? meseFino : null                                   // null = per sempre
  const dirty = !!versione && draft !== (versione.valido_fino ?? null)

  const ref = meseFino || meseKey                                        // fallback per i select
  const selY = +ref.slice(0, 4), selM = +ref.slice(5, 7)

  const perSempre = () => setFino(false)
  const scegliFino = () => {
    if (!versione) return
    setFino(true)
    const def = meseKey >= versione.valido_da ? meseKey : versione.valido_da
    if (!meseFino || meseFino < versione.valido_da) setMeseFino(def)     // default = mese visualizzato
  }
  const setMeseSel = (m: number) => setMeseFino(`${selY}-${String(m).padStart(2, '0')}`)
  const setAnnoSel = (y: number) => setMeseFino(`${y}-${String(selM).padStart(2, '0')}`)
  const reset = () => { setFino(versione?.valido_fino != null); setMeseFino(versione?.valido_fino ?? '') }

  return { fino, draft, dirty, selY, selM, perSempre, scegliFino, setMeseSel, setAnnoSel, reset }
}

export type ValiditaStaged = ReturnType<typeof useValiditaStaged>
