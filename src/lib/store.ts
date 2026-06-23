/**
 * store — data-layer dell'app (Supabase in produzione, localStorage in DEV).
 * MULTI-POSTAZIONE: ogni dato è filtrato per `postazioneId`. La configurazione
 * turni è VERSIONATA: ogni versione è valida per un intervallo di mesi.
 */

import { supabase, isSupabaseConfigured } from './supabase'
import { cmpTurnisti } from '../types'
import type { Turnista, TurnoSchema, ConfigVersione, RegolaVersione, RegolaTurno, Turno, Livello, Ricorrenza, Desiderata, DesiderataFinestra, TipoDesiderata, Postazione, Utente, MiaPostazione } from '../types'
import { ADMIN_EMAIL } from './constants'

export interface NuovoMembro { nome: string; cognome: string; email: string; livello: Livello; utenteId?: string }
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
function normMembro(r: Record<string, unknown>): Turnista {
  const u = (r.utenti ?? {}) as Record<string, unknown>
  return {
    id:         r.id as string,
    utente_id:  r.utente_id as string,
    nome:       (u.nome as string) ?? '',
    cognome:    (u.cognome as string) ?? '',
    email:      (u.email as string) ?? '',
    livello:    r.livello as Livello,
    created_at: (r.created_at as string) ?? '',
  }
}

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
  // ── Postazioni ──
  async getPostazioni(): Promise<Postazione[]> {
    const { data, error } = await supabase.from('postazioni').select('*').order('nome')
    if (error) throw error
    return (data ?? []) as Postazione[]
  },
  async creaPostazione(nome: string): Promise<Postazione> {
    const { data, error } = await supabase.from('postazioni').insert({ nome: nome.trim() }).select().single()
    if (error) throw error
    return data as Postazione
  },
  async updatePostazione(id: string, patch: Partial<Pick<Postazione, 'nome' | 'attiva'>>): Promise<void> {
    const { error } = await supabase.from('postazioni').update(patch).eq('id', id)
    if (error) throw error
  },
  async deletePostazione(id: string): Promise<void> {
    const { error } = await supabase.from('postazioni').delete().eq('id', id)
    if (error) throw error
  },
  async getPostazioniGestite(utenteId: string): Promise<string[]> {
    const { data, error } = await supabase.from('turnisti').select('postazione_id').eq('utente_id', utenteId).eq('livello', 'responsabile')
    if (error) throw error
    return (data ?? []).map(r => r.postazione_id as string)
  },
  async getMiePostazioni(utenteId: string): Promise<MiaPostazione[]> {
    const { data, error } = await supabase.from('turnisti').select('id, livello, postazione_id, postazioni(nome)').eq('utente_id', utenteId)
    if (error) throw error
    return (data ?? []).map(r => ({
      postazioneId: r.postazione_id as string,
      nome: (r.postazioni as { nome?: string } | null)?.nome ?? '—',
      membershipId: r.id as string,
      livello: r.livello as Livello,
    })).sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
  },
  // ── Personale (appartenenze) ──
  async getTurnisti(postazioneId: string): Promise<Turnista[]> {
    const { data, error } = await supabase.from('turnisti').select('id, utente_id, livello, created_at, utenti(nome, cognome, email)').eq('postazione_id', postazioneId)
    if (error) throw error
    return (data ?? []).map(normMembro)
  },
  async searchUtenti(query: string): Promise<Utente[]> {
    const q = query.trim()
    if (q.length < 3) return []
    const { data, error } = await supabase.from('utenti').select('id, nome, cognome, email').or(`nome.ilike.%${q}%,cognome.ilike.%${q}%`).order('cognome').limit(8)
    if (error) throw error
    return (data ?? []) as Utente[]
  },
  async addMembro(postazioneId: string, input: NuovoMembro): Promise<void> {
    const email = input.email.trim().toLowerCase()
    let utenteId = input.utenteId
    if (!utenteId) {
      const { data: ex } = await supabase.from('utenti').select('id').eq('email', email).maybeSingle()
      if (ex) utenteId = ex.id as string
      else {
        const { data: cr, error: e1 } = await supabase.from('utenti').insert({ nome: input.nome.trim(), cognome: input.cognome.trim(), email }).select('id').single()
        if (e1) { if (pgCode(e1) === '23505') throw new Error('Esiste già un utente con questa email.'); throw e1 }
        utenteId = cr.id as string
      }
    }
    if (input.livello === 'turnista') {
      const { data: gia } = await supabase.from('turnisti').select('postazioni(nome)').eq('utente_id', utenteId).eq('livello', 'turnista').maybeSingle()
      if (gia) throw new Error(`${input.nome} ${input.cognome} è già Turnista nella postazione “${(gia.postazioni as { nome?: string } | null)?.nome ?? '—'}”. Può essere Turnista in una sola postazione (Esterno in più).`)
    }
    const { error } = await supabase.from('turnisti').insert({ postazione_id: postazioneId, utente_id: utenteId, livello: input.livello })
    if (error) {
      if (pgCode(error) === '23505') throw new Error('Questa persona è già nel personale di questa postazione.')
      throw error
    }
  },
  async updateMembro(membershipId: string, utenteId: string, patch: Partial<NuovoMembro>): Promise<void> {
    const u: Record<string, unknown> = {}
    if (patch.nome    !== undefined) u.nome    = patch.nome.trim()
    if (patch.cognome !== undefined) u.cognome = patch.cognome.trim()
    if (patch.email   !== undefined) u.email   = patch.email.trim().toLowerCase()
    if (Object.keys(u).length) {
      const { error } = await supabase.from('utenti').update(u).eq('id', utenteId)
      if (error) { if (pgCode(error) === '23505') throw new Error('Esiste già un utente con questa email.'); throw error }
    }
    if (patch.livello !== undefined) {
      if (patch.livello === 'turnista') {
        const { data: gia } = await supabase.from('turnisti').select('postazioni(nome)').eq('utente_id', utenteId).eq('livello', 'turnista').neq('id', membershipId).maybeSingle()
        if (gia) throw new Error(`È già Turnista nella postazione “${(gia.postazioni as { nome?: string } | null)?.nome ?? '—'}”. Può esserlo in una sola.`)
      }
      const { error } = await supabase.from('turnisti').update({ livello: patch.livello }).eq('id', membershipId)
      if (error) throw error
    }
  },
  async removeMembro(membershipId: string): Promise<void> {
    const { error } = await supabase.from('turnisti').delete().eq('id', membershipId)
    if (error) throw error
  },

  // ── Versioni di configurazione ──
  async getVersioneMese(postazioneId: string, mese: string): Promise<ConfigVersione | null> {
    const { data, error } = await supabase.from('schema_versioni').select('*').eq('postazione_id', postazioneId)
    if (error) throw error
    return pickVersione((data ?? []) as ConfigVersione[], mese)
  },
  async getVersioni(postazioneId: string): Promise<ConfigVersione[]> {
    const { data, error } = await supabase.from('schema_versioni').select('*').eq('postazione_id', postazioneId).order('valido_da')
    if (error) throw error
    return (data ?? []) as ConfigVersione[]
  },
  async creaVersione(postazioneId: string, mese: string): Promise<ConfigVersione> {
    const { data, error } = await supabase.from('schema_versioni').insert({ valido_da: mese, valido_fino: null, postazione_id: postazioneId }).select().single()
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
  async getTurniMese(postazioneId: string, anno: number, mese: number): Promise<Turno[]> {
    const { first, last } = meseRange(anno, mese)
    const { data, error } = await supabase.from('turni').select('*').eq('postazione_id', postazioneId).gte('data', first).lte('data', last)
    if (error) throw error
    return (data ?? []) as Turno[]
  },
  async setAssegnazione(postazioneId: string, data: string, turnoSchemaId: string, slot: number, turnistaId: string | null): Promise<void> {
    if (turnistaId === null) {
      const { error } = await supabase.from('turni').delete().match({ data, turno_schema_id: turnoSchemaId, slot })
      if (error) throw error
    } else {
      const { error } = await supabase.from('turni').upsert({ data, turno_schema_id: turnoSchemaId, slot, turnista_id: turnistaId, postazione_id: postazioneId }, { onConflict: 'data,turno_schema_id,slot' })
      if (error) throw error
    }
  },

  // ── Regole turni fisse (settimanali, versionate) ──
  async getRegoleVersioneMese(postazioneId: string, mese: string): Promise<RegolaVersione | null> {
    const { data, error } = await supabase.from('regole_versioni').select('*').eq('postazione_id', postazioneId)
    if (error) throw error
    return pickVersione((data ?? []) as RegolaVersione[], mese)
  },
  async creaRegoleVersione(postazioneId: string, mese: string): Promise<RegolaVersione> {
    const { data, error } = await supabase.from('regole_versioni').insert({ valido_da: mese, valido_fino: null, postazione_id: postazioneId }).select().single()
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
  async getRegoleVersioni(postazioneId: string): Promise<RegolaVersione[]> {
    const { data, error } = await supabase.from('regole_versioni').select('*').eq('postazione_id', postazioneId).order('valido_da')
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
  async setCambioAuto(id: string, on: boolean): Promise<void> {
    const { error } = await supabase.from('regole_versioni').update({ cambio_auto: on }).eq('id', id)
    if (error) throw error
  },
  async getTurnistiMese(postazioneId: string, mese: string): Promise<string[]> {
    const { data, error } = await supabase.from('turnisti_mese').select('turnista_id').eq('postazione_id', postazioneId).eq('mese', mese)
    if (error) throw error
    return (data ?? []).map(r => r.turnista_id as string)
  },
  async addTurnistaMese(postazioneId: string, mese: string, turnistaId: string): Promise<void> {
    const { error } = await supabase.from('turnisti_mese').upsert({ mese, turnista_id: turnistaId, postazione_id: postazioneId }, { onConflict: 'mese,turnista_id' })
    if (error) throw error
  },
  async removeTurnistaMese(mese: string, turnistaId: string): Promise<void> {
    const { error } = await supabase.from('turnisti_mese').delete().match({ mese, turnista_id: turnistaId })
    if (error) throw error
  },

  // ── Desiderata / Indisponibilità ──
  async getDesiderataMese(postazioneId: string, anno: number, mese: number): Promise<Desiderata[]> {
    const { first, last } = meseRange(anno, mese)
    const { data, error } = await supabase.from('desiderata').select('*').eq('postazione_id', postazioneId).gte('data', first).lte('data', last)
    if (error) throw error
    return (data ?? []) as Desiderata[]
  },
  async setDesiderata(postazioneId: string, data: string, turnoSchemaId: string, turnistaId: string, tipo: TipoDesiderata | null): Promise<void> {
    if (tipo === null) {
      const { error } = await supabase.from('desiderata').delete().match({ data, turno_schema_id: turnoSchemaId, turnista_id: turnistaId })
      if (error) throw error
    } else {
      const { error } = await supabase.from('desiderata').upsert({ data, turno_schema_id: turnoSchemaId, turnista_id: turnistaId, tipo, postazione_id: postazioneId }, { onConflict: 'data,turno_schema_id,turnista_id' })
      if (error) throw error
    }
  },
  async getDesiderataFinestra(postazioneId: string, mese: string): Promise<DesiderataFinestra | null> {
    const { data, error } = await supabase.from('desiderata_finestra').select('*').eq('postazione_id', postazioneId).eq('mese', mese).maybeSingle()
    if (error) throw error
    return data ? { mese: data.mese as string, aperta_da: data.aperta_da as string | null, aperta_a: data.aperta_a as string | null } : null
  },
  async setDesiderataFinestra(postazioneId: string, mese: string, da: string | null, a: string | null): Promise<void> {
    const { error } = await supabase.from('desiderata_finestra').upsert({ mese, aperta_da: da, aperta_a: a, postazione_id: postazioneId }, { onConflict: 'postazione_id,mese' })
    if (error) throw error
  },
  async attivaDesiderata(postazioneId: string, mese: string): Promise<void> {
    const { error } = await supabase.from('desiderata_finestra').upsert({ mese, postazione_id: postazioneId }, { onConflict: 'postazione_id,mese', ignoreDuplicates: true })
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
const LS_TURNISTI_MESE    = 'gm_turnisti_mese'
const LS_DESIDERATA       = 'gm_desiderata'
const LS_DESIDERATA_FIN   = 'gm_desiderata_finestra'
const LS_POSTAZIONI       = 'gm_postazioni'
const LS_SEEDED           = 'gm_seeded_v5'
const DEV_POSTAZIONE      = 'dev-postazione-1'

function uid(): string { try { return crypto.randomUUID() } catch { return 'id-' + Math.random().toString(36).slice(2) } }
function read<T>(key: string, fallback: T): T { try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback } catch { return fallback } }
function writeLs<T>(key: string, val: T): void { try { localStorage.setItem(key, JSON.stringify(val)) } catch {} }
function meseCorrente(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

function ensureSeed(): void {
  if (read<boolean>(LS_SEEDED, false)) return
  const now = new Date().toISOString()
  const vid = uid()
  const pid = DEV_POSTAZIONE
  writeLs<Postazione[]>(LS_POSTAZIONI, [{ id: pid, nome: 'Guidonia - Palombara Giorno', attiva: true, created_at: now }])
  writeLs<(ConfigVersione & { postazione_id: string })[]>(LS_VERSIONI, [{ id: vid, valido_da: meseCorrente(), valido_fino: null, created_at: now, postazione_id: pid }])
  const sid = uid()
  writeLs<(Turnista & { postazione_id: string })[]>(LS_TURNISTI, [{ id: sid, utente_id: sid, nome: 'Stefano', cognome: 'Marabelli', email: ADMIN_EMAIL, livello: 'turnista', created_at: now, postazione_id: pid }])
  writeLs<TurnoSchema[]>(LS_SCHEMA, [
    { id: uid(), versione_id: vid, nome: 'Notte',  ora_inizio: '20:00', ora_fine: '08:00', n_turnisti: 1, ricorrenza: 'tutti',   giorni_custom: [], ordine: 10, created_at: now },
    { id: uid(), versione_id: vid, nome: 'Giorno', ora_inizio: '08:00', ora_fine: '20:00', n_turnisti: 1, ricorrenza: 'festivi', giorni_custom: [], ordine: 20, created_at: now },
  ])
  writeLs(LS_SEEDED, true)
}

type WithPost<T> = T & { postazione_id?: string }

const localStore = {
  async getPostazioni(): Promise<Postazione[]> {
    ensureSeed()
    return read<Postazione[]>(LS_POSTAZIONI, [])
  },
  async creaPostazione(nome: string): Promise<Postazione> {
    const p: Postazione = { id: uid(), nome: nome.trim(), attiva: true, created_at: new Date().toISOString() }
    writeLs(LS_POSTAZIONI, [...read<Postazione[]>(LS_POSTAZIONI, []), p])
    return p
  },
  async updatePostazione(id: string, patch: Partial<Pick<Postazione, 'nome' | 'attiva'>>): Promise<void> {
    writeLs(LS_POSTAZIONI, read<Postazione[]>(LS_POSTAZIONI, []).map(p => p.id === id ? { ...p, ...patch } : p))
  },
  async deletePostazione(id: string): Promise<void> {
    writeLs(LS_POSTAZIONI, read<Postazione[]>(LS_POSTAZIONI, []).filter(p => p.id !== id))
  },
  async getPostazioniGestite(_turnistaId: string): Promise<string[]> {
    ensureSeed()
    return read<Postazione[]>(LS_POSTAZIONI, []).map(p => p.id)
  },
  async getMiePostazioni(utenteId: string): Promise<MiaPostazione[]> {
    ensureSeed()
    const posts = read<Postazione[]>(LS_POSTAZIONI, [])
    return read<WithPost<Turnista>[]>(LS_TURNISTI, []).filter(t => (t.utente_id ?? t.id) === utenteId).map(t => {
      const pid = t.postazione_id ?? DEV_POSTAZIONE
      return { postazioneId: pid, nome: posts.find(p => p.id === pid)?.nome ?? '—', membershipId: t.id, livello: t.livello }
    }).sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
  },

  async getTurnisti(postazioneId: string): Promise<Turnista[]> {
    ensureSeed()
    return read<WithPost<Turnista>[]>(LS_TURNISTI, []).filter(t => (t.postazione_id ?? DEV_POSTAZIONE) === postazioneId).map(t => ({ ...t, utente_id: t.utente_id ?? t.id })).slice().sort(cmpTurnisti)
  },
  async searchUtenti(query: string): Promise<Utente[]> {
    const q = query.trim().toLowerCase()
    if (q.length < 3) return []
    const seen = new Set<string>(); const out: Utente[] = []
    for (const t of read<WithPost<Turnista>[]>(LS_TURNISTI, [])) {
      const key = t.email.toLowerCase()
      if (seen.has(key)) continue
      if (t.nome.toLowerCase().includes(q) || t.cognome.toLowerCase().includes(q)) { seen.add(key); out.push({ id: t.utente_id ?? t.id, nome: t.nome, cognome: t.cognome, email: t.email }) }
    }
    return out.sort(cmpTurnisti).slice(0, 8)
  },
  async addMembro(postazioneId: string, input: NuovoMembro): Promise<void> {
    ensureSeed()
    const list = read<WithPost<Turnista>[]>(LS_TURNISTI, [])
    const email = input.email.trim().toLowerCase()
    if (input.livello === 'turnista' && list.some(t => t.email.toLowerCase() === email && t.livello === 'turnista')) throw new Error(`${input.nome} ${input.cognome} è già Turnista in un'altra postazione. Può esserlo in una sola.`)
    if (list.some(t => t.email.toLowerCase() === email && (t.postazione_id ?? DEV_POSTAZIONE) === postazioneId)) throw new Error('Questa persona è già nel personale di questa postazione.')
    const utenteId = input.utenteId ?? list.find(t => t.email.toLowerCase() === email)?.utente_id ?? uid()
    list.push({ id: uid(), utente_id: utenteId, nome: input.nome.trim(), cognome: input.cognome.trim(), email, livello: input.livello, created_at: new Date().toISOString(), postazione_id: postazioneId })
    writeLs(LS_TURNISTI, list)
  },
  async updateMembro(membershipId: string, _utenteId: string, patch: Partial<NuovoMembro>): Promise<void> {
    const list = read<WithPost<Turnista>[]>(LS_TURNISTI, [])
    const target = list.find(t => t.id === membershipId)
    const uref = target ? (target.utente_id ?? target.id) : ''
    writeLs(LS_TURNISTI, list.map(t => {
      const sameUser = (t.utente_id ?? t.id) === uref
      return {
        ...t,
        ...(sameUser && patch.nome    !== undefined ? { nome: patch.nome.trim() } : {}),
        ...(sameUser && patch.cognome !== undefined ? { cognome: patch.cognome.trim() } : {}),
        ...(sameUser && patch.email   !== undefined ? { email: patch.email.trim().toLowerCase() } : {}),
        ...(t.id === membershipId && patch.livello !== undefined ? { livello: patch.livello } : {}),
      }
    }))
  },
  async removeMembro(membershipId: string): Promise<void> {
    writeLs(LS_TURNISTI, read<WithPost<Turnista>[]>(LS_TURNISTI, []).filter(t => t.id !== membershipId))
  },

  async getVersioneMese(postazioneId: string, mese: string): Promise<ConfigVersione | null> {
    ensureSeed()
    return pickVersione(read<WithPost<ConfigVersione>[]>(LS_VERSIONI, []).filter(v => (v.postazione_id ?? DEV_POSTAZIONE) === postazioneId), mese)
  },
  async getVersioni(postazioneId: string): Promise<ConfigVersione[]> {
    ensureSeed()
    return read<WithPost<ConfigVersione>[]>(LS_VERSIONI, []).filter(v => (v.postazione_id ?? DEV_POSTAZIONE) === postazioneId).slice().sort((a, b) => a.valido_da.localeCompare(b.valido_da))
  },
  async creaVersione(postazioneId: string, mese: string): Promise<ConfigVersione> {
    const v = { id: uid(), valido_da: mese, valido_fino: null, created_at: new Date().toISOString(), postazione_id: postazioneId }
    writeLs(LS_VERSIONI, [...read<WithPost<ConfigVersione>[]>(LS_VERSIONI, []), v])
    return v
  },
  async setValiditaVersione(id: string, validoFino: string | null): Promise<void> {
    writeLs(LS_VERSIONI, read<WithPost<ConfigVersione>[]>(LS_VERSIONI, []).map(v => v.id === id ? { ...v, valido_fino: validoFino } : v))
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

  async getTurniMese(postazioneId: string, anno: number, mese: number): Promise<Turno[]> {
    const { first, last } = meseRange(anno, mese)
    return read<WithPost<Turno>[]>(LS_TURNI, []).filter(t => (t.postazione_id ?? DEV_POSTAZIONE) === postazioneId && t.data >= first && t.data <= last)
  },
  async setAssegnazione(postazioneId: string, data: string, turnoSchemaId: string, slot: number, turnistaId: string | null): Promise<void> {
    const list = read<WithPost<Turno>[]>(LS_TURNI, []).filter(t => !(t.data === data && t.turno_schema_id === turnoSchemaId && t.slot === slot))
    if (turnistaId !== null) list.push({ id: uid(), data, turno_schema_id: turnoSchemaId, slot, turnista_id: turnistaId, created_at: new Date().toISOString(), postazione_id: postazioneId })
    writeLs(LS_TURNI, list)
  },

  async getRegoleVersioneMese(postazioneId: string, mese: string): Promise<RegolaVersione | null> {
    ensureSeed()
    return pickVersione(read<WithPost<RegolaVersione>[]>(LS_REGOLE_VERSIONI, []).filter(v => (v.postazione_id ?? DEV_POSTAZIONE) === postazioneId), mese)
  },
  async creaRegoleVersione(postazioneId: string, mese: string): Promise<RegolaVersione> {
    const v = { id: uid(), valido_da: mese, valido_fino: null, ore_min_settimana: null, cambio_auto: true, created_at: new Date().toISOString(), postazione_id: postazioneId }
    writeLs(LS_REGOLE_VERSIONI, [...read<WithPost<RegolaVersione>[]>(LS_REGOLE_VERSIONI, []), v])
    return v
  },
  async setValiditaRegoleVersione(id: string, validoFino: string | null): Promise<void> {
    writeLs(LS_REGOLE_VERSIONI, read<WithPost<RegolaVersione>[]>(LS_REGOLE_VERSIONI, []).map(v => v.id === id ? { ...v, valido_fino: validoFino } : v))
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
    writeLs(LS_VERSIONI, read<WithPost<ConfigVersione>[]>(LS_VERSIONI, []).filter(v => v.id !== id))
    writeLs(LS_SCHEMA, read<TurnoSchema[]>(LS_SCHEMA, []).filter(s => s.versione_id !== id))
  },
  async getRegoleVersioni(postazioneId: string): Promise<RegolaVersione[]> {
    ensureSeed()
    return read<WithPost<RegolaVersione>[]>(LS_REGOLE_VERSIONI, []).filter(v => (v.postazione_id ?? DEV_POSTAZIONE) === postazioneId).slice().sort((a, b) => a.valido_da.localeCompare(b.valido_da))
  },
  async deleteRegoleVersione(id: string): Promise<void> {
    writeLs(LS_REGOLE_VERSIONI, read<WithPost<RegolaVersione>[]>(LS_REGOLE_VERSIONI, []).filter(v => v.id !== id))
    writeLs(LS_REGOLE, read<RegolaTurno[]>(LS_REGOLE, []).filter(r => r.regola_versione_id !== id))
  },
  async setOreMinSettimana(id: string, ore: number | null): Promise<void> {
    writeLs(LS_REGOLE_VERSIONI, read<WithPost<RegolaVersione>[]>(LS_REGOLE_VERSIONI, []).map(v => v.id === id ? { ...v, ore_min_settimana: ore } : v))
  },
  async setCambioAuto(id: string, on: boolean): Promise<void> {
    writeLs(LS_REGOLE_VERSIONI, read<WithPost<RegolaVersione>[]>(LS_REGOLE_VERSIONI, []).map(v => v.id === id ? { ...v, cambio_auto: on } : v))
  },
  async getTurnistiMese(postazioneId: string, mese: string): Promise<string[]> {
    return read<{ mese: string; turnista_id: string; postazione_id?: string }[]>(LS_TURNISTI_MESE, []).filter(x => x.mese === mese && (x.postazione_id ?? DEV_POSTAZIONE) === postazioneId).map(x => x.turnista_id)
  },
  async addTurnistaMese(postazioneId: string, mese: string, turnistaId: string): Promise<void> {
    const l = read<{ mese: string; turnista_id: string; postazione_id?: string }[]>(LS_TURNISTI_MESE, [])
    if (!l.some(x => x.mese === mese && x.turnista_id === turnistaId)) { l.push({ mese, turnista_id: turnistaId, postazione_id: postazioneId }); writeLs(LS_TURNISTI_MESE, l) }
  },
  async removeTurnistaMese(mese: string, turnistaId: string): Promise<void> {
    writeLs(LS_TURNISTI_MESE, read<{ mese: string; turnista_id: string }[]>(LS_TURNISTI_MESE, []).filter(x => !(x.mese === mese && x.turnista_id === turnistaId)))
  },

  async getDesiderataMese(postazioneId: string, anno: number, mese: number): Promise<Desiderata[]> {
    const { first, last } = meseRange(anno, mese)
    return read<WithPost<Desiderata>[]>(LS_DESIDERATA, []).filter(d => (d.postazione_id ?? DEV_POSTAZIONE) === postazioneId && d.data >= first && d.data <= last)
  },
  async setDesiderata(postazioneId: string, data: string, turnoSchemaId: string, turnistaId: string, tipo: TipoDesiderata | null): Promise<void> {
    const list = read<WithPost<Desiderata>[]>(LS_DESIDERATA, []).filter(d => !(d.data === data && d.turno_schema_id === turnoSchemaId && d.turnista_id === turnistaId))
    if (tipo !== null) list.push({ id: uid(), data, turno_schema_id: turnoSchemaId, turnista_id: turnistaId, tipo, created_at: new Date().toISOString(), postazione_id: postazioneId })
    writeLs(LS_DESIDERATA, list)
  },
  async getDesiderataFinestra(postazioneId: string, mese: string): Promise<DesiderataFinestra | null> {
    return read<WithPost<DesiderataFinestra>[]>(LS_DESIDERATA_FIN, []).find(f => f.mese === mese && (f.postazione_id ?? DEV_POSTAZIONE) === postazioneId) ?? null
  },
  async setDesiderataFinestra(postazioneId: string, mese: string, da: string | null, a: string | null): Promise<void> {
    const list = read<WithPost<DesiderataFinestra>[]>(LS_DESIDERATA_FIN, []).filter(f => !(f.mese === mese && (f.postazione_id ?? DEV_POSTAZIONE) === postazioneId))
    list.push({ mese, aperta_da: da, aperta_a: a, postazione_id: postazioneId })
    writeLs(LS_DESIDERATA_FIN, list)
  },
  async attivaDesiderata(postazioneId: string, mese: string): Promise<void> {
    const list = read<WithPost<DesiderataFinestra>[]>(LS_DESIDERATA_FIN, [])
    if (!list.some(f => f.mese === mese && (f.postazione_id ?? DEV_POSTAZIONE) === postazioneId)) { list.push({ mese, aperta_da: null, aperta_a: null, postazione_id: postazioneId }); writeLs(LS_DESIDERATA_FIN, list) }
  },
}

// ────────────────────────────────────────────────────────────────
export const store = isSupabaseConfigured ? supaStore : localStore
export type { Ricorrenza }
