import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Stethoscope, LogOut, Settings, CalendarDays, FlaskConical, RefreshCw, MapPin } from 'lucide-react'
import { puoGestire, nomeCompleto } from '../types'
import { usePostazione } from '../contexts/PostazioneContext'
import type { AuthUser, Livello } from '../types'

// Finestre dedicate: l'amministrazione vive in una finestra/scheda a parte e le
// pagine pubbliche tutte nella stessa. Un nome-finestra fisso per contesto fa sì
// che, riaprendole, si riusi/rifocalizzi quella già aperta anziché duplicarla.
const WIN_ADMIN = 'gm-admin'
const WIN_PUBBLICA = 'gm-public'
const winName = (path: string) => (path.startsWith('/admin') ? WIN_ADMIN : WIN_PUBBLICA)

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
  const { postazioni, postazioneId, setPostazioneId } = usePostazione()
  // Nella pagina pubblica "I miei turni" il selettore postazione è già nel corpo:
  // nasconderlo dalla navbar per non confondere.
  const mostraSelettore = puoGestire(user.livello) && postazioni.length > 0 && loc.pathname !== '/turni'

  // Allinea il nome di questa finestra al suo contesto e memorizza l'ultima
  // pagina admin visitata, così riaprendola si torna dove si era rimasti.
  useEffect(() => {
    const target = winName(loc.pathname)
    try {
      if (window.name !== target) window.name = target
      if (target === WIN_ADMIN) localStorage.setItem('gm_last_admin', loc.pathname)
    } catch {}
  }, [loc.pathname])

  // Naviga rispettando le finestre dedicate: se siamo già nella finestra giusta
  // resta in-page (SPA); altrimenti apri/rifocalizza la finestra del contesto
  // (l'amministrazione riparte dall'ultima pagina visitata).
  function vaiA(to: string) {
    const target = winName(to)
    if (window.name === target) { navigate(to); return }
    let path = to
    if (target === WIN_ADMIN) { try { path = localStorage.getItem('gm_last_admin') || to } catch {} }
    const url = import.meta.env.BASE_URL + path.replace(/^\//, '')
    // window.open con lo stesso "nome finestra" riusa la scheda/finestra già
    // aperta e la porta in primo piano; il doppio focus rafforza la messa in
    // primo piano (alcuni browser ignorano il primo).
    const w = window.open(url, target)
    if (!w) { navigate(to); return }
    try { w.focus() } catch {}
    setTimeout(() => { try { w.focus() } catch {} }, 80)
  }

  const link = (to: string, label: string, Icon: React.ElementType) => {
    const active = loc.pathname === to || loc.pathname.startsWith(to + '/')
    return (
      <button
        onClick={() => vaiA(to)}
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

        {/* Selettore postazione */}
        {mostraSelettore && (
          <div className="flex items-center gap-1 shrink-0 rounded-lg pl-2 pr-1 py-0.5" style={{ background: 'rgba(255,255,255,0.10)' }} title="Postazione attiva">
            <MapPin size={14} style={{ color: '#9ab488' }} />
            <select
              value={postazioneId ?? ''}
              onChange={e => setPostazioneId(e.target.value)}
              className="text-xs font-semibold border-0 outline-none cursor-pointer py-1 pr-1"
              style={{ background: 'transparent', color: '#e0e8d8', maxWidth: 200 }}
            >
              {postazioni.map(p => (
                <option key={p.id} value={p.id} style={{ color: '#1c2818' }}>{p.nome}</option>
              ))}
            </select>
          </div>
        )}

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
            {nomeCompleto(user) || user.email}
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
