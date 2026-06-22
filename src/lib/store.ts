/**
 * store — data-layer dell'app.
 *
 * Fase 1 (modalità DEV): implementazione su localStorage, così l'interfaccia
 * gira subito in locale senza backend. Tutte le funzioni sono `async` e
 * tornano Promise: quando collegheremo Supabase, basterà reimplementare
 * questi stessi metodi con le query al DB — i componenti NON cambiano.
 */

import type { Turnista, TurnoSchema, Livello, Ricorrenza } from '../types'
import { ADMIN_EMAIL } from './constants'

const LS_TURNISTI = 'gm_turnisti'
const LS_SCHEMA   = 'gm_schema'
const LS_SEEDED   = 'gm_seeded_v1'

function uid(): string {
  try { return crypto.randomUUID() } catch { return 'id-' + Math.abs(hashNow()).toString(36) }
}
// Fallback id senza Date.now nel path principale (uid usa crypto.randomUUID).
function hashNow(): number {
  let h = 0
  const s = String(performance.now()) + Math.floor(performance.timeOrigin)
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback }
  catch { return fallback }
}
function write<T>(key: string, val: T): void {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

// ── Seed iniziale (solo la prima volta) ─────────────────────────────
function ensureSeed(): void {
  if (read<boolean>(LS_SEEDED, false)) return
  const now = new Date().toISOString()

  const turnisti: Turnista[] = [
    { id: uid(), nome: 'Stefano Marabelli', email: ADMIN_EMAIL,        livello: 'admin',    created_at: now },
    { id: uid(), nome: 'Mario Rossi',       email: 'mario.rossi@gmail.com',  livello: 'turnista', created_at: now },
    { id: uid(), nome: 'Anna Bianchi',      email: 'anna.bianchi@gmail.com', livello: 'turnista', created_at: now },
  ]

  const schema: TurnoSchema[] = [
    { id: uid(), nome: 'Notte',  ora_inizio: '20:00', ora_fine: '08:00', n_turnisti: 1, ricorrenza: 'tutti',  giorni_custom: [], ordine: 10, created_at: now },
    { id: uid(), nome: 'Giorno', ora_inizio: '08:00', ora_fine: '20:00', n_turnisti: 1, ricorrenza: 'festivi', giorni_custom: [], ordine: 20, created_at: now },
  ]

  write(LS_TURNISTI, turnisti)
  write(LS_SCHEMA, schema)
  write(LS_SEEDED, true)
}
ensureSeed()

// ── Turnisti ────────────────────────────────────────────────────────
export interface NuovoTurnista {
  nome: string
  email: string
  livello: Livello
}

export const store = {
  async getTurnisti(): Promise<Turnista[]> {
    return read<Turnista[]>(LS_TURNISTI, [])
      .slice()
      .sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
  },

  async addTurnista(input: NuovoTurnista): Promise<Turnista> {
    const list = read<Turnista[]>(LS_TURNISTI, [])
    const email = input.email.trim().toLowerCase()
    if (list.some(t => t.email.toLowerCase() === email)) {
      throw new Error('Esiste già un turnista con questa email.')
    }
    const t: Turnista = {
      id: uid(),
      nome: input.nome.trim(),
      email,
      livello: input.livello,
      created_at: new Date().toISOString(),
    }
    write(LS_TURNISTI, [...list, t])
    return t
  },

  async updateTurnista(id: string, patch: Partial<NuovoTurnista>): Promise<void> {
    const list = read<Turnista[]>(LS_TURNISTI, [])
    write(LS_TURNISTI, list.map(t => t.id === id
      ? {
          ...t,
          ...(patch.nome    !== undefined ? { nome: patch.nome.trim() } : {}),
          ...(patch.email   !== undefined ? { email: patch.email.trim().toLowerCase() } : {}),
          ...(patch.livello !== undefined ? { livello: patch.livello } : {}),
        }
      : t))
  },

  async deleteTurnista(id: string): Promise<void> {
    const list = read<Turnista[]>(LS_TURNISTI, [])
    write(LS_TURNISTI, list.filter(t => t.id !== id))
  },

  // ── Schema turni ──────────────────────────────────────────────────
  async getSchema(): Promise<TurnoSchema[]> {
    return read<TurnoSchema[]>(LS_SCHEMA, [])
      .slice()
      .sort((a, b) => a.ordine - b.ordine)
  },

  async addTurnoSchema(input: Omit<TurnoSchema, 'id' | 'created_at' | 'ordine'>): Promise<TurnoSchema> {
    const list = read<TurnoSchema[]>(LS_SCHEMA, [])
    const ordine = list.length ? Math.max(...list.map(s => s.ordine)) + 10 : 10
    const s: TurnoSchema = { ...input, id: uid(), ordine, created_at: new Date().toISOString() }
    write(LS_SCHEMA, [...list, s])
    return s
  },

  async updateTurnoSchema(id: string, patch: Partial<TurnoSchema>): Promise<void> {
    const list = read<TurnoSchema[]>(LS_SCHEMA, [])
    write(LS_SCHEMA, list.map(s => s.id === id ? { ...s, ...patch, id: s.id } : s))
  },

  async deleteTurnoSchema(id: string): Promise<void> {
    const list = read<TurnoSchema[]>(LS_SCHEMA, [])
    write(LS_SCHEMA, list.filter(s => s.id !== id))
  },
}

// Riesporto un paio di tipi utili ai chiamanti.
export type { Ricorrenza }
