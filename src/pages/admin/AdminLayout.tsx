import { useState } from 'react'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import { Home, Users, CalendarClock, CalendarDays, ListChecks, CalendarHeart, PanelLeftClose, PanelLeftOpen, SlidersHorizontal, LayoutGrid, MapPin, ChevronLeft, ChevronRight } from 'lucide-react'
import type { AuthUser } from '../../types'
import { useUnsaved } from '../../contexts/UnsavedContext'
import { usePostazione } from '../../contexts/PostazioneContext'
import { useMeseSelezionato } from '../../hooks/useMeseSelezionato'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmModal } from '../../components/ConfirmModal'
import { CancellaMeseButton } from '../../components/CancellaMeseButton'

// Pagine numerate (1-6): in fondo mostrano "Cancella/Ripristina impostazioni mese"
const ROTTE_NUMERATE = new Set(['/admin/turnisti', '/admin/schema', '/admin/regole', '/admin/impaginazione', '/admin/desiderata', '/admin/turni'])

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const meseLabel = (key: string) => { const [a, m] = key.split('-').map(Number); return `${MESI[m - 1]} ${a}` }

const links: { to: string; label: string; Icon: typeof Home; num: number | null; adminOnly?: boolean }[] = [
  { to: '/admin/postazioni', label: 'Centro di Controllo',          Icon: SlidersHorizontal, num: null, adminOnly: true },
  { to: '/admin',            label: 'Home',                         Icon: Home,          num: null },
  { to: '/admin/turnisti',   label: 'Personale',                    Icon: Users,         num: 1 },
  { to: '/admin/schema',        label: 'Configurazione Turni',         Icon: CalendarClock, num: 2 },
  { to: '/admin/regole',        label: 'Regole Turni',                 Icon: ListChecks,    num: 3 },
  { to: '/admin/impaginazione', label: 'Impaginazione',                Icon: LayoutGrid,    num: 4 },
  { to: '/admin/desiderata',    label: 'Desiderata - Indisponibilità', Icon: CalendarHeart, num: 5 },
  { to: '/admin/turni',         label: 'Turni del Mese',               Icon: CalendarDays,  num: 6 },
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
  const { confirm, confirmState } = useConfirm()
  const { postazioneAttiva } = usePostazione()
  const { meseKey, mese, anno, setMeseAnno } = useMeseSelezionato()
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(LS_COLLAPSED) === '1')
  const visibleLinks = links.filter(l => !l.adminOnly || user?.livello === 'admin')
  const postNome = postazioneAttiva?.nome ?? null

  function toggle() { setCollapsed(c => { const n = !c; try { localStorage.setItem(LS_COLLAPSED, n ? '1' : '0') } catch { /* ignore */ } return n }) }
  async function handleNav(to: string) {
    if (location.pathname === to) return
    if (hasUnsaved && !(await confirm({ title: 'Modifiche non salvate', message: 'Hai modifiche non salvate. Vuoi uscire senza salvarle?', confirmLabel: 'Esci senza salvare', danger: true }))) return
    navigate(to)
  }
  async function cambiaMeseSidebar(delta: number) {
    if (hasUnsaved && !(await confirm({ title: 'Modifiche non salvate', message: 'Hai modifiche non salvate. Cambiare mese senza salvarle?', confirmLabel: 'Sì, cambia', danger: true }))) return
    let m = mese + delta, a = anno
    if (m < 1) { m = 12; a-- } else if (m > 12) { m = 1; a++ }
    setMeseAnno(a, m)
  }

  return (
    <div className="flex h-[calc(100vh-48px)]">
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />
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

        {/* Reminder: postazione + mese attivi, subito dopo l'ultimo menu, separato da una riga */}
        <div className="mt-2 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.10)' }}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-1" title={`${postNome ?? 'Nessuna postazione'} · ${meseLabel(meseKey)}`}>
              <MapPin size={15} style={{ color: '#9ab488' }} />
              <CalendarDays size={15} style={{ color: '#9ab488' }} />
              <span className="text-[11px] font-bold leading-none" style={{ color: '#fff' }}>{String(mese).padStart(2, '0')}/{String(anno).slice(2)}</span>
              <div className="flex items-center gap-1 mt-0.5">
                <button onClick={() => cambiaMeseSidebar(-1)} title="Mese precedente" className="rounded p-0.5 hover:bg-white/10 transition-colors" style={{ color: '#9ab488' }}>
                  <ChevronLeft size={16} />
                </button>
                <button onClick={() => cambiaMeseSidebar(1)} title="Mese successivo" className="rounded p-0.5 hover:bg-white/10 transition-colors" style={{ color: '#9ab488' }}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div className="px-4">
              <p className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: '#577a45' }}>Stai gestendo</p>
              <div className="flex items-center gap-1.5 mb-1" title={postNome ?? undefined}>
                <MapPin size={16} className="shrink-0" style={{ color: '#9ab488' }} />
                <span className="text-sm font-semibold truncate" style={{ color: '#e7efe0' }}>{postNome ?? '—'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CalendarDays size={16} className="shrink-0" style={{ color: '#9ab488' }} />
                <span className="text-base font-bold whitespace-nowrap" style={{ color: '#fff' }}>{meseLabel(meseKey)}</span>
                <div className="flex items-center gap-0.5 ml-auto">
                  <button onClick={() => cambiaMeseSidebar(-1)} title="Mese precedente" className="rounded p-1 hover:bg-white/10 transition-colors" style={{ color: '#9ab488' }}>
                    <ChevronLeft size={18} />
                  </button>
                  <button onClick={() => cambiaMeseSidebar(1)} title="Mese successivo" className="rounded p-1 hover:bg-white/10 transition-colors" style={{ color: '#9ab488' }}>
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Contenuto: wrapper a colonna alto almeno quanto l'area → i pulsanti mese
          restano SEMPRE in fondo (spinti giù se la pagina è corta, scorrono se è lunga) */}
      <main className="flex-1 min-w-0 overflow-auto" style={{ background: '#f4f1ea' }}>
        <div className="min-h-full flex flex-col">
          <div className="flex-1 min-w-0"><Outlet context={{ user }} /></div>
          {ROTTE_NUMERATE.has(location.pathname) && postazioneAttiva && (
            <div className="px-4 sm:px-6 pt-4 pb-6 mt-4">
              <div className="max-w-3xl mx-auto border-t mb-4" style={{ borderColor: '#d6d3cc' }} />
              <div className="flex justify-center gap-2">
                <CancellaMeseButton postazioneId={postazioneAttiva.id} meseKey={meseKey} anno={anno} mese={mese} />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
