import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import { Home, Users, CalendarClock, CalendarDays } from 'lucide-react'
import type { AuthUser } from '../../types'
import { useUnsaved } from '../../contexts/UnsavedContext'

const links = [
  { to: '/admin',          label: 'Home',                  Icon: Home },
  { to: '/admin/turni',    label: 'Turni del Mese',        Icon: CalendarDays },
  { to: '/admin/schema',   label: 'Configurazione Turni',  Icon: CalendarClock },
  { to: '/admin/turnisti', label: 'Turnisti',              Icon: Users },
]

export function AdminLayout({ user }: { user: AuthUser | null }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { hasUnsaved } = useUnsaved()

  function handleNav(to: string) {
    if (location.pathname === to) return
    if (hasUnsaved && !window.confirm('Hai modifiche non salvate. Vuoi uscire senza salvarle?')) return
    navigate(to)
  }

  return (
    <div className="flex h-[calc(100vh-48px)]">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 flex flex-col py-4 overflow-y-auto"
        style={{ background: '#1c2818', color: '#c0d0b0' }}>
        <p className="px-4 text-[10px] uppercase tracking-widest mb-3 font-semibold" style={{ color: '#577a45' }}>
          Pannello Admin
        </p>
        {links.map(({ to, label, Icon }) => {
          const isActive = location.pathname === to || (to !== '/admin' && location.pathname.startsWith(to + '/'))
          return (
            <button
              key={to}
              onClick={() => handleNav(to)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors text-left w-full"
              style={isActive ? { background: '#456b3a', color: '#fff' } : { color: '#9ab488' }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#9ab488' }}
            >
              <Icon size={15} />
              {label}
            </button>
          )
        })}
      </aside>

      {/* Contenuto */}
      <main className="flex-1 overflow-auto" style={{ background: '#f4f1ea' }}>
        <Outlet context={{ user }} />
      </main>
    </div>
  )
}
