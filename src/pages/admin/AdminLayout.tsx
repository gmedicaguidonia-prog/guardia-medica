import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Home, Users, CalendarClock, CalendarDays, ListChecks, CalendarHeart, PanelLeftClose, PanelLeftOpen, SlidersHorizontal, LayoutGrid, MapPin, ChevronLeft, ChevronRight, PartyPopper, ClipboardCheck, Lock, ArrowRightLeft } from 'lucide-react'
import type { AuthUser, CambioTurno } from '../../types'
import { useUnsaved } from '../../contexts/UnsavedContext'
import { usePostazione } from '../../contexts/PostazioneContext'
import { useMeseSelezionato } from '../../hooks/useMeseSelezionato'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmModal } from '../../components/ConfirmModal'
import { CancellaMeseButton } from '../../components/CancellaMeseButton'
import { useFinalizzato } from '../../hooks/useFinalizzato'
import { useRealtimePostazione } from '../../hooks/useRealtime'
import { TEMI, applicaTema, temaSalvato } from '../../lib/temi'
import { store } from '../../lib/store'

// Pagine numerate (1-6): in fondo mostrano "Cancella/Ripristina impostazioni mese"
const ROTTE_NUMERATE = new Set(['/admin/turnisti', '/admin/schema', '/admin/regole', '/admin/impaginazione', '/admin/festivita', '/admin/desiderata', '/admin/turni'])

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const MESI_BREVI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
const meseLabel = (key: string) => { const [a, m] = key.split('-').map(Number); return `${MESI[m - 1]} ${a}` }

