/**
 * store — data-layer dell'app (Supabase in produzione, localStorage in DEV).
 * La configurazione turni è VERSIONATA: ogni versione è valida per un
 * intervallo di mesi (valido_da..valido_fino|∞) e contiene i propri turni.
 */

import { supabase, isSupabaseConfigured } from './supabase'
import type { Turnista, TurnoSchema, ConfigVersione, RegolaVersione, RegolaTurno, Turno, Livello, Ricorrenza } from '../types'
import { ADMIN_EMAIL } from './constants'

export interface NuovoTurnista { nome: string; email: string; livello: Livello }
export type NuovoTurnoInput = Omit<TurnoSchema, 'id' | 'created_at' | 'ordine' | 'versione_id'>

function pgCode(e: unknown): string | undefined { return (e as { code?: string })?.code }

function meseRange(anno: number, mese: number): { first: string; last: string } {
  const mm = String(mese).padStart(2, '0')
  const lastDay = new Date(anno, mese, 0).getDate()
  return { first: `${anno}-${mm}-01`, last: `${anno}-${mm}-${String(lastDay).padStart(2, '0')}` }
}

/** Versione che copre il mese (valido_da ≤ mese ≤ valido_fino|∞), preferendo
 *  quella con valido_da più recente. `mese` = 'YYYY-MM'. */
function pickVersione<T extends { valido_da: string; valido_fino: string | null }>(versioni: T[], mese: string): T | null {
  const cov = versioni.filter(v => v.valido_da <= mese && (v.valido_fino == null || mese <= v.valido_fino))
  if (!cov.length) return null
  return cov.slice().sort((a, b) => b.valido_da.localeCompare(a.valido_da))[0]
}

