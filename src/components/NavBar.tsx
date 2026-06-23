import { useLocation, useNavigate } from 'react-router-dom'
import { Stethoscope, LogOut, Settings, CalendarDays, FlaskConical, RefreshCw } from 'lucide-react'
import { puoGestire } from '../types'
import type { AuthUser, Livello } from '../types'

interface Props {
  user:             AuthUser
  onSignOut:        () => void
  isDev:            boolean
  onDevSwitch:      (livello: Livello) => void
  updateAvailable?: boolean
  onReload?:        () => void
}

export function NavBar({ user, onSignOut, isDev, onDevSwitch, updateAvailable, onReload }: Props) {
  const loc = useLocation()
  const navigate = useNavigate()

  const link = (to: string, label: string, Icon: React.ElementType) => {
    const active = loc.pathname === to || loc.pathname.startsWith(to + '/')
    return (
      <button
        onClick={() => navigate(to)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
        style={active ? { background: 'rgba(255,255,255,0.15)', color: '#fff' } : { color: '#9ab488' }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#fff' }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#9ab488' }}
      >
        <Icon size={16} />
        <span className="hidden sm:inline">{label}</span>
      </button>
    )
  }

  return (
    <nav className="text-white shadow-md" style={{ background: '#2b3c24' }}>
      <div className="max-w-screen-xl mx-auto px-4 flex items-center gap-3 h-12">
        {/* Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <Stethoscope size={18} style={{ color: '#9ab488' }} />
          <span className="font-bold text-sm tracking-tight" style={{ color: '#e0e8d8' }}>
            Guardia Medica
          </span>
        </div>

        {/* Link */}
        <div className="flex items-center gap-1 ml-1">
          {link('/turni', 'I miei turni', CalendarDays)}
          {puoGestire(user.livello) && link('/admin', 'Admin', Settings)}
        </div>

        {/* Badge arancione "Aggiornamento disponibile" */}
        {updateAvailable && onReload && (
          <button onClick={onReload}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors shrink-0 animate-pulse"
            style={{ background: '#d97706', color: '#fff' }}
            title="È disponibile una nuova versione — clicca per ricaricare">
            <RefreshCw size={12} className="animate-spin" style={{ animationDuration: '2.5s' }} />
            <span className="hidden sm:inline">Aggiorna</span>
          </button>
        )}

        <div className="flex-1" />

        {/* DEV: switch rapido del ruolo per provare le viste */}
        {isDev && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: '#fbbf24', color: '#1c2818' }}>
              <FlaskConical size={11} /> DEV
            </span>
            <select
              value={user.livello}
              onChange={e => onDevSwitch(e.target.value as Livello)}
              title="Modalità DEV: cambia ruolo per provare le viste"
              className="text-xs rounded px-1.5 py-1 border-0 outline-none cursor-pointer"
              style={{ background: '#456b3a', color: '#fff' }}
            >
              <option value="admin">admin</option>
              <option value="responsabile">responsabile</option>
              <option value="turnista">turnista</option>
              <option value="esterno">esterno</option>
            </select>
          </div>
        )}

        {/* Utente + logout */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden lg:flex items-center gap-1.5 text-xs" style={{ color: '#9ab488' }}>
            {user.nome || user.email}
            {puoGestire(user.livello) && (
              <span className="text-[10px] font-bold px-1 rounded" style={{ background: user.livello === 'admin' ? '#b91c1c' : '#a16207', color: '#fff' }}>
                {user.livello === 'admin' ? 'ADMIN' : 'RESPONSABILE'}
              </span>
            )}
          </span>
          <button
            onClick={onSignOut}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors"
            style={{ color: '#9ab488' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = '#9ab488')}
            title="Esci"
          >
            <LogOut size={18} />
            <span className="hidden lg:inline">Esci</span>
          </button>

          {/* Versione build (commit SHA + data) */}
          <span className="hidden lg:block text-[10px] font-mono shrink-0"
            style={{ color: '#c0d0b0' }}
            title={`Commit ${__APP_VERSION__} — build del ${__BUILD_DATE__}`}>
            v{__APP_VERSION__} · {__BUILD_DATE__}
          </span>
        </div>
      </div>
    </nav>
  )
}
