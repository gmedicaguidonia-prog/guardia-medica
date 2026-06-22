import { createClient } from '@supabase/supabase-js'

export const supabaseUrl     = (import.meta.env.VITE_SUPABASE_URL as string) || ''
export const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || ''

/** true quando le credenziali Supabase sono presenti. Quando è false
 *  l'app gira in "modalità DEV": dati su localStorage + login simulato. */
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
  console.info(
    '[Supabase] Credenziali assenti → modalità DEV ' +
    '(dati su localStorage, login simulato). ' +
    'Compila .env per collegare il backend reale.'
  )
}

/**
 * Storage adapter "robusto" per Supabase auth: write-through su
 * localStorage + sessionStorage + cookie, read-through a cascata. Risolve
 * la perdita del code_verifier PKCE durante il redirect OAuth su alcuni
 * browser mobile (Chrome Android incognito, Safari iOS). Portato 1:1 dagli
 * altri progetti dove funziona.
 */
const robustStorage = {
  getItem(key: string): string | null {
    try { const v = localStorage.getItem(key);   if (v != null) return v } catch {}
    try { const v = sessionStorage.getItem(key); if (v != null) return v } catch {}
    try {
      const re = new RegExp(`(?:^|; )${encodeURIComponent(key).replace(/[-.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`)
      const m = document.cookie.match(re)
      if (m) return decodeURIComponent(m[1])
    } catch {}
    return null
  },
  setItem(key: string, value: string): void {
    try { localStorage.setItem(key, value) } catch {}
    try { sessionStorage.setItem(key, value) } catch {}
    try {
      const isHttps = location.protocol === 'https:'
      document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; path=/; max-age=600; SameSite=Lax${isHttps ? '; Secure' : ''}`
    } catch {}
  },
  removeItem(key: string): void {
    try { localStorage.removeItem(key) } catch {}
    try { sessionStorage.removeItem(key) } catch {}
    try { document.cookie = `${encodeURIComponent(key)}=; path=/; max-age=0; SameSite=Lax` } catch {}
  },
}

export const supabase = createClient(
  supabaseUrl  || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storage: robustStorage,
    },
  }
)
