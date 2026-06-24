/**
 * useAuth — autenticazione globale.
 *
 * Due modalità, scelte automaticamente:
 *  - DEV (Supabase non configurato): login simulato. `devLogin(livello)`
 *    imposta un utente fittizio salvato in localStorage. Nessuna chiamata
 *    di rete. Serve a progettare l'interfaccia prima del backend.
 *  - REALE (Supabase configurato): flusso OAuth Google + verifica whitelist
 *    via RPC `get_my_profile`. Portato dagli altri progetti dove funziona.
 */

import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import {
  getCachedProfile, setCachedProfile, clearCachedProfile,
  flagUnauthorized, detachedSignOut, fetchProfile, fetchTurnistaPostazione,
} from '../lib/authHelpers'
import { ADMIN_EMAIL } from '../lib/constants'
import type { AuthUser, Livello } from '../types'
import type { Session } from '@supabase/supabase-js'

const DEV = !isSupabaseConfigured
const DEV_KEY = 'gm_dev_user'
const SETUP_TIMEOUT_MS = 25_000

function getDevUser(): AuthUser | null {
  try { const raw = localStorage.getItem(DEV_KEY); return raw ? (JSON.parse(raw) as AuthUser) : null }
  catch { return null }
}
function persistDevUser(u: AuthUser | null) {
  try {
    if (u) localStorage.setItem(DEV_KEY, JSON.stringify(u))
    else   localStorage.removeItem(DEV_KEY)
  } catch {}
}

const SESSION_UID_KEY = 'gm_session_uid'

/** Al PRIMO login di un utente (cambio identità) reimposta le selezioni di
 *  default: mese corrente e postazione in cui è "turnista". Su reload con la
 *  stessa identità NON tocca nulla, così la selezione resta memorizzata. */
async function applyLoginDefaults(accessToken: string, u: AuthUser) {
  let prev: string | null = null
  try { prev = localStorage.getItem(SESSION_UID_KEY) } catch {}
  if (prev === u.id) return   // stessa sessione (reload): mantieni la selezione
  try {
    const d = new Date()
    localStorage.setItem('gm_mese', `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    const post = await fetchTurnistaPostazione(accessToken, u.id)
    if (post) localStorage.setItem('gm_postazione', post)
    localStorage.setItem(SESSION_UID_KEY, u.id)
  } catch {}
}

export function useAuth() {
  const [user,    setUser]    = useState<AuthUser | null>(() => DEV ? getDevUser() : getCachedProfile())
  const [loading, setLoading] = useState(!DEV)

  useEffect(() => {
    if (DEV) return   // modalità DEV: nessun setup async
    let cancelled = false

    async function processSession(session: Session) {
      const email = session.user.email ?? ''

      const cached = getCachedProfile()
      if (cached && cached.email.toLowerCase() === email.toLowerCase()) {
        if (cancelled) return
        setUser(cached); setLoading(false); return
      }

      const result = await fetchProfile(session.access_token)
      if (cancelled) return

      if (result && typeof result === 'object' && 'error' in result) {
        flagUnauthorized(email, `errore RPC: ${result.error}`)
        detachedSignOut(); setUser(null); setLoading(false); return
      }
      if (!result) {
        flagUnauthorized(email, 'email non in elenco turnisti autorizzati')
        detachedSignOut(); setUser(null); setLoading(false); return
      }
      setCachedProfile(result)
      await applyLoginDefaults(session.access_token, result)
      if (cancelled) return
      setUser(result); setLoading(false)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return
      if (event === 'SIGNED_OUT') { clearCachedProfile(); try { localStorage.removeItem(SESSION_UID_KEY) } catch {} setUser(null); setLoading(false); return }
      if (event === 'SIGNED_IN' && session?.user?.email) { await processSession(session); return }
    })

    ;(async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (cancelled) return
        if (error) {
          flagUnauthorized('(setup)', `getSession: ${error.message}`)
          setUser(null); setLoading(false); return
        }
        if (data.session?.user?.email) await processSession(data.session)
        else { clearCachedProfile(); setUser(null); setLoading(false) }
      } catch (e) {
        if (cancelled) return
        flagUnauthorized('(setup)', `eccezione: ${(e as Error).message}`)
        setUser(null); setLoading(false)
      }
    })()

    const timeoutId = setTimeout(() => { if (!cancelled) setLoading(false) }, SETUP_TIMEOUT_MS)

    return () => { cancelled = true; clearTimeout(timeoutId); subscription.unsubscribe() }
  }, [])

  async function signInWithGoogle() {
    if (DEV) return
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) console.error('[Auth] Errore login Google:', error)
  }

  /** Login simulato — solo in modalità DEV. */
  function devLogin(livello: Livello) {
    if (!DEV) return
    const u: AuthUser = {
      id:      'dev-' + livello,
      email:   livello === 'admin' ? ADMIN_EMAIL : `${livello}@dev.local`,
      livello,
      nome:    livello === 'admin' ? 'Admin (DEV)'
             : livello === 'responsabile' ? 'Responsabile (DEV)'
             : livello === 'turnista' ? 'Turnista (DEV)' : 'Esterno (DEV)',
      cognome: null,
      postazioneId: 'dev-postazione-1',
    }
    persistDevUser(u); setUser(u)
  }

  async function signOut() {
    if (DEV) { persistDevUser(null); setUser(null); return }
    clearCachedProfile()
    try { localStorage.removeItem(SESSION_UID_KEY) } catch {}
    await supabase.auth.signOut()
    setUser(null)
  }

  return { user, loading, signInWithGoogle, signOut, devLogin, isDev: DEV }
}
