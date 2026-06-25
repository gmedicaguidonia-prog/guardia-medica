import { useState } from 'react'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import { Home, Users, CalendarClock, CalendarDays, ListChecks, CalendarHeart, PanelLeftClose, PanelLeftOpen, SlidersHorizontal, LayoutGrid, MapPin } from 'lucide-react'
import type { AuthUser } from '../../types'
import { useUnsaved } from '../../contexts/UnsavedContext'
import { usePostazione } from '../../contexts/PostazioneContext'
import { useMeseSelezionato } from '../../hooks/useMeseSelezionato'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const meseLabel = (key: string) => { const [a, m] = key.split('-').map(Number); return `${MESI[m - 1]} ${a}` }

const links: { to: string; label: string; Icon: typeof Home; num: number | null; adminOnly?: boolean }[] = [
  { to: '/admin/postazioni', label: 'Centro di Controllo',          Icon: SlidersHorizontal, num: null, adminOnly: true },
  { to: '/admin',            label: 'Home',                         Icon: Home,          num: null },
  { to: '/admin/turnisti',   label: 'Personale',                    Icon: Users,         num: null },
  { to: '/admin/schema',        label: 'Configurazione Turni',         Icon: CalendarClock, num: 1 },
  { to: '/admin/regole',        label: 'Regole Turni',                 Icon: ListChecks,    num: 2 },
  { to: '/admin/impaginazione', label: 'Impaginazione',                Icon: LayoutGrid,    num: 3 },
  { to: '/admin/desiderata',    label: 'Desiderata - Indisponibilità', Icon: CalendarHeart, num: 4 },
  { to: '/admin/turni',         label: 'Turni del Mese',               Icon: CalendarDays,  num: 5 },
]

const LS_COLLAPSED = 'gm_admin_collapsed'

function NumCircle({ num, size = 18 }: { num: number; size?: number }) {
  return (
    <span className="shrink-0 inline-flex items-center justify-center"
      style={{ width: size, height: size, borderRadius: '50%', border: '1.5px solid currentColor', fontSize: size <= 18 ? 10 : 11, fontWeight: 700 }}>{num}</span>
  )
}

export function AdminLayout({ user }: { user: AuthUser | null }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { hasUnsaved } = useUnsaved()
  const { postazioneAttiva } = usePostazione()
  const { meseKey, mese, anno } = useMeseSelezionato()
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(LS_COLLAPSED) === '1')
  const visibleLinks = links.filter(l => !l.adminOnly || user?.livello === 'admin')
  const postNome = postazioneAttiva?.nome ?? null

  function toggle() { setCollapsed(c => { const n = !c; try { localStorage.setItem(LS_COLLAPSED, n ? '1' : '0') } catch { /* ignore */ } return n }) }
  function handleNav(to: string) {
    if (location.pathname === to) return
    if (hasUnsaved && !window.confirm('Hai modifiche non salvate. Vuoi uscire senza salvarle?')) return
    navigate(to)
  }

  return (
    <div className="flex h-[calc(100vh-48px)]">
      {/* Sidebar */}
      <aside className="shrink-0 flex flex-col py-4 overflow-y-auto overflow-x-hidden"
        style={{ width: collapsed ? 56 : 208, background: '#1c2818', color: '#c0d0b0', transition: 'width 160ms ease' }}>

        {/* Intestazione + tasto collassa/espandi */}
        <div className={`flex items-center mb-3 ${collapsed ? 'justify-center' : 'justify-between px-4'}`}>
          {!collapsed && <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: '#577a45' }}>Pannello Admin</p>}
          <button onClick={toggle} title={collapsed ? 'Mostra menu' : 'Nascondi menu'}
            className="p-1 rounded transition-colors hover:bg-white/10" style={{ color: '#9ab488' }}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {visibleLinks.map(({ to, label, Icon, num }) => {
          const isActive = location.pathname === to || (to !== '/admin' && location.pathname.startsWith(to + '/'))
          return (
            <button
              key={to}
              onClick={() => handleNav(to)}
              title={label}
              className={`flex items-center gap-2 py-2.5 text-sm transition-colors text-left w-full ${collapsed ? 'justify-center px-0' : 'px-4'}`}
              style={isActive ? { background: '#456b3a', color: '#fff' } : { color: '#9ab488' }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#9ab488' }}
            >
              {collapsed ? (
                num != null ? <NumCircle num={num} size={20} /> : <Icon size={18} />
              ) : (
                <>
                  {num != null ? <NumCircle num={num} /> : <span className="shrink-0" style={{ width: 18 }} />}
                  <Icon size={15} className="shrink-0" />
                  <span className="leading-tight">{label}</span>
                </>
              )}
            </button>
          )
        })}

        {/* Reminder in fondo: postazione + mese attivi, separati da una riga */}
        <div className="mt-auto pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.10)' }}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-1" title={`${postNome ?? 'Nessuna postazione'} · ${meseLabel(meseKey)}`}>
              <MapPin size={14} style={{ color: '#9ab488' }} />
              <CalendarDays size={14} style={{ color: '#9ab488' }} />
              <span className="text-[10px] font-bold leading-none" style={{ color: '#fff' }}>{String(mese).padStart(2, '0')}/{String(anno).slice(2)}</span>
            </div>
          ) : (
            <div className="px-4">
              <p className="text-[9px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: '#577a45' }}>Stai gestendo</p>
              <div className="flex items-center gap-1.5 mb-1" title={postNome ?? undefined}>
                <MapPin size={13} className="shrink-0" style={{ color: '#9ab488' }} />
                <span className="text-xs font-semibold truncate" style={{ color: '#e7efe0' }}>{postNome ?? '—'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CalendarDays size={13} className="shrink-0" style={{ color: '#9ab488' }} />
                <span className="text-xs font-bold" style={{ color: '#fff' }}>{meseLabel(meseKey)}</span>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Contenuto */}
      <main className="flex-1 min-w-0 overflow-auto" style={{ background: '#f4f1ea' }}>
        <Outlet context={{ user }} />
      </main>
    </div>
  )
}
