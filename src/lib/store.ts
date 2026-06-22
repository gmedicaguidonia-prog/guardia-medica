/**
 * store — data-layer dell'app.
 *
 * Sceglie automaticamente l'implementazione:
 *  - Supabase configurato → query reali al database (produzione)
 *  - altrimenti           → localStorage + seed (modalità DEV in locale)
 * I componenti usano sempre `store.*`: non sanno quale delle due è attiva.
 */

import { supabase, isSupabaseConfigured } from './supabase'
import type { Turnista, TurnoSchema, Livello, Ricorrenza } from '../types'
import { ADMIN_EMAIL } from './constants'

export interface NuovoTurnista {
  nome: string
  email: string
  livello: Livello
}

function pgCode(e: unknown): string | undefined {
  return (e as { code?: string })?.code
}

// ════════════════════════════════════════════════════════════════
// Implementazione SUPABASE (produzione)
// ════════════════════════════════════════════════════════════════
function normalizeSchemaRow(r: Record<string, unknown>): TurnoSchema {
  return {
    id:            r.id as string,
    nome:          (r.nome as string) ?? '',
    ora_inizio:    r.ora_inizio as string,
    ora_fine:      r.ora_fine as string,
    n_turnisti:    r.n_turnisti as number,
    ricorrenza:    r.ricorrenza as Ricorrenza,
    giorni_custom: Array.isArray(r.giorni_custom) ? (r.giorni_custom as number[]) : [],
    ordine:        r.ordine as number,
    created_at:    r.created_at as string,
  }
}

const supaStore = {
  async getTurnisti(): Promise<Turnista[]> {
    const { data, error } = await supabase.from('turnisti').select('*').order('nome')
    if (error) throw error
    return (data ?? []) as Turnista[]
  },

  async addTurnista(input: NuovoTurnista): Promise<void> {
    const { error } = await supabase.from('turnisti').insert({
      nome: input.nome.trim(), email: input.email.trim().toLowerCase(), livello: input.livello,
    })
    if (error) {
      if (pgCode(error) === '23505') throw new Error('Esiste già un turnista con questa email.')
      throw error
    }
  },

  async updateTurnista(id: string, patch: Partial<NuovoTurnista>): Promise<void> {
    const upd: Record<string, unknown> = {}
    if (patch.nome    !== undefined) upd.nome    = patch.nome.trim()
    if (patch.email   !== undefined) upd.email   = patch.email.trim().toLowerCase()
    if (patch.livello !== undefined) upd.livello = patch.livello
    const { error } = await supabase.from('turnisti').update(upd).eq('id', id)
    if (error) {
      if (pgCode(error) === '23505') throw new Error('Esiste già un turnista con questa email.')
      throw error
    }
  },

  async deleteTurnista(id: string): Promise<void> {
    const { error } = await supabase.from('turnisti').delete().eq('id', id)
    if (error) throw error
  },

  async getSchema(): Promise<TurnoSchema[]> {
    const { data, error } = await supabase.from('schema_turni').select('*').order('ordine')
    if (error) throw error
    return (data ?? []).map(normalizeSchemaRow)
  },

  async addTurnoSchema(input: Omit<TurnoSchema, 'id' | 'created_at' | 'ordine'>): Promise<TurnoSchema> {
    const { data: maxRows } = await supabase.from('schema_turni')
      .select('ordine').order('ordine', { ascending: false }).limit(1)
    const ordine = (maxRows && maxRows.length) ? (maxRows[0].ordine as number) + 10 : 10
    const { data, error } = await supabase.from('schema_turni').insert({
      nome: input.nome, ora_inizio: input.ora_inizio, ora_fine: input.ora_fine,
      n_turnisti: input.n_turnisti, ricorrenza: input.ricorrenza,
      giorni_custom: input.giorni_custom, ordine,
    }).select().single()
    if (error) throw error
    return normalizeSchemaRow(data)
  },

  async updateTurnoSchema(id: string, patch: Partial<TurnoSchema>): Promise<void> {
    const upd: Record<string, unknown> = { ...patch }
    delete upd.id; delete upd.created_at
    const { error } = await supabase.from('schema_turni').update(upd).eq('id', id)
    if (error) throw error
  },

  async deleteTurnoSchema(id: string): Promise<void> {
    const { error } = await supabase.from('schema_turni').delete().eq('id', id)
    if (error) throw error
  },
}

