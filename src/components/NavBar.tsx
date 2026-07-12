import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Stethoscope, LogOut, Settings, CalendarDays, FlaskConical, RefreshCw, MapPin, Crown, Package, PackageOpen, ChevronLeft, ChevronRight } from 'lucide-react'
import { haAccessoAdmin, nomeCompleto } from '../types'
import { usePostazione } from '../contexts/PostazioneContext'
import { useDebug } from '../contexts/DebugContext'
import { useMeseSelezionato } from '../hooks/useMeseSelezionato'
import { usePostazionePubblica } from '../hooks/usePostazionePubblica'
import { CentroMessaggi } from './CentroMessaggi'
import { store } from '../lib/store'
import { TEMI, applicaTema, temaSalvato } from '../lib/temi'
import { updateCachedTema } from '../lib/authHelpers'
import type { AuthUser, Livello, UtenteImpersonabile } from '../types'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

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
  const mostraSelettore = haAccessoAdmin(user) && postazioni.length > 0 && loc.pathname !== '/turni'

  // ── Selettore mesi centrato nella barra, SOLO su mobile e SOLO nella pagina pubblica «I miei
  //    turni». Usa lo stesso stato globale del mese e gli stessi limiti (mesi con contenuto) della
  //    pagina — la query è deduplicata da React Query (stessa queryKey), quindi niente chiamate extra. ──
  const suTurni = loc.pathname === '/turni'
  const { postazioneId: pubPostazioneId } = usePostazionePubblica()   // stessa postazione scelta nella pagina pubblica
  const { meseKey, mese, anno, setMeseAnno } = useMeseSelezionato()
  const { data: rangeContenuto } = useQuery<{ min: string | null; max: string | null }>({
    queryKey: ['mesi-contenuto', pubPostazioneId],
    queryFn: () => store.getMesiConContenuto(pubPostazioneId!),
    enabled: suTurni && !!pubPostazioneId,
  })
  const meseCorrNav = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })()
  const rangeMinNav = rangeContenuto?.min && rangeContenuto.min < meseCorrNav ? rangeContenuto.min : meseCorrNav
  const rangeMaxNav = rangeContenuto?.max && rangeContenuto.max > meseCorrNav ? rangeContenuto.max : meseCorrNav
  const canPrevNav = meseKey > rangeMinNav
  const canNextNav = meseKey < rangeMaxNav
  function cambiaMeseNav(delta: number) {
    if (delta < 0 ? !canPrevNav : !canNextNav) return
    let m = mese + delta, a = anno
    if (m < 1) { m = 12; a-- } else if (m > 12) { m = 1; a++ }
    setMeseAnno(a, m)
  }

  // Tema interfaccia: quadratino ciclico nella navbar (mostra il tema attivo; ogni click applica il successivo)
  const [temaAttivo, setTemaAttivo] = useState<string>(() => temaSalvato())
  useEffect(() => {
    const h = (e: Event) => setTemaAttivo((e as CustomEvent<string>).detail)
    window.addEventListener('gm-tema', h)
    return () => window.removeEventListener('gm-tema', h)
  }, [])
  const temaCorr = TEMI.find(t => t.id === temaAttivo) ?? TEMI[0]
  function ciclaTema() {
    const next = TEMI[(TEMI.findIndex(t => t.id === temaAttivo) + 1) % TEMI.length]
    applicaTema(next.id); setTemaAttivo(next.id); updateCachedTema(next.id); store.setMioTema(next.id).catch(() => {})
  }

  // ── Debug: modalità Admin + Doppleganger (solo per l'admin reale) ──
  const { isRealAdmin, realUser, adminMode, doppleganger, setAdminMode, setDoppleganger } = useDebug()
  const { data: utenti = [], refetch: refetchImpersonabili } = useQuery<UtenteImpersonabile[]>({ queryKey: ['utenti-impersonabili'], queryFn: () => store.getUtentiImpersonabili(), enabled: isRealAdmin, staleTime: 0 })
  const [debugModal, setDebugModal] = useState<'admin' | 'doppleganger' | null>(null)
  const [dgScelto, setDgScelto] = useState('')
  function attivaDoppleganger() {
    const u = utenti.find(x => x.id === dgScelto)
    if (!u) return
    setDoppleganger({ id: u.id, email: u.email, livello: u.livello, nome: u.nome, cognome: u.cognome, postazioneId: u.postazioneId, isSupervisore: false, tuttePostazioni: false })
    setDebugModal(null)
  }

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
        style={active ? { background: 'rgba(255,255,255,0.15)', color: '#fff' } : { color: 'var(--t-soft)' }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#fff' }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--t-soft)' }}
      >
        <Icon size={16} />
        <span className="hidden sm:inline">{label}</span>
      </button>
    )
  }

  return (
    <>
    <nav className="text-white shadow-md" style={{ background: 'var(--t-titolo)' }}>
      <div className="max-w-screen-xl mx-auto px-4 flex items-center gap-2 sm:gap-3 h-12">
        {/* Brand — su cellulare resta solo l'icona (il testo occuperebbe spazio prezioso) */}
        <div className="flex items-center gap-2 shrink-0">
          <Stethoscope size={18} style={{ color: 'var(--t-soft)' }} />
          <span className="hidden sm:inline font-bold text-sm tracking-tight" style={{ color: '#e0e8d8' }}>
            Guardia Medica
          </span>
        </div>

        {/* Selettore postazione */}
        {mostraSelettore && (
          <div className="flex items-center gap-1 shrink-0 rounded-lg pl-2 pr-1 py-0.5" style={{ background: 'rgba(255,255,255,0.10)' }} title="Postazione attiva">
            <MapPin size={14} style={{ color: 'var(--t-soft)' }} />
            <select
              value={postazioneId ?? ''}
              onChange={e => setPostazioneId(e.target.value)}
              className="text-xs font-semibold border-0 outline-none cursor-pointer py-1 pr-1"
              style={{ background: 'transparent', color: '#e0e8d8', maxWidth: 200 }}
            >
              {postazioni.map(p => (
                <option key={p.id} value={p.id} style={{ color: 'var(--t-notte)' }}>{p.nome}</option>
              ))}
            </select>
          </div>
        )}

        {/* Link */}
        <div className="flex items-center gap-2 ml-1">
          {link('/turni', 'I miei turni', CalendarDays)}
          <button onClick={ciclaTema} title={`Tema: ${temaCorr.nome} — clicca per cambiarlo`} aria-label={`Cambia tema (attuale: ${temaCorr.nome})`}
            className="shrink-0 transition-transform hover:scale-110"
            style={{ width: 20, height: 20, borderRadius: 5, background: `linear-gradient(135deg, ${temaCorr.c1} 50%, ${temaCorr.c2} 50%)`, border: '1px solid rgba(255,255,255,0.4)', cursor: 'pointer' }} />
          {haAccessoAdmin(user) && link('/admin', 'Admin', Settings)}
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

        {/* Selettore mesi centrato TRA i gruppi — SOLO mobile, SOLO «I miei turni» con postazione attiva.
            I due flex-1 (questo sopra e quello mobile qui sotto) lo tengono centrato senza mai sovrapporsi
            alle icone laterali; su desktop resta nel corpo della pagina (qui è sm:hidden). */}
        {suTurni && pubPostazioneId && (
          <div className="sm:hidden flex items-center gap-0.5 shrink-0">
            <button onClick={() => cambiaMeseNav(-1)} disabled={!canPrevNav} className="p-1 rounded" style={{ opacity: canPrevNav ? 1 : 0.3, cursor: canPrevNav ? 'pointer' : 'not-allowed', color: '#e0e8d8' }} aria-label="Mese precedente"><ChevronLeft size={18} /></button>
            <span className="font-bold text-sm whitespace-nowrap" style={{ color: '#fff' }}>{MESI[mese - 1]} {anno}</span>
            <button onClick={() => cambiaMeseNav(1)} disabled={!canNextNav} className="p-1 rounded" style={{ opacity: canNextNav ? 1 : 0.3, cursor: canNextNav ? 'pointer' : 'not-allowed', color: '#e0e8d8' }} aria-label="Mese successivo"><ChevronRight size={18} /></button>
          </div>
        )}
        {suTurni && pubPostazioneId && <div className="flex-1 sm:hidden" />}

        {/* DEV: switch rapido del ruolo per provare le viste */}
        {isDev && (
          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
            <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: '#fbbf24', color: 'var(--t-notte)' }}>
              <FlaskConical size={11} /> DEV
            </span>
            <select
              value={user.livello}
              onChange={e => onDevSwitch(e.target.value as Livello)}
              title="Modalità DEV: cambia ruolo per provare le viste"
              className="text-xs rounded px-1.5 py-1 border-0 outline-none cursor-pointer"
              style={{ background: 'var(--t-primario)', color: '#fff' }}
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
          <span className="hidden lg:flex items-center gap-1.5 text-xs" style={{ color: 'var(--t-soft)' }}>
            {nomeCompleto(user) || user.email}
            {!isRealAdmin && haAccessoAdmin(user) && (
              <span className="text-[10px] font-bold px-1 rounded" style={{ background: user.livello === 'admin' ? '#b91c1c' : '#a16207', color: '#fff' }}>
                {user.livello === 'admin' ? 'ADMIN' : 'SUPERVISORE'}
              </span>
            )}
          </span>

          {/* Centro Messaggi del turnista (icona lettera a destra del nome) */}
          <CentroMessaggi user={user} />

          {/* DEBUG: Modalità Admin + Doppleganger (dopo il nome utente, solo per l'admin reale) */}
          {isRealAdmin && (
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              <button onClick={() => setDebugModal('admin')} title="Modalità admin (debug) — un di più sopra ai normali poteri da admin"
                className={`relative text-[10px] font-bold px-1.5 py-0.5 rounded transition-all ${adminMode ? 'animate-pulse' : ''}`}
                style={adminMode
                  ? { background: '#3a2e0a', color: '#fde68a', border: '2px solid #facc15', boxShadow: '0 0 8px rgba(250,204,21,0.75)' }
                  : { background: '#b91c1c', color: '#fff', border: '2px solid transparent' }}>
                ADMIN
                {adminMode && <Crown size={12} className="absolute -top-2.5 -right-1.5" style={{ color: '#facc15' }} fill="#facc15" />}
              </button>
              <button onClick={() => { refetchImpersonabili(); setDgScelto(realUser?.id ?? ''); setDebugModal('doppleganger') }} title="Doppleganger (debug) — fingiti un altro utente"
                className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded transition-all"
                style={doppleganger
                  ? { background: '#3a2e0a', color: '#fde68a', border: '2px solid #facc15', boxShadow: '0 0 8px rgba(250,204,21,0.6)' }
                  : { background: 'var(--t-primario)', color: '#e0e8d8', border: '2px solid transparent' }}>
                {doppleganger ? <PackageOpen size={13} style={{ color: '#facc15' }} /> : <Package size={13} />}
                <span className="hidden md:inline">{doppleganger ? nomeCompleto(doppleganger) : 'Doppleganger'}</span>
              </button>
            </div>
          )}
          <button
            onClick={onSignOut}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors"
            style={{ color: 'var(--t-soft)' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--t-soft)')}
            title="Esci"
          >
            <LogOut size={18} />
            <span className="hidden lg:inline">Esci</span>
          </button>

          {/* Versione build (solo commit SHA; la data resta nel tooltip) */}
          <span className="hidden lg:block text-[10px] font-mono shrink-0"
            style={{ color: 'var(--t-side-testo)' }}
            title={`Commit ${__APP_VERSION__} — build del ${__BUILD_DATE__}`}>
            v{__APP_VERSION__}
          </span>
        </div>
      </div>
    </nav>

      {/* Modal debug: Modalità Admin */}
      {debugModal === 'admin' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(28,40,24,0.55)' }} onClick={() => setDebugModal(null)}>
          <div className="card w-full max-w-sm p-5" style={{ animation: 'fadeSlideIn 160ms ease-out' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2"><Crown size={20} style={{ color: '#b8860b' }} fill="#facc15" /><h3 className="text-base font-bold" style={{ color: 'var(--t-titolo)' }}>Modalità Admin</h3></div>
            <p className="text-sm text-stone-600 mb-4">{adminMode ? 'Disattivare la god mode? Resti admin a pieni poteri, ma tornano i normali controlli di autorizzazione (vedi l’app come gli altri utenti).' : 'Attivare la god mode? Vedrai TUTTO bypassando i controlli di autorizzazione — es. le desiderata anche di una postazione dove sei esterno.'}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDebugModal(null)} className="btn-secondary text-sm py-1.5 px-3">Annulla</button>
              <button onClick={() => { setAdminMode(!adminMode); setDebugModal(null) }} className="btn-primary text-sm py-1.5 px-4">{adminMode ? 'Disattiva' : 'Attiva'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal debug: Doppleganger */}
      {debugModal === 'doppleganger' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(28,40,24,0.55)' }} onClick={() => setDebugModal(null)}>
          <div className="card w-full max-w-sm p-5" style={{ animation: 'fadeSlideIn 160ms ease-out' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">{doppleganger ? <PackageOpen size={20} style={{ color: '#b8860b' }} /> : <Package size={20} style={{ color: 'var(--t-accento)' }} />}<h3 className="text-base font-bold" style={{ color: 'var(--t-titolo)' }}>Doppleganger</h3></div>
            {doppleganger ? (
              <>
                <p className="text-sm text-stone-600 mb-4">Stai impersonando <strong>{nomeCompleto(doppleganger)}</strong>. Disattivare e tornare ai tuoi permessi?</p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setDebugModal(null)} className="btn-secondary text-sm py-1.5 px-3">Annulla</button>
                  <button onClick={() => { setDoppleganger(null); setDebugModal(null) }} className="btn-primary text-sm py-1.5 px-4">Disattiva</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-stone-600 mb-2">Vuoi attivare la modalità doppleganger fingendoti chi?</p>
                <select value={dgScelto} onChange={e => setDgScelto(e.target.value)} className="input text-sm w-full mb-4">
                  {utenti.map(u => <option key={u.id} value={u.id}>{nomeCompleto(u)} — {u.livello}{u.id === realUser?.id ? ' (io)' : ''}</option>)}
                </select>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setDebugModal(null)} className="btn-secondary text-sm py-1.5 px-3">Annulla</button>
                  <button onClick={attivaDoppleganger} disabled={!dgScelto} className="btn-primary text-sm py-1.5 px-4">OK</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
