import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Stethoscope, AlertCircle, FlaskConical, Shield, User, UserCog } from 'lucide-react'
import type { AuthUser, Livello } from '../types'

interface Props {
  user:        AuthUser | null
  onSignIn:    () => void
  isDev:       boolean
  onDevLogin:  (livello: Livello) => void
}

export function LoginPage({ user, onSignIn, isDev, onDevLogin }: Props) {
  const navigate = useNavigate()

  const [denial, setDenial] = useState<{ email: string; reason?: string } | null>(null)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('auth_unauthorized_email')
      if (!raw) return
      try {
        const obj = JSON.parse(raw)
        if (obj && typeof obj.email === 'string') setDenial(obj)
      } catch { setDenial({ email: raw }) }
    } catch {}
  }, [])

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  const DEV_ROLES: { livello: Livello; label: string; Icon: React.ElementType }[] = [
    { livello: 'admin',    label: 'Entra come Admin',    Icon: UserCog },
    { livello: 'turnista', label: 'Entra come Turnista', Icon: User },
    { livello: 'esterno',  label: 'Entra come Esterno',  Icon: Shield },
  ]

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, var(--t-notte) 0%, var(--t-primario) 50%, var(--t-etichetta) 100%)' }}>

      <div className="rounded-2xl shadow-2xl p-8 w-full max-w-sm text-center" style={{ background: 'var(--t-card)' }}>

        <div className="flex justify-center mb-6">
          <div className="rounded-full p-4" style={{ background: '#e0e8d8' }}>
            <Stethoscope size={40} style={{ color: 'var(--t-accento)' }} />
          </div>
        </div>

        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--t-titolo)' }}>Guardia Medica</h1>
        <p className="text-sm mb-6" style={{ color: '#7a7a6a' }}>Sistema di turnazione</p>

        {denial && (
          <div className="rounded-lg p-3 mb-4 text-left" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
            <div className="flex items-start gap-2">
              <AlertCircle size={18} className="shrink-0 mt-0.5" style={{ color: '#b91c1c' }} />
              <div className="text-xs flex-1" style={{ color: '#991b1b' }}>
                <p className="font-bold text-sm mb-1">Accesso negato</p>
                <p className="mb-1 font-mono break-all">{denial.email}</p>
                <p>L'email non risulta tra i turnisti autorizzati. Chiedi all'amministratore di aggiungerti.</p>
              </div>
            </div>
          </div>
        )}

        {isDev ? (
          /* ── Modalità DEV: scegli il ruolo ── */
          <div className="space-y-2.5">
            <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold mb-1 px-2 py-1 rounded"
              style={{ background: '#fef3c7', color: '#92400e' }}>
              <FlaskConical size={13} /> MODALITÀ DEV — login simulato
            </div>
            {DEV_ROLES.map(({ livello, label, Icon }) => (
              <button key={livello} onClick={() => onDevLogin(livello)}
                className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition-all"
                style={{ background: 'var(--t-card)', color: 'var(--t-testo)', border: '1.5px solid var(--t-side-testo)' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f0ead8')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--t-card)')}>
                <Icon size={16} style={{ color: 'var(--t-accento)' }} /> {label}
              </button>
            ))}
            <p className="mt-4 text-xs" style={{ color: '#6b6b5a' }}>
              Configura Supabase in <span className="font-mono">.env</span> per attivare il login Google reale.
            </p>
          </div>
        ) : (
          /* ── Modalità reale: login Google ── */
          <>
            <button onClick={onSignIn}
              className="w-full flex items-center justify-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold shadow-sm transition-all"
              style={{ background: 'var(--t-card)', color: 'var(--t-testo)', border: '1.5px solid var(--t-side-testo)' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f0ead8')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--t-card)')}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2a10.3 10.3 0 0 0-.16-1.8H9v3.4h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92C16.66 14.25 17.64 11.93 17.64 9.2z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A8.99 8.99 0 0 0 9 18z" fill="#34A853"/>
                <path d="M3.97 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.28-1.71V4.96H.96A8.99 8.99 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33z" fill="#FBBC05"/>
                <path d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58C13.46.89 11.43 0 9 0A8.99 8.99 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Accedi con Google
            </button>
            <p className="mt-6 text-xs" style={{ color: '#6b6b5a' }}>
              Solo gli account autorizzati possono accedere.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
