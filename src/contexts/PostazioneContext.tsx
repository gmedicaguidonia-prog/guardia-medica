import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { store } from '../lib/store'
import { puoGestire } from '../types'
import type { AuthUser, Postazione } from '../types'

interface Ctx {
  postazioni: Postazione[]                 // postazioni visibili/gestibili dall'utente
  postazioneId: string | null              // postazione attiva (selezionata)
  postazioneAttiva: Postazione | null
  setPostazioneId: (id: string) => void
  loading: boolean
}

const PostazioneCtx = createContext<Ctx>({
  postazioni: [], postazioneId: null, postazioneAttiva: null, setPostazioneId: () => {}, loading: false,
})

const LS_KEY = 'gm_postazione'

export function PostazioneProvider({ user, children }: { user: AuthUser | null; children: ReactNode }) {
  const { data: tutte = [], isLoading: l1 } = useQuery<Postazione[]>({
    queryKey: ['postazioni'], queryFn: () => store.getPostazioni(), enabled: !!user,
  })
  const { data: gestiteIds = [], isLoading: l2 } = useQuery<string[]>({
    queryKey: ['postazioni-gestite', user?.id],
    queryFn: () => store.getPostazioniGestite(user!.id),
    enabled: !!user && user.livello === 'responsabile',
  })

  // Postazioni visibili: admin → tutte; responsabile → quelle che gestisce;
  // turnista/esterno → la propria (non usano il selettore in admin).
  const postazioni = useMemo(() => {
    if (!user) return []
    if (user.livello === 'admin') return tutte
    if (user.livello === 'responsabile') return tutte.filter(p => gestiteIds.includes(p.id))
    return tutte.filter(p => p.id === user.postazioneId)   // turnista/esterno: solo la propria
  }, [user, tutte, gestiteIds])

  const [postazioneId, setPid] = useState<string | null>(() => localStorage.getItem(LS_KEY))

  // Seleziona/valida la postazione attiva quando arrivano quelle visibili.
  useEffect(() => {
    if (!postazioni.length) return
    if (!postazioneId || !postazioni.some(p => p.id === postazioneId)) setPid(postazioni[0].id)
  }, [postazioni, postazioneId])

  const value = useMemo<Ctx>(() => ({
    postazioni,
    postazioneId,
    postazioneAttiva: postazioni.find(p => p.id === postazioneId) ?? null,
    setPostazioneId: (id: string) => { try { localStorage.setItem(LS_KEY, id) } catch { /* ignore */ } setPid(id) },
    loading: !!user && (l1 || (user.livello === 'responsabile' && l2)),
  }), [postazioni, postazioneId, user, l1, l2])

  return <PostazioneCtx.Provider value={value}>{children}</PostazioneCtx.Provider>
}

export function usePostazione() { return useContext(PostazioneCtx) }