// ════════════════════════════════════════════════════════════════
// SUPABASE
// ════════════════════════════════════════════════════════════════
function normSchema(r: Record<string, unknown>): TurnoSchema {
  return {
    id:            r.id as string,
    versione_id:   r.versione_id as string,
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
  // ── Turnisti ──
  async getTurnisti(): Promise<Turnista[]> {
    const { data, error } = await supabase.from('turnisti').select('*').order('nome')
    if (error) throw error
    return (data ?? []) as Turnista[]
  },
  async addTurnista(input: NuovoTurnista): Promise<void> {
    const { error } = await supabase.from('turnisti').insert({ nome: input.nome.trim(), email: input.email.trim().toLowerCase(), livello: input.livello })
    if (error) { if (pgCode(error) === '23505') throw new Error('Esiste già un turnista con questa email.'); throw error }
  },
  async updateTurnista(id: string, patch: Partial<NuovoTurnista>): Promise<void> {
    const upd: Record<string, unknown> = {}
    if (patch.nome    !== undefined) upd.nome    = patch.nome.trim()
    if (patch.email   !== undefined) upd.email   = patch.email.trim().toLowerCase()
    if (patch.livello !== undefined) upd.livello = patch.livello
    const { error } = await supabase.from('turnisti').update(upd).eq('id', id)
    if (error) { if (pgCode(error) === '23505') throw new Error('Esiste già un turnista con questa email.'); throw error }
  },
  async deleteTurnista(id: string): Promise<void> {
    const { error } = await supabase.from('turnisti').delete().eq('id', id)
    if (error) throw error
  },

  // ── Versioni di configurazione ──
  async getVersioneMese(mese: string): Promise<ConfigVersione | null> {
    const { data, error } = await supabase.from('schema_versioni').select('*')
    if (error) throw error
    return pickVersione((data ?? []) as ConfigVersione[], mese)
  },
  async getVersioni(): Promise<ConfigVersione[]> {
    const { data, error } = await supabase.from('schema_versioni').select('*').order('valido_da')
    if (error) throw error
    return (data ?? []) as ConfigVersione[]
  },
  async creaVersione(mese: string): Promise<ConfigVersione> {
    const { data, error } = await supabase.from('schema_versioni').insert({ valido_da: mese, valido_fino: null }).select().single()
    if (error) throw error
    return data as ConfigVersione
  },
  async setValiditaVersione(id: string, validoFino: string | null): Promise<void> {
    const { error } = await supabase.from('schema_versioni').update({ valido_fino: validoFino }).eq('id', id)
    if (error) throw error
  },

  // ── Turni dello schema (per versione) ──
  async getSchemaVersione(versioneId: string): Promise<TurnoSchema[]> {
    const { data, error } = await supabase.from('schema_turni').select('*').eq('versione_id', versioneId).order('ordine')
    if (error) throw error
    return (data ?? []).map(normSchema)
  },
  async addTurnoSchema(versioneId: string, input: NuovoTurnoInput): Promise<TurnoSchema> {
    const { data: maxRows } = await supabase.from('schema_turni').select('ordine').eq('versione_id', versioneId).order('ordine', { ascending: false }).limit(1)
    const ordine = (maxRows && maxRows.length) ? (maxRows[0].ordine as number) + 10 : 10
    const { data, error } = await supabase.from('schema_turni').insert({
      versione_id: versioneId, nome: input.nome, ora_inizio: input.ora_inizio, ora_fine: input.ora_fine,
      n_turnisti: input.n_turnisti, ricorrenza: input.ricorrenza, giorni_custom: input.giorni_custom, ordine,
    }).select().single()
    if (error) throw error
    return normSchema(data)
  },
  async updateTurnoSchema(id: string, patch: Partial<TurnoSchema>): Promise<void> {
    const upd: Record<string, unknown> = { ...patch }
    delete upd.id; delete upd.created_at; delete upd.versione_id
    const { error } = await supabase.from('schema_turni').update(upd).eq('id', id)
    if (error) throw error
  },
  async deleteTurnoSchema(id: string): Promise<void> {
    const { error } = await supabase.from('schema_turni').delete().eq('id', id)
    if (error) throw error
  },

  // ── Turni assegnati ──
  async getTurniMese(anno: number, mese: number): Promise<Turno[]> {
    const { first, last } = meseRange(anno, mese)
    const { data, error } = await supabase.from('turni').select('*').gte('data', first).lte('data', last)
    if (error) throw error
    return (data ?? []) as Turno[]
  },
  async setAssegnazione(data: string, turnoSchemaId: string, slot: number, turnistaId: string | null): Promise<void> {
    if (turnistaId === null) {
      const { error } = await supabase.from('turni').delete().match({ data, turno_schema_id: turnoSchemaId, slot })
      if (error) throw error
    } else {
      const { error } = await supabase.from('turni').upsert({ data, turno_schema_id: turnoSchemaId, slot, turnista_id: turnistaId }, { onConflict: 'data,turno_schema_id,slot' })
      if (error) throw error
    }
  },

  // ── Regole turni fisse (settimanali, versionate) ──
  async getRegoleVersioneMese(mese: string): Promise<RegolaVersione | null> {
    const { data, error } = await supabase.from('regole_versioni').select('*')
    if (error) throw error
    return pickVersione((data ?? []) as RegolaVersione[], mese)
  },
  async creaRegoleVersione(mese: string): Promise<RegolaVersione> {
    const { data, error } = await supabase.from('regole_versioni').insert({ valido_da: mese, valido_fino: null }).select().single()
    if (error) throw error
    return data as RegolaVersione
  },
  async setValiditaRegoleVersione(id: string, validoFino: string | null): Promise<void> {
    const { error } = await supabase.from('regole_versioni').update({ valido_fino: validoFino }).eq('id', id)
    if (error) throw error
  },
  async getRegole(regoleVersioneId: string): Promise<RegolaTurno[]> {
    const { data, error } = await supabase.from('regole_turni').select('*').eq('regola_versione_id', regoleVersioneId)
    if (error) throw error
    return (data ?? []) as RegolaTurno[]
  },
  async setRegola(regoleVersioneId: string, giorno: number, turnoSchemaId: string, slot: number, turnistaId: string | null): Promise<void> {
    if (turnistaId === null) {
      const { error } = await supabase.from('regole_turni').delete().match({ regola_versione_id: regoleVersioneId, giorno_settimana: giorno, turno_schema_id: turnoSchemaId, slot })
      if (error) throw error
    } else {
      const { error } = await supabase.from('regole_turni').upsert({ regola_versione_id: regoleVersioneId, giorno_settimana: giorno, turno_schema_id: turnoSchemaId, slot, turnista_id: turnistaId }, { onConflict: 'regola_versione_id,giorno_settimana,turno_schema_id,slot' })
      if (error) throw error
    }
  },
  async deleteVersione(id: string): Promise<void> {
    const { error } = await supabase.from('schema_versioni').delete().eq('id', id)
    if (error) throw error
  },
  async getRegoleVersioni(): Promise<RegolaVersione[]> {
    const { data, error } = await supabase.from('regole_versioni').select('*').order('valido_da')
    if (error) throw error
    return (data ?? []) as RegolaVersione[]
  },
  async deleteRegoleVersione(id: string): Promise<void> {
    const { error } = await supabase.from('regole_versioni').delete().eq('id', id)
    if (error) throw error
  },
  async setOreMinSettimana(id: string, ore: number | null): Promise<void> {
    const { error } = await supabase.from('regole_versioni').update({ ore_min_settimana: ore }).eq('id', id)
    if (error) throw error
  },
}

// ════════════════════════════════════════════════════════════════
// LOCALE (DEV)
// ════════════════════════════════════════════════════════════════
const LS_TURNISTI         = 'gm_turnisti'
const LS_SCHEMA           = 'gm_schema'
const LS_VERSIONI         = 'gm_versioni'
const LS_REGOLE_VERSIONI  = 'gm_regole_versioni'
const LS_REGOLE           = 'gm_regole'
const LS_TURNI            = 'gm_turni'
const LS_SEEDED           = 'gm_seeded_v2'

function uid(): string { try { return crypto.randomUUID() } catch { return 'id-' + Math.random().toString(36).slice(2) } }
function read<T>(key: string, fallback: T): T { try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback } catch { return fallback } }
function writeLs<T>(key: string, val: T): void { try { localStorage.setItem(key, JSON.stringify(val)) } catch {} }
function meseCorrente(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

function ensureSeed(): void {
  if (read<boolean>(LS_SEEDED, false)) return
  const now = new Date().toISOString()
  const vid = uid()
  writeLs<ConfigVersione[]>(LS_VERSIONI, [{ id: vid, valido_da: meseCorrente(), valido_fino: null, created_at: now }])
  writeLs<Turnista[]>(LS_TURNISTI, [{ id: uid(), nome: 'Stefano Marabelli', email: ADMIN_EMAIL, livello: 'admin', created_at: now }])
  writeLs<TurnoSchema[]>(LS_SCHEMA, [
    { id: uid(), versione_id: vid, nome: 'Notte',  ora_inizio: '20:00', ora_fine: '08:00', n_turnisti: 1, ricorrenza: 'tutti',   giorni_custom: [], ordine: 10, created_at: now },
    { id: uid(), versione_id: vid, nome: 'Giorno', ora_inizio: '08:00', ora_fine: '20:00', n_turnisti: 1, ricorrenza: 'festivi', giorni_custom: [], ordine: 20, created_at: now },
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

  async getVersioneMese(mese: string): Promise<ConfigVersione | null> {
    ensureSeed()
    return pickVersione(read<ConfigVersione[]>(LS_VERSIONI, []), mese)
  },
  async getVersioni(): Promise<ConfigVersione[]> {
    ensureSeed()
    return read<ConfigVersione[]>(LS_VERSIONI, []).slice().sort((a, b) => a.valido_da.localeCompare(b.valido_da))
  },
  async creaVersione(mese: string): Promise<ConfigVersione> {
    const v: ConfigVersione = { id: uid(), valido_da: mese, valido_fino: null, created_at: new Date().toISOString() }
    writeLs(LS_VERSIONI, [...read<ConfigVersione[]>(LS_VERSIONI, []), v])
    return v
  },
  async setValiditaVersione(id: string, validoFino: string | null): Promise<void> {
    writeLs(LS_VERSIONI, read<ConfigVersione[]>(LS_VERSIONI, []).map(v => v.id === id ? { ...v, valido_fino: validoFino } : v))
  },

  async getSchemaVersione(versioneId: string): Promise<TurnoSchema[]> {
    ensureSeed()
    return read<TurnoSchema[]>(LS_SCHEMA, []).filter(s => s.versione_id === versioneId).slice().sort((a, b) => a.ordine - b.ordine)
  },
  async addTurnoSchema(versioneId: string, input: NuovoTurnoInput): Promise<TurnoSchema> {
    const list = read<TurnoSchema[]>(LS_SCHEMA, [])
    const ordine = list.filter(s => s.versione_id === versioneId).reduce((m, s) => Math.max(m, s.ordine), 0) + 10
    const s: TurnoSchema = { ...input, id: uid(), versione_id: versioneId, ordine, created_at: new Date().toISOString() }
    writeLs(LS_SCHEMA, [...list, s])
    return s
  },
  async updateTurnoSchema(id: string, patch: Partial<TurnoSchema>): Promise<void> {
    writeLs(LS_SCHEMA, read<TurnoSchema[]>(LS_SCHEMA, []).map(s => s.id === id ? { ...s, ...patch, id: s.id, versione_id: s.versione_id } : s))
  },
  async deleteTurnoSchema(id: string): Promise<void> {
    writeLs(LS_SCHEMA, read<TurnoSchema[]>(LS_SCHEMA, []).filter(s => s.id !== id))
  },

  async getTurniMese(anno: number, mese: number): Promise<Turno[]> {
    const { first, last } = meseRange(anno, mese)
    return read<Turno[]>(LS_TURNI, []).filter(t => t.data >= first && t.data <= last)
  },
  async setAssegnazione(data: string, turnoSchemaId: string, slot: number, turnistaId: string | null): Promise<void> {
    const list = read<Turno[]>(LS_TURNI, []).filter(t => !(t.data === data && t.turno_schema_id === turnoSchemaId && t.slot === slot))
    if (turnistaId !== null) list.push({ id: uid(), data, turno_schema_id: turnoSchemaId, slot, turnista_id: turnistaId, created_at: new Date().toISOString() })
    writeLs(LS_TURNI, list)
  },

  async getRegoleVersioneMese(mese: string): Promise<RegolaVersione | null> {
    ensureSeed()
    return pickVersione(read<RegolaVersione[]>(LS_REGOLE_VERSIONI, []), mese)
  },
  async creaRegoleVersione(mese: string): Promise<RegolaVersione> {
    const v: RegolaVersione = { id: uid(), valido_da: mese, valido_fino: null, ore_min_settimana: null, created_at: new Date().toISOString() }
    writeLs(LS_REGOLE_VERSIONI, [...read<RegolaVersione[]>(LS_REGOLE_VERSIONI, []), v])
    return v
  },
  async setValiditaRegoleVersione(id: string, validoFino: string | null): Promise<void> {
    writeLs(LS_REGOLE_VERSIONI, read<RegolaVersione[]>(LS_REGOLE_VERSIONI, []).map(v => v.id === id ? { ...v, valido_fino: validoFino } : v))
  },
  async getRegole(regoleVersioneId: string): Promise<RegolaTurno[]> {
    ensureSeed()
    return read<RegolaTurno[]>(LS_REGOLE, []).filter(r => r.regola_versione_id === regoleVersioneId)
  },
  async setRegola(regoleVersioneId: string, giorno: number, turnoSchemaId: string, slot: number, turnistaId: string | null): Promise<void> {
    const list = read<RegolaTurno[]>(LS_REGOLE, []).filter(r => !(r.regola_versione_id === regoleVersioneId && r.giorno_settimana === giorno && r.turno_schema_id === turnoSchemaId && r.slot === slot))
    if (turnistaId !== null) list.push({ id: uid(), regola_versione_id: regoleVersioneId, giorno_settimana: giorno, turno_schema_id: turnoSchemaId, slot, turnista_id: turnistaId, created_at: new Date().toISOString() })
    writeLs(LS_REGOLE, list)
  },
  async deleteVersione(id: string): Promise<void> {
    writeLs(LS_VERSIONI, read<ConfigVersione[]>(LS_VERSIONI, []).filter(v => v.id !== id))
    writeLs(LS_SCHEMA, read<TurnoSchema[]>(LS_SCHEMA, []).filter(s => s.versione_id !== id))
  },
  async getRegoleVersioni(): Promise<RegolaVersione[]> {
    ensureSeed()
    return read<RegolaVersione[]>(LS_REGOLE_VERSIONI, []).slice().sort((a, b) => a.valido_da.localeCompare(b.valido_da))
  },
  async deleteRegoleVersione(id: string): Promise<void> {
    writeLs(LS_REGOLE_VERSIONI, read<RegolaVersione[]>(LS_REGOLE_VERSIONI, []).filter(v => v.id !== id))
    writeLs(LS_REGOLE, read<RegolaTurno[]>(LS_REGOLE, []).filter(r => r.regola_versione_id !== id))
  },
  async setOreMinSettimana(id: string, ore: number | null): Promise<void> {
    writeLs(LS_REGOLE_VERSIONI, read<RegolaVersione[]>(LS_REGOLE_VERSIONI, []).map(v => v.id === id ? { ...v, ore_min_settimana: ore } : v))
  },
}

// ────────────────────────────────────────────────────────────────
export const store = isSupabaseConfigured ? supaStore : localStore
export type { Ricorrenza }