const links: { to: string; label: string; Icon: typeof Home; num: number | null; adminOnly?: boolean }[] = [
  { to: '/admin/postazioni', label: 'Centro di Controllo',          Icon: SlidersHorizontal, num: null, adminOnly: true },
  { to: '/admin',            label: 'Home',                         Icon: Home,          num: null },
  { to: '/admin/turnisti',   label: 'Personale',                    Icon: Users,         num: 1 },
  { to: '/admin/schema',        label: 'Configurazione Turni',         Icon: CalendarClock, num: 2 },
  { to: '/admin/regole',        label: 'Regole Turni',                 Icon: ListChecks,    num: 3 },
  { to: '/admin/impaginazione', label: 'Impaginazione',                Icon: LayoutGrid,    num: 4 },
  { to: '/admin/festivita',     label: 'Festività',                    Icon: PartyPopper,   num: 5 },
  { to: '/admin/desiderata',    label: 'Desiderata - Indisponibilità', Icon: CalendarHeart, num: 6 },
  { to: '/admin/turni',         label: 'Turni del Mese',               Icon: CalendarDays,  num: 7 },
  { to: '/admin/finalizza',     label: 'Finalizzazione',               Icon: ClipboardCheck, num: 8 },
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
  const { finalizzato, info: infoFin } = useFinalizzato(postazioneAttiva?.id, meseKey)
  // Datepicker mesi/anni (cliccando il mese in "Stai gestendo"): colori per stato del mese
  const [pickerAperto, setPickerAperto] = useState(false)
  const [pickerAnno, setPickerAnno] = useState(anno)
  const { data: mesiPanoramica = [] } = useQuery<{ mese: string; finalizzato: boolean }[]>({ queryKey: ['mesi-panoramica', postazioneAttiva?.id], queryFn: () => store.getMesiPanoramica(postazioneAttiva!.id), enabled: !!postazioneAttiva })
  const panMap = useMemo(() => new Map(mesiPanoramica.map(x => [x.mese, x.finalizzato])), [mesiPanoramica])
  function apriPicker() { setPickerAnno(anno); setPickerAperto(true) }
  async function scegliMese(a: number, m: number) {
    if (hasUnsaved && !(await confirm({ title: 'Modifiche non salvate', message: 'Hai modifiche non salvate. Cambiare mese senza salvarle?', confirmLabel: 'Sì, cambia', danger: true }))) return
    setMeseAnno(a, m); setPickerAperto(false)
  }
  // Tema interfaccia: applicato subito, salvato per l'utente (DB) e sul dispositivo
  const [temaAttivo, setTemaAttivo] = useState<string>(() => temaSalvato())
  useEffect(() => {   // il quadratino evidenziato segue il tema anche quando arriva dal profilo (nuovo dispositivo)
    const h = (e: Event) => setTemaAttivo((e as CustomEvent<string>).detail)
    window.addEventListener('gm-tema', h)
    return () => window.removeEventListener('gm-tema', h)
  }, [])
  function cambiaTema(id: string) {
    applicaTema(id); setTemaAttivo(id)
    store.setMioTema(id).catch(() => {})   // best-effort: il localStorage copre comunque questo dispositivo
  }
  // Cambi turno in attesa nella postazione attiva: badge arancione sulla voce "Turni del Mese"
  const { data: cambiPend = [] } = useQuery<CambioTurno[]>({ queryKey: ['cambi-pendenti', postazioneAttiva?.id], queryFn: () => store.getCambiPendenti(postazioneAttiva!.id), enabled: !!postazioneAttiva })
  const nCambi = cambiPend.length
  useRealtimePostazione(postazioneAttiva?.id ?? null, [{ tabella: 'cambi_turno', invalida: [['cambi-pendenti', postazioneAttiva?.id]] }])
  // Mese finalizzato: VELO sopra i passi ①–⑦ (click bloccati); ⑧ Finalizzazione resta libera
  const layerBlocco = finalizzato && ROTTE_NUMERATE.has(location.pathname)
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
  // Badge "Cambi turno": porta a Turni del Mese impostando il mese del cambio più vecchio in attesa.
  async function vaiAiCambi() {
    const primo = cambiPend[0]
    if (!primo) return
    if (hasUnsaved && !(await confirm({ title: 'Modifiche non salvate', message: 'Hai modifiche non salvate. Vuoi uscire senza salvarle?', confirmLabel: 'Esci senza salvare', danger: true }))) return
    const [a, m] = primo.mese.split('-').map(Number)
    setMeseAnno(a, m)
    navigate('/admin/turni')
  }

  return (
    <div className="flex h-[calc(100vh-48px)]">
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />
      {/* Datepicker mesi/anni: verde = calendario presente non finalizzato, bianco = finalizzato, tema = niente */}
      {pickerAperto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(28,40,24,0.45)' }} onClick={() => setPickerAperto(false)}>
          <div className="card p-4 w-full max-w-xs" style={{ animation: 'fadeSlideIn 160ms ease-out' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setPickerAnno(a => a - 1)} className="p-1.5 rounded hover:bg-stone-100 transition-colors" style={{ color: 'var(--t-accento)' }} title="Anno precedente"><ChevronLeft size={18} /></button>
              <span className="text-lg font-bold" style={{ color: 'var(--t-titolo)' }}>{pickerAnno}</span>
              <button onClick={() => setPickerAnno(a => a + 1)} className="p-1.5 rounded hover:bg-stone-100 transition-colors" style={{ color: 'var(--t-accento)' }} title="Anno successivo"><ChevronRight size={18} /></button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {MESI_BREVI.map((nomeM, i) => {
                const m = i + 1
                const mk = `${pickerAnno}-${String(m).padStart(2, '0')}`
                const inPan = panMap.has(mk), fin = panMap.get(mk), attivo = mk === meseKey
                const stile = inPan
                  ? (fin ? { background: '#fff', color: 'var(--t-titolo)', border: '1px solid #d6d3cc' }
                         : { background: '#dcfce7', color: '#166534', border: '1px solid #86efac' })
                  : { background: 'var(--t-tenue)', color: 'var(--t-testo)', border: '1px solid var(--t-riga)' }
                return (
                  <button key={m} onClick={() => scegliMese(pickerAnno, m)}
                    title={inPan ? (fin ? 'Mese finalizzato' : 'Calendario presente (non finalizzato)') : 'Nessun calendario'}
                    className="text-sm font-semibold py-2 rounded-lg transition-transform hover:scale-105"
                    style={{ ...stile, boxShadow: attivo ? '0 0 0 2px var(--t-accento)' : undefined }}>{nomeM}</button>
                )
              })}
            </div>
            <div className="flex items-center justify-center gap-3 mt-3 text-[10px] text-stone-500">
              <span className="inline-flex items-center gap-1"><span style={{ width: 10, height: 10, borderRadius: 2, background: '#dcfce7', border: '1px solid #86efac', display: 'inline-block' }} /> non finalizzato</span>
              <span className="inline-flex items-center gap-1"><span style={{ width: 10, height: 10, borderRadius: 2, background: '#fff', border: '1px solid #d6d3cc', display: 'inline-block' }} /> finalizzato</span>
            </div>
          </div>
        </div>
      )}
      {/* Sidebar */}
      <aside className="shrink-0 flex flex-col py-4 overflow-y-auto overflow-x-hidden"
        style={{ width: collapsed ? 56 : 208, background: 'var(--t-notte)', color: 'var(--t-side-testo)', transition: 'width 160ms ease' }}>

        {/* Intestazione + tasto collassa/espandi */}
        <div className={`flex items-center mb-3 ${collapsed ? 'justify-center' : 'justify-between px-4'}`}>
          {!collapsed && <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--t-etichetta)' }}>Pannello Admin</p>}
          <button onClick={toggle} title={collapsed ? 'Mostra menu' : 'Nascondi menu'}
            className="p-1 rounded transition-colors hover:bg-white/10" style={{ color: 'var(--t-soft)' }}>
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
              style={isActive ? { background: 'var(--t-primario)', color: '#fff' } : { color: 'var(--t-soft)' }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--t-soft)' }}
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
              <MapPin size={15} style={{ color: 'var(--t-soft)' }} />
              <CalendarDays size={15} style={{ color: 'var(--t-soft)' }} />
              <button onClick={apriPicker} title="Scegli mese e anno" className="text-[11px] font-bold leading-none rounded px-0.5 hover:bg-white/10 transition-colors" style={{ color: '#fff' }}>{String(mese).padStart(2, '0')}/{String(anno).slice(2)}</button>
              <div className="flex items-center gap-1 mt-0.5">
                <button onClick={() => cambiaMeseSidebar(-1)} title="Mese precedente" className="rounded p-0.5 hover:bg-white/10 transition-colors" style={{ color: 'var(--t-soft)' }}>
                  <ChevronLeft size={16} />
                </button>
                <button onClick={() => cambiaMeseSidebar(1)} title="Mese successivo" className="rounded p-0.5 hover:bg-white/10 transition-colors" style={{ color: 'var(--t-soft)' }}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div className="px-4">
              <p className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: 'var(--t-etichetta)' }}>Stai gestendo</p>
              <div className="flex items-center gap-1.5 mb-1" title={postNome ?? undefined}>
                <MapPin size={16} className="shrink-0" style={{ color: 'var(--t-soft)' }} />
                <span className="text-sm font-semibold truncate" style={{ color: 'var(--t-side-forte)' }}>{postNome ?? '—'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CalendarDays size={16} className="shrink-0" style={{ color: 'var(--t-soft)' }} />
                <button onClick={apriPicker} title="Scegli mese e anno" className="text-base font-bold whitespace-nowrap rounded px-1 -mx-1 hover:bg-white/10 transition-colors" style={{ color: '#fff' }}>{meseLabel(meseKey)}</button>
                <div className="flex items-center gap-0.5 ml-auto">
                  <button onClick={() => cambiaMeseSidebar(-1)} title="Mese precedente" className="rounded p-1 hover:bg-white/10 transition-colors" style={{ color: 'var(--t-soft)' }}>
                    <ChevronLeft size={18} />
                  </button>
                  <button onClick={() => cambiaMeseSidebar(1)} title="Mese successivo" className="rounded p-1 hover:bg-white/10 transition-colors" style={{ color: 'var(--t-soft)' }}>
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tema interfaccia: 4 quadratini (i 2 colori principali di ogni tema),
            in coda al contenuto della sidebar, separati da una riga */}
        <div className="mt-3 pt-3 pb-1" style={{ borderTop: '1px solid rgba(255,255,255,0.10)' }}>
          {!collapsed && <p className="px-4 text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: 'var(--t-etichetta)' }}>Tema</p>}
          <div className={collapsed ? 'flex flex-col items-center gap-1.5' : 'px-4 flex items-center gap-2'}>
            {TEMI.map(t => (
              <button key={t.id} onClick={() => cambiaTema(t.id)} title={t.nome} aria-label={`Tema ${t.nome}`}
                className="shrink-0 transition-transform hover:scale-110"
                style={{
                  width: 20, height: 20, borderRadius: 5,
                  background: `linear-gradient(135deg, ${t.c1} 50%, ${t.c2} 50%)`,
                  border: temaAttivo === t.id ? '2px solid #fff' : '1px solid rgba(255,255,255,0.35)',
                  boxShadow: temaAttivo === t.id ? '0 0 0 1px rgba(0,0,0,0.25)' : 'none',
                }} />
            ))}
          </div>
        </div>

        {/* Cambi turno da approvare: badge arancione in fondo, sotto i quadratini del tema */}
        {nCambi > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.10)' }}>
            <button onClick={vaiAiCambi} title={`${nCambi} cambio turno da approvare — vai a Turni del Mese`}
              className={`rounded-lg transition-transform hover:scale-[1.03] ${collapsed ? 'mx-auto flex flex-col items-center gap-0.5 px-1.5 py-1' : 'mx-4 flex items-center gap-2 px-2.5 py-1.5'}`}
              style={{ background: '#f59e0b', color: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
              <ArrowRightLeft size={collapsed ? 15 : 14} className="shrink-0" />
              {!collapsed && <span className="text-xs font-semibold leading-tight">Cambi turno</span>}
              <span className={collapsed ? 'text-[11px] font-extrabold leading-none' : 'ml-auto text-[11px] font-extrabold rounded-full px-1.5'} style={collapsed ? undefined : { background: 'rgba(0,0,0,0.20)' }}>{nCambi}</span>
            </button>
          </div>
        )}
      </aside>

      {/* Contenuto: wrapper a colonna alto almeno quanto l'area → i pulsanti mese
          restano SEMPRE in fondo (spinti giù se la pagina è corta, scorrono se è lunga) */}
      <main className="flex-1 min-w-0 overflow-auto" style={{ background: 'var(--t-bg)' }}>
        <div className="min-h-full flex flex-col" style={{ position: 'relative' }}>
          {finalizzato && location.pathname !== '/admin/finalizza' && (
            <div className="px-4 sm:px-6 pt-3" style={{ position: 'relative', zIndex: 50 }}>
              <div className="max-w-4xl flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: '#fef9c3', border: '1px solid #fde047' }}>
                <Lock size={15} className="shrink-0" style={{ color: '#a16207' }} />
                <p className="text-xs" style={{ color: '#713f12' }}>
                  <strong>{meseLabel(meseKey)} è finalizzato</strong>{infoFin?.autore ? <> da {infoFin.autore}</> : null}: turni, desiderata e personale sono in <strong>sola lettura</strong>.{' '}
                  <button onClick={() => handleNav('/admin/finalizza')} className="underline font-semibold" style={{ color: '#a16207' }}>Sblocca dalla Finalizzazione</button>
                </p>
              </div>
            </div>
          )}
          <div className="flex-1 min-w-0"><Outlet context={{ user }} /></div>
          {ROTTE_NUMERATE.has(location.pathname) && postazioneAttiva && (
            <div className="px-4 sm:px-6 pt-4 pb-6 mt-4">
              <div className="max-w-3xl mx-auto border-t mb-4" style={{ borderColor: '#d6d3cc' }} />
              <div className="flex justify-center gap-2">
                <CancellaMeseButton postazioneId={postazioneAttiva.id} meseKey={meseKey} anno={anno} mese={mese} />
              </div>
            </div>
          )}
          {/* VELO di sola-lettura sui passi ①–⑦ quando il mese è finalizzato:
              blocca ogni click sul contenuto (il banner giallo sopra resta cliccabile). */}
          {layerBlocco && (
            <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(255,255,255,0.5)', cursor: 'not-allowed' }}
              title={`${meseLabel(meseKey)} è finalizzato: sola lettura`} />
          )}
        </div>
      </main>
    </div>
  )
}
