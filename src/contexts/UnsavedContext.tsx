import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

/** Stato globale "ci sono modifiche non salvate" — usato dall'AdminLayout per
 *  bloccare il cambio pagina, e impostato dalle pagine che hanno una bozza
 *  (es. Configurazione Turni). */
interface UnsavedCtx {
  hasUnsaved: boolean
  setHasUnsaved: (v: boolean) => void
}

const Ctx = createContext<UnsavedCtx>({ hasUnsaved: false, setHasUnsaved: () => {} })

export function UnsavedProvider({ children }: { children: ReactNode }) {
  const [hasUnsaved, setHasUnsaved] = useState(false)
  return <Ctx.Provider value={{ hasUnsaved, setHasUnsaved }}>{children}</Ctx.Provider>
}

export function useUnsaved() {
  return useContext(Ctx)
}
