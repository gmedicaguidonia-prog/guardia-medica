/**
 * authHelpers — utility condivise per il controllo del profilo autorizzato.
 * Usate solo nel flusso Supabase reale (non in modalità DEV).
 * Niente JSX / niente hook — solo funzioni pure.
 */

import { supabase, supabaseUrl, supabaseAnonKey } from './supabase'
import type { AuthUser } from '../types'

export const CACHE_KEY  = 'auth_user_profile_v5'
export const UNAUTH_KEY = 'auth_unauthorized_email'

// ── Cache profilo (sessionStorage) ──────────────────────────────────
export function getCachedProfile(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch { return null }
}
export function setCachedProfile(u: AuthUser) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(u)) } catch {}
}
export function clearCachedProfile() {
  try { sessionStorage.removeItem(CACHE_KEY) } catch {}
}

// ── Flag "accesso negato" → letto da LoginPage per il banner ────────
export function flagUnauthorized(email: string, reason: string) {
  console.warn(`[Auth] Non autorizzato (${reason}):`, email.toLowerCase())
  try {
    sessionStorage.setItem(UNAUTH_KEY, JSON.stringify({ email: email.toLowerCase(), reason }))
  } catch {}
}

// ── Logout "detached" (no await dentro un auth event handler) ───────
export function detachedSignOut() {
  try {
    const refMatch = supabaseUrl.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i)
    const projectRef = refMatch?.[1]
    if (projectRef) localStorage.removeItem(`sb-${projectRef}-auth-token`)
  } catch {}
  setTimeout(() => {
    supabase.auth.signOut().catch(err => console.error('[Auth] signOut background error:', err))
  }, 0)
}

// ── Postazione in cui l'utente è "turnista" (per il default al login) ──
//  REST diretto con il JWT dell'utente (RLS: vede la propria appartenenza).
//  null se non è turnista da nessuna parte.
export async function fetchTurnistaPostazione(accessToken: string, userId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/turnisti?utente_id=eq.${userId}&livello=eq.turnista&select=postazione_id&limit=1`,
      { headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${accessToken}` } },
    )
    if (!res.ok) return null
    const data = await res.json().catch(() => null) as unknown
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : null
    return (row?.postazione_id as string | undefined) ?? null
  } catch { return null }
}

// ── Fetch RPC get_my_profile (REST diretto, bypassa il lock di supabase-js)
//  - AuthUser   → profilo trovato (utente autorizzato)
//  - null       → email non in whitelist
//  - { error }  → fallimento rete / HTTP / parsing
export type FetchProfileResult = AuthUser | null | { error: string }

export async function fetchProfile(accessToken: string): Promise<FetchProfileResult> {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_my_profile`, {
      method: 'POST',
      headers: {
        'apikey':        supabaseAnonKey,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
      },
      body: '{}',
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return { error: `HTTP ${res.status} ${txt.slice(0, 80)}` }
    }
    const data = await res.json().catch(() => null) as unknown
    const profile = Array.isArray(data)
      ? (data[0] as Record<string, unknown> | undefined)
      : (data as Record<string, unknown> | null)
    if (!profile || typeof profile.id !== 'string') return null
    return {
      id:           profile.id as string,
      email:        profile.email as string,
      livello:      profile.livello as AuthUser['livello'],
      nome:         (profile.nome as string | null | undefined) ?? null,
      cognome:      (profile.cognome as string | null | undefined) ?? null,
      postazioneId: (profile.postazione_id as string | null | undefined) ?? null,
      isSupervisore:   (profile.supervisore as boolean | undefined) ?? false,
      tuttePostazioni: (profile.tutte_postazioni as boolean | undefined) ?? false,
      tema:            (profile.tema as string | null | undefined) ?? null,
    }
  } catch (e) {
    return { error: `eccezione: ${(e as Error).message ?? 'sconosciuta'}` }
  }
}
