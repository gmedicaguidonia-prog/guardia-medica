import { Navigate } from 'react-router-dom'
import type { AuthUser, Livello } from '../types'

interface Props {
  user:          AuthUser | null
  loading:       boolean
  requireAdmin?: boolean
  /** Livelli ammessi. Default: tutti i loggati (admin/turnista/esterno). */
  allowedRoles?: Livello[]
  children:      React.ReactNode
}

export function ProtectedRoute({ user, loading, requireAdmin = false, allowedRoles, children }: Props) {
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-olive-600 mx-auto mb-3" />
          <p className="text-stone-600 text-sm">Caricamento…</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (requireAdmin && user.livello !== 'admin') return <Navigate to="/" replace />

  const roles = allowedRoles ?? ['admin', 'turnista', 'esterno']
  if (!roles.includes(user.livello)) return <Navigate to="/" replace />

  return <>{children}</>
}
