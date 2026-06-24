import { createContext, useContext, useState, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { AuthUser } from '../types'

const LS_KEY = 'gm_debug'

interface DebugStored { adminMode: boolean; doppleganger: AuthUser | null }

interface Ctx {
  realUser: AuthUser | null          // utente reale loggato
  effectiveUser: AuthUser | null     // utente "efficace" che usa tutta l'app
  isRealAdmin: boolean               // il reale e' admin (mostra i badge di debug)
  adminMode: boolean                 // pieni poteri admin attivi
  doppleganger: AuthUser | null      // utente impersonato (se attivo)
  setAdminMode: (on: boolean) => void
  setDoppleganger: (u: AuthUser | null) => void
}

const DebugCtx = createContext<Ctx>({
  realUser: null, effectiveUser: null, isRealAdmin: false, adminMode: false, doppleganger: null,
  setAdminMode: () => {}, setDoppleganger: () => {},
})

function readStored(): DebugStored {
  try {
    const r = localStorage.getItem(LS_KEY)
    if (r) { const o = JSON.parse(r); return { adminMode: !!o.adminMode, doppleganger: o.doppleganger ?? null } }
  } catch { /* ignore */ }
  return { adminMode: false, doppleganger: null }
}

export function DebugProvider({ realUser, children }: { realUser: AuthUser | null; children: ReactNode }) {
  const isRealAdmin = realUser?.livello === 'admin'
  const [stored, setStored] = useState<DebugStored>(readStored)

  // persistenza + sincronizzazione tra finestre (admin e pubblica condividono il debug)
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(stored)) } catch { /* ignore */ } }, [stored])
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === LS_KEY) setStored(readStored()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const adminMode = !!isRealAdmin && stored.adminMode
  const doppleganger = isRealAdmin ? stored.doppleganger : null

  const effectiveUser = useMemo<AuthUser | null>(() => {
    if (!realUser) return null
    if (!isRealAdmin) return realUser                 // non-admin: nessun override
    if (doppleganger) return doppleganger             // doppleganger: permessi dell'utente scelto
    if (adminMode) return realUser                    // modalita' admin: pieni poteri
    return { ...realUser, livello: 'turnista' }        // default "normale": utente senza poteri admin
  }, [realUser, isRealAdmin, adminMode, doppleganger])

  const value: Ctx = {
    realUser, effectiveUser, isRealAdmin, adminMode, doppleganger,
    setAdminMode: (on) => setStored({ adminMode: on, doppleganger: null }),
    setDoppleganger: (u) => setStored({ adminMode: false, doppleganger: u }),
  }
  return <DebugCtx.Provider value={value}>{children}</DebugCtx.Provider>
}

export function useDebug() { return useContext(DebugCtx) }
