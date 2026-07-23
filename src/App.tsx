import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from './hooks/useAuth'
import { NavBar } from './components/NavBar'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { PublicTurniPage } from './pages/PublicTurniPage'
import { AdminLayout } from './pages/admin/AdminLayout'
import { TurnistiPage } from './pages/admin/TurnistiPage'
import { SchemaTurniPage } from './pages/admin/SchemaTurniPage'
import { GestioneTurniPage } from './pages/admin/GestioneTurniPage'
import { RegoleTurniPage } from './pages/admin/RegoleTurniPage'
import { ImpaginazionePage } from './pages/admin/ImpaginazionePage'
import { DesiderataPage } from './pages/admin/DesiderataPage'
import { FestivitaPage } from './pages/admin/FestivitaPage'
import { FinalizzazionePage } from './pages/admin/FinalizzazionePage'
import { StampaTurniPage } from './pages/StampaTurniPage'
import { PostazioniPage } from './pages/admin/PostazioniPage'
import { AdminHomePage } from './pages/admin/AdminHomePage'
import { useVersionCheck } from './hooks/useVersionCheck'
import { UpdateToast } from './components/UpdateToast'
import { UnsavedProvider } from './contexts/UnsavedContext'
import { PostazioneProvider } from './contexts/PostazioneContext'
import { DebugProvider, useDebug } from './contexts/DebugContext'
import { useEffect } from 'react'
import { setAutoreCorrente } from './lib/store'
import { supabase } from './lib/supabase'
import { applicaTema, temaSalvato } from './lib/temi'
import { nomeCompleto } from './types'
import type { Livello } from './types'

// Tema: applicato SUBITO all'avvio dal ricordo locale (niente "lampo" di colori),
// poi riallineato al profilo utente appena disponibile (vedi AppShell).
applicaTema(temaSalvato())

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 60_000, refetchOnWindowFocus: false },
  },
})

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, var(--t-notte) 0%, var(--t-primario) 50%, var(--t-etichetta) 100%)' }}>
      <div className="rounded-2xl shadow-2xl p-8 text-center" style={{ background: 'var(--t-card)' }}>
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mb-3" style={{ borderColor: 'var(--t-accento)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--t-titolo)' }}>Verifica accesso…</p>
      </div>
    </div>
  )
}

function AppRoutes() {
  const { user, loading, signInWithGoogle, signOut, devLogin, isDev } = useAuth()
  // ── Sessione ↔ query: fix «vedo il calendario vuoto» ──
  //  A volte le query partono PRIMA che la sessione Supabase sia agganciata (profilo dalla cache +
  //  timeout di setup), quindi vanno "anonime" e la RLS restituisce vuoto (niente turni/nomi). Qui,
  //  appena l'utente è disponibile, ASPETTIAMO che la sessione sia caricata in memoria e poi
  //  RIFACCIAMO tutte le query: così vengono rilette con l'identità e i turni compaiono.
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      try { await supabase.auth.getSession() } catch { /* ignore */ }
      if (!cancelled) queryClient.invalidateQueries()
    })()
    return () => { cancelled = true }
  }, [user?.id])
  return (
    <DebugProvider realUser={user}>
      <AppShell loading={loading} signInWithGoogle={signInWithGoogle} signOut={signOut} devLogin={devLogin} isDev={isDev} />
    </DebugProvider>
  )
}

function AppShell({ loading, signInWithGoogle, signOut, devLogin, isDev }: {
  loading: boolean; signInWithGoogle: () => void; signOut: () => void; devLogin: (l: Livello) => void; isDev: boolean
}) {
  const { effectiveUser: user } = useDebug()
  const { updateAvailable, applyUpdate } = useVersionCheck()
  const location = useLocation()
  useEffect(() => { setAutoreCorrente(user ? nomeCompleto(user) : null) }, [user])
  useEffect(() => { if (user?.tema) applicaTema(user.tema) }, [user?.tema])   // tema salvato sul profilo → vince sul ricordo locale
  const paginaStampa = location.pathname.startsWith('/admin/stampa')   // pagina di stampa: niente navbar

  return (
    <PostazioneProvider user={user}>
    <div className="min-h-screen flex flex-col">
      {user && !paginaStampa && <NavBar user={user} onSignOut={signOut} isDev={isDev} onDevSwitch={devLogin}
        updateAvailable={updateAvailable} onReload={applyUpdate} />}

      <Routes>
        <Route path="/login"
          element={<LoginPage user={user} onSignIn={signInWithGoogle} isDev={isDev} onDevLogin={devLogin} />} />

        {/* Pagina pubblica — tutti i loggati autorizzati */}
        <Route path="/turni"
          element={<ProtectedRoute user={user} loading={loading}><PublicTurniPage user={user} /></ProtectedRoute>} />

        {/* Stampa/PDF pubblica: STESSA pagina di stampa, aperta dal pulsante «Scarica PDF Calendario»
            della pagina pubblica. Accessibile a tutti i loggati autorizzati (non solo agli admin):
            mostra gli stessi dati del calendario già pubblicato. */}
        <Route path="/stampa"
          element={<ProtectedRoute user={user} loading={loading}><StampaTurniPage /></ProtectedRoute>} />

        {/* Stampa turni: scheda a parte, senza layout admin (aperta dalla Finalizzazione) */}
        <Route path="/admin/stampa"
          element={<ProtectedRoute user={user} loading={loading} requireAdmin><StampaTurniPage /></ProtectedRoute>} />

        {/* Sezione admin */}
        <Route path="/admin"
          element={<ProtectedRoute user={user} loading={loading} requireAdmin><AdminLayout user={user} /></ProtectedRoute>}>
          <Route index element={<AdminHomePage />} />
          <Route path="postazioni" element={<PostazioniPage />} />
          <Route path="regole"     element={<RegoleTurniPage />} />
          <Route path="impaginazione" element={<ImpaginazionePage />} />
          <Route path="festivita" element={<FestivitaPage />} />
          <Route path="desiderata" element={<DesiderataPage />} />
          <Route path="turni"      element={<GestioneTurniPage />} />
          <Route path="finalizza"  element={<FinalizzazionePage />} />
          <Route path="turnisti" element={<TurnistiPage />} />
          <Route path="schema"   element={<SchemaTurniPage />} />
        </Route>

        {/* Root → sempre la pagina pubblica (l'admin si apre dalla navbar) */}
        <Route path="/"
          element={
            loading ? <Spinner />
              : !user ? <Navigate to="/login" replace />
              : <Navigate to="/turni" replace />
          } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Toast centrato: nuova versione disponibile (badge anche nella navbar) */}
      {updateAvailable && <UpdateToast onReload={applyUpdate} />}
    </div>
    </PostazioneProvider>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <UnsavedProvider>
          <AppRoutes />
        </UnsavedProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