// ════════════════════════════════════════════════════════════════
// Implementazione LOCALE (modalità DEV — localStorage + seed)
// ════════════════════════════════════════════════════════════════
const LS_TURNISTI = 'gm_turnisti'
const LS_SCHEMA   = 'gm_schema'
const LS_SEEDED   = 'gm_seeded_v1'

function uid(): string {
  try { return crypto.randomUUID() } catch { return 'id-' + Math.random().toString(36).slice(2) }
}
function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback } catch { return fallback }
}
function writeLs<T>(key: string, val: T): void {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}
function ensureSeed(): void {
  if (read<boolean>(LS_SEEDED, false)) return
  const now = new Date().toISOString()
  writeLs<Turnista[]>(LS_TURNISTI, [
    { id: uid(), nome: 'Stefano Marabelli', email: ADMIN_EMAIL, livello: 'admin', created_at: now },
  ])
  writeLs<TurnoSchema[]>(LS_SCHEMA, [
    { id: uid(), nome: 'Notte',  ora_inizio: '20:00', ora_fine: '08:00', n_turnisti: 1, ricorrenza: 'tutti',   giorni_custom: [], ordine: 10, created_at: now },
    { id: uid(), nome: 'Giorno', ora_inizio: '08:00', ora_fine: '20:00', n_turnisti: 1, ricorrenza: 'festivi', giorni_custom: [], ordine: 20, created_at: now },
  ])
  writeLs(LS_SEEDED, true)
}

const localStore = {
  async getTurnisti(): Promise<Turnista[]> {
    ensureSeed()
    return read<Turnista[]>(LS_TURNISTI, []).slice().sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
  },
  async addTurnista(input: NuovoTurnista): Promise<void> {
    ensureSeed()
    const list = read<Turnista[]>(LS_TURNISTI, [])
    const email = input.email.trim().toLowerCase()
    if (list.some(t => t.email.toLowerCase() === email)) throw new Error('Esiste già un turnista con questa email.')
    list.push({ id: uid(), nome: input.nome.trim(), email, livello: input.livello, created_at: new Date().toISOString() })
    writeLs(LS_TURNISTI, list)
  },
  async updateTurnista(id: string, patch: Partial<NuovoTurnista>): Promise<void> {
    const list = read<Turnista[]>(LS_TURNISTI, [])
    writeLs(LS_TURNISTI, list.map(t => t.id === id ? {
      ...t,
      ...(patch.nome    !== undefined ? { nome: patch.nome.trim() } : {}),
      ...(patch.email   !== undefined ? { email: patch.email.trim().toLowerCase() } : {}),
      ...(patch.livello !== undefined ? { livello: patch.livello } : {}),
    } : t))
  },
  async deleteTurnista(id: string): Promise<void> {
    writeLs(LS_TURNISTI, read<Turnista[]>(LS_TURNISTI, []).filter(t => t.id !== id))
  },
  async getSchema(): Promise<TurnoSchema[]> {
    ensureSeed()
    return read<TurnoSchema[]>(LS_SCHEMA, []).slice().sort((a, b) => a.ordine - b.ordine)
  },
  async addTurnoSchema(input: Omit<TurnoSchema, 'id' | 'created_at' | 'ordine'>): Promise<TurnoSchema> {
    const list = read<TurnoSchema[]>(LS_SCHEMA, [])
    const ordine = list.length ? Math.max(...list.map(s => s.ordine)) + 10 : 10
    const s: TurnoSchema = { ...input, id: uid(), ordine, created_at: new Date().toISOString() }
    writeLs(LS_SCHEMA, [...list, s])
    return s
  },
  async updateTurnoSchema(id: string, patch: Partial<TurnoSchema>): Promise<void> {
    writeLs(LS_SCHEMA, read<TurnoSchema[]>(LS_SCHEMA, []).map(s => s.id === id ? { ...s, ...patch, id: s.id } : s))
  },
  async deleteTurnoSchema(id: string): Promise<void> {
    writeLs(LS_SCHEMA, read<TurnoSchema[]>(LS_SCHEMA, []).filter(s => s.id !== id))
  },
}

// ────────────────────────────────────────────────────────────────
export const store = isSupabaseConfigured ? supaStore : localStore
export type { Ricorrenza }
