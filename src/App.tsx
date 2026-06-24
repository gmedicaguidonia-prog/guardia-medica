import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import { PostazioniPage } from './pages/admin/PostazioniPage'
import { AdminHomePage } from './pages/admin/AdminHomePage'
import { useVersionCheck } from './hooks/useVersionCheck'
import { UpdateToast } from './components/UpdateToast'
import { UnsavedProvider } from './contexts/UnsavedContext'
import { PostazioneProvider } from './contexts/PostazioneContext'
import { DebugProvider, useDebug } from './contexts/DebugContext'
import { useEffect } from 'react'
import { setAutoreCorrente } from './lib/store'
import { nomeCompleto } from './types'
import type { Livello } from './types'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 60_000, refetchOnWindowFocus: false },
  },
})

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #1c2818 0%, #456b3a 50%, #577a45 100%)' }}>
      <div className="rounded-2xl shadow-2xl p-8 text-center" style={{ background: '#faf8f3' }}>
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mb-3" style={{ borderColor: '#476540' }} />
        <p className="text-sm font-semibold" style={{ color: '#2b3c24' }}>Verifica accesso…</p>
      </div>
    </div>
  )
}

function AppRoutes() {
  const { user, loading, signInWithGoogle, signOut, devLogin, isDev } = useAuth()
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
  useEffect(() => { setAutoreCorrente(user ? nomeCompleto(user) : null) }, [user])

  return (
    <PostazioneProvider user={user}>
    <div className="min-h-screen flex flex-col">
      {user && <NavBar user={user} onSignOut={signOut} isDev={isDev} onDevSwitch={devLogin}
        updateAvailable={updateAvailable} onReload={applyUpdate} />}

      <Routes>
        <Route path="/login"
          element={<LoginPage user={user} onSignIn={signInWithGoogle} isDev={isDev} onDevLogin={devLogin} />} />

        {/* Pagina pubblica — tutti i loggati autorizzati */}
        <Route path="/turni"
          element={<ProtectedRoute user={user} loading={loading}><PublicTurniPage user={user} /></ProtectedRoute>} />

        {/* Sezione admin */}
        <Route path="/admin"
          element={<ProtectedRoute user={user} loading={loading} requireAdmin><AdminLayout user={user} /></ProtectedRoute>}>
          <Route index element={<AdminHomePage />} />
          <Route path="postazioni" element={<PostazioniPage />} />
          <Route path="regole"     element={<RegoleTurniPage />} />
          <Route path="impaginazione" element={<ImpaginazionePage />} />
          <Route path="desiderata" element={<DesiderataPage />} />
          <Route path="turni"      element={<GestioneTurniPage />} />
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
