/**
 * store — data-layer dell'app (Supabase in produzione, localStorage in DEV).
 * MULTI-POSTAZIONE: ogni dato è filtrato per `postazioneId`. La configurazione
 * turni è VERSIONATA: ogni versione è valida per un intervallo di mesi.
 */

import { supabase, isSupabaseConfigured } from './supabase'
import { cmpTurnisti } from '../types'
import type { Turnista, TurnistaMese, TurnoSchema, ConfigVersione, RegolaVersione, RegolaTurno, RegolaTurnista, TipoRegolaTurnista, Turno, Livello, Ricorrenza, Desiderata, DesiderataFinestra, TipoDesiderata, Postazione, Utente, MiaPostazione, StatoCalendario, RichiestaTurno, StatoRichiesta, ImpaginazioneVersione, Foglio, FoglioTurno, UtenteImpersonabile, UtenteAdmin, UtenteAnagrafica, MembershipUtente, Supervisore, Notifica, CandidaturaAttesa, LogPostazione, BackupTurni, SnapshotTurno, Festivita, CambioTurno, TurnoPersona } from '../types'

// ── Notifiche: input per crearne una + mapping riga DB → Notifica ──
export interface AddNotifica { postazioneId: string; mese: string; tipo: string; messaggio: string; target?: string | null; perAdmin?: boolean; turnistaId?: string | null; autore?: string | null }
// nome dell'utente loggato: usato come autore di default quando non passato esplicitamente
let _autoreCorrente: string | null = null
export function setAutoreCorrente(n: string | null) { _autoreCorrente = n }
function mapNotifica(r: Record<string, unknown>): Notifica {
  return { id: r.id as string, postazioneId: r.postazione_id as string, mese: r.mese as string, tipo: r.tipo as string, messaggio: r.messaggio as string, target: (r.target as string | null) ?? null, perAdmin: !!r.per_admin, turnistaId: (r.turnista_id as string | null) ?? null, autore: (r.autore as string | null) ?? null, letta: !!r.letta, created_at: r.created_at as string }
}

const RANK_LIVELLO: Record<string, number> = { responsabile: 3, turnista: 2, esterno: 1 }
// Potere complessivo di un utente nell'Anagrafica (dal più al meno potente), per l'ordinamento.
const RANK_RUOLO: Record<string, number> = { admin: 5, supervisore: 4, responsabile: 3, turnista: 2, esterno: 1, '—': 0 }
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
  // La versione che "governa" il mese = quella col valido_da più recente ≤ mese:
  // un periodo più recente SOVRASCRIVE i precedenti dal suo inizio in poi.
  const gov = versioni.filter(v => v.valido_da <= mese).sort((a, b) => b.valido_da.localeCompare(a.valido_da))[0]
  if (!gov) return null
  // Se la sua validità è già scaduta prima del mese → scoperto: NON si torna a un
  // periodo più vecchio ancora "valido" (il più recente ha la precedenza assoluta).
  if (gov.valido_fino != null && mese > gov.valido_fino) return null
  return gov
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

// ═══ Archivio mese: lettura-da-JSON per i mesi finalizzati+archiviati (Fase 1·2) ═══
// Un mese con finalizzazioni.archiviato=true ha i dati SOLO nel JSON di setup_backup;
// le letture li ricostruiscono da lì così calendario/PDF/conteggi restano identici.
// ⚠️ REGOLA: ogni tabella nuova per-mese va aggiunta anche qui e nell'archivio/ripristino.
type SnapMese = Record<string, any>   // eslint-disable-line @typescript-eslint/no-explicit-any
const _archCache = new Map<string, SnapMese | null>()   // `${pid}|${mese}` → snapshot | null (non archiviato)
const _archPerVersione = new Map<string, SnapMese>()     // versione_id (schema/impag/regole) → snapshot
export function clearArchivioCache() { _archCache.clear(); _archPerVersione.clear() }
function _registraVersioni(s: SnapMese) {
  for (const v of [s.config_versione, s.impag_versione, s.regole_versione]) if (v && v.id) _archPerVersione.set(v.id as string, s)
}
async function _archSupa(pid: string, mese: string): Promise<SnapMese | null> {
  const key = pid + '|' + mese
  if (_archCache.has(key)) return _archCache.get(key) ?? null
  const { data } = await supabase.rpc('archivio_snapshot', { p_postazione: pid, p_mese: mese })
  const snap = (data as SnapMese) ?? null
  _archCache.set(key, snap)
  if (snap) _registraVersioni(snap)
  return snap
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
  async getPostazioniSupervisione(utenteId: string): Promise<string[]> {
    const { data, error } = await supabase.from('supervisore_postazioni').select('postazione_id').eq('utente_id', utenteId)
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
    const arch = await _archSupa(postazioneId, mese)
    if (arch) return (arch.config_versione as ConfigVersione) ?? null
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
  async setValidoDaVersione(id: string, validoDa: string): Promise<void> {
    const { error } = await supabase.from('schema_versioni').update({ valido_da: validoDa }).eq('id', id)
    if (error) throw error
  },

  // ── Attivazioni mese (procedura sequenziale: passo 1..5 per mese) ──
  async getAttivazioni(postazioneId: string, mese: string): Promise<number[]> {
    const { data, error } = await supabase.from('attivazioni_mese').select('passo').eq('postazione_id', postazioneId).eq('mese', mese)
    if (error) throw error
    return (data ?? []).map(r => r.passo as number)
  },
  async getMesiAttivati(postazioneId: string, passo: number): Promise<string[]> {
    const { data, error } = await supabase.from('attivazioni_mese').select('mese').eq('postazione_id', postazioneId).eq('passo', passo).order('mese')
    if (error) throw error
    return (data ?? []).map(r => r.mese as string)
  },
  async attivaPasso(postazioneId: string, mese: string, passo: number, autore?: string | null): Promise<void> {
    // ignoreDuplicates: se il passo è già attivo non serve toccare la riga (resta l'autore
    // della PRIMA attivazione) — e la ri-conferma non può fallire per RLS/duplicati.
    const { error } = await supabase.from('attivazioni_mese').upsert({ postazione_id: postazioneId, mese, passo, autore: autore ?? _autoreCorrente }, { onConflict: 'postazione_id,mese,passo', ignoreDuplicates: true })
    if (error) throw error
  },
  async disattivaMese(postazioneId: string, mese: string): Promise<void> {
    const { error } = await supabase.from('attivazioni_mese').delete().eq('postazione_id', postazioneId).eq('mese', mese)
    if (error) throw error
  },
  // Cancella TUTTO il setup del mese (snapshot JSON unico prima, poi wipe + re-ancoraggio versioni condivise)
  async cancellaMese(postazioneId: string, mese: string, autore?: string | null): Promise<void> {
    const { error } = await supabase.rpc('cancella_mese', { p_postazione: postazioneId, p_mese: mese, p_autore: autore ?? _autoreCorrente })
    if (error) throw error
    clearArchivioCache()
  },
  // info sull'eventuale snapshot del mese (per mostrare il pulsante Ripristina)
  async getSetupBackup(postazioneId: string, mese: string): Promise<{ id: string; createdAt: string; autore: string | null } | null> {
    const { data, error } = await supabase.from('setup_backup').select('id, created_at, autore').eq('postazione_id', postazioneId).eq('mese', mese).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    return data ? { id: data.id as string, createdAt: data.created_at as string, autore: (data.autore as string | null) ?? null } : null
  },
  async ripristinaMese(postazioneId: string, mese: string): Promise<void> {
    const { error } = await supabase.rpc('ripristina_mese', { p_postazione: postazioneId, p_mese: mese })
    if (error) throw error
  },
  // ultima config (la più recente PRIMA del mese) che abbia almeno un turno → sorgente per la copia
  async ultimaConfigConTurni(postazioneId: string, primaDelMese: string): Promise<ConfigVersione | null> {
    const { data: vers, error } = await supabase.from('schema_versioni').select('*').eq('postazione_id', postazioneId).lt('valido_da', primaDelMese).order('valido_da', { ascending: false })
    if (error) throw error
    for (const v of (vers ?? []) as ConfigVersione[]) {
      const { count } = await supabase.from('schema_turni').select('id', { count: 'exact', head: true }).eq('versione_id', v.id)
      if ((count ?? 0) > 0) return v
    }
    return null
  },

  // ── Turni dello schema (per versione) ──
  async getSchemaVersione(versioneId: string): Promise<TurnoSchema[]> {
    const arch = _archPerVersione.get(versioneId)
    if (arch) return ((arch.config_turni as Record<string, unknown>[]) ?? []).map(normSchema)
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

  // ── Festività / Superfestivi ──
  async getNazione(postazioneId: string): Promise<string> {
    const { data, error } = await supabase.from('postazioni').select('nazione').eq('id', postazioneId).maybeSingle()
    if (error) throw error
    return ((data?.nazione as string | null) ?? 'IT')
  },
  async setNazione(postazioneId: string, nazione: string): Promise<void> {
    const { error } = await supabase.from('postazioni').update({ nazione }).eq('id', postazioneId)
    if (error) throw error
  },
  async getFestivitaCustom(postazioneId: string): Promise<Festivita[]> {
    const { data, error } = await supabase.from('festivita_custom').select('id, data, descrizione').eq('postazione_id', postazioneId).order('data')
    if (error) throw error
    return (data ?? []).map(r => ({ id: r.id as string, data: r.data as string, descrizione: r.descrizione as string }))
  },
  async addFestivitaCustom(postazioneId: string, data: string, descrizione: string): Promise<void> {
    const { error } = await supabase.from('festivita_custom').insert({ postazione_id: postazioneId, data, descrizione })
    if (error) throw error
  },
  async removeFestivitaCustom(id: string): Promise<void> {
    const { error } = await supabase.from('festivita_custom').delete().eq('id', id)
    if (error) throw error
  },
  async getFestivitaSuper(postazioneId: string): Promise<{ data: string; superfestivo: boolean }[]> {
    const { data, error } = await supabase.from('festivita_super').select('data, super').eq('postazione_id', postazioneId)
    if (error) throw error
    return (data ?? []).map(r => ({ data: r.data as string, superfestivo: !!r.super }))
  },
  async setFestivitaSuper(postazioneId: string, data: string, superfestivo: boolean): Promise<void> {
    const { error } = await supabase.from('festivita_super').upsert({ postazione_id: postazioneId, data, super: superfestivo }, { onConflict: 'postazione_id,data' })
    if (error) throw error
  },
  async getSuperfestivoTurni(postazioneId: string, mese: string): Promise<{ data: string; turnoSchemaId: string }[]> {
    const arch = await _archSupa(postazioneId, mese)
    if (arch) return ((arch.superfestivo_turni as { data: string; turno_schema_id: string }[]) ?? []).map(r => ({ data: r.data, turnoSchemaId: r.turno_schema_id }))
    const { data, error } = await supabase.from('superfestivo_turni').select('data, turno_schema_id').eq('postazione_id', postazioneId).eq('mese', mese)
    if (error) throw error
    return (data ?? []).map(r => ({ data: r.data as string, turnoSchemaId: r.turno_schema_id as string }))
  },
  // NOMI dei turni abbinati l'ultima volta allo stesso giorno-mese (es. '08-15') in un mese
  // precedente: per PRECOMPILARE l'abbinamento del superfestivo (mappatura per nome).
  async getSuperfestivoTurniPrecedente(postazioneId: string, meseGiorno: string, primaDelMese: string): Promise<string[]> {
    const { data, error } = await supabase.from('superfestivo_turni').select('mese, data, turno_schema_id').eq('postazione_id', postazioneId).lt('mese', primaDelMese).order('mese', { ascending: false })
    if (error) throw error
    const match = (data ?? []).filter(r => (r.data as string).slice(5) === meseGiorno)
    if (!match.length) return []
    const best = match.filter(r => r.mese === match[0].mese)
    const { data: turni, error: e2 } = await supabase.from('schema_turni').select('nome').in('id', best.map(r => r.turno_schema_id))
    if (e2) throw e2
    return (turni ?? []).map(t => t.nome as string)
  },

  // ── Finalizzazione (blocco del mese) ──
  async getFinalizzazione(postazioneId: string, mese: string): Promise<{ autore: string | null; createdAt: string } | null> {
    const { data, error } = await supabase.from('finalizzazioni').select('autore, created_at').eq('postazione_id', postazioneId).eq('mese', mese).maybeSingle()
    if (error) throw error
    return data ? { autore: (data.autore as string | null) ?? null, createdAt: data.created_at as string } : null
  },
  // Mesi con un calendario (turni o archiviati) + se sono finalizzati — per promemoria home e datepicker
  async getMesiPanoramica(postazioneId: string): Promise<{ mese: string; finalizzato: boolean }[]> {
    const { data, error } = await supabase.rpc('mesi_panoramica', { p_postazione: postazioneId })
    if (error) throw error
    return ((data ?? []) as { mese: string; finalizzato: boolean }[]).map(r => ({ mese: r.mese, finalizzato: !!r.finalizzato }))
  },
  async finalizzaMese(postazioneId: string, mese: string, autore?: string | null): Promise<void> {
    const { error } = await supabase.from('finalizzazioni').upsert({ postazione_id: postazioneId, mese, autore: autore ?? _autoreCorrente }, { onConflict: 'postazione_id,mese' })
    if (error) throw error
    clearArchivioCache()
  },
  async sbloccaMese(postazioneId: string, mese: string): Promise<void> {
    const { error } = await supabase.from('finalizzazioni').delete().eq('postazione_id', postazioneId).eq('mese', mese)
    if (error) throw error
    clearArchivioCache()
  },

  // ── Tema interfaccia (salvato per utente) ──
  async setMioTema(tema: string): Promise<void> {
    const { error } = await supabase.rpc('set_mio_tema', { p_tema: tema })
    if (error) throw error
  },

  // ── Impostazioni di postazione: email mittente (per l'invio del calendario) ──
  async getEmailMittente(postazioneId: string): Promise<string> {
    const { data, error } = await supabase.from('postazione_impostazioni').select('email_mittente').eq('postazione_id', postazioneId).maybeSingle()
    if (error) throw error
    return ((data?.email_mittente as string | null) ?? '')
  },
  async setEmailMittente(postazioneId: string, email: string): Promise<void> {
    const { error } = await supabase.from('postazione_impostazioni').upsert({ postazione_id: postazioneId, email_mittente: email || null, updated_at: new Date().toISOString() }, { onConflict: 'postazione_id' })
    if (error) throw error
  },

  // ── Cambi turno (cessione con eventuale approvazione) ──
  async getCambiMese(postazioneId: string, mese: string): Promise<CambioTurno[]> {
    const { data, error } = await supabase.from('cambi_turno').select('*').eq('postazione_id', postazioneId).eq('mese', mese).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as CambioTurno[]
  },
  async getCambiPendenti(postazioneId: string): Promise<CambioTurno[]> {
    const { data, error } = await supabase.from('cambi_turno').select('*').eq('postazione_id', postazioneId).eq('stato', 'in_attesa').order('created_at')
    if (error) throw error
    return (data ?? []) as CambioTurno[]
  },
  async richiediCambio(postazioneId: string, data: string, turnoSchemaId: string, slot: number, daTurnista: string, aTurnista: string, forzato: boolean, descrizione: string, autore?: string | null, soloApprovazione?: boolean): Promise<{ auto: boolean }> {
    const { data: out, error } = await supabase.rpc('crea_cambio_turno', {
      p_postazione: postazioneId, p_data: data, p_turno: turnoSchemaId, p_slot: slot,
      p_da: daTurnista, p_a: aTurnista, p_forzato: forzato, p_descrizione: descrizione, p_autore: autore ?? _autoreCorrente,
      p_solo_approvazione: !!soloApprovazione,
    })
    if (error) throw error
    return { auto: !!(out as { auto?: boolean } | null)?.auto }
  },
  async decidiCambio(cambioId: string, approva: boolean, autore?: string | null): Promise<void> {
    const { error } = await supabase.rpc('decidi_cambio_turno', { p_cambio: cambioId, p_approva: approva, p_autore: autore ?? _autoreCorrente })
    if (error) throw error
  },
  // Tutti i turni (slot ≥ 0) di una PERSONA (per utente, su ogni postazione) nella data
  // indicata e nel giorno precedente (per intercettare le notti che sconfinano).
  async getTurniPersonaData(utenteId: string, data: string): Promise<TurnoPersona[]> {
    const { data: membs, error: e1 } = await supabase.from('turnisti').select('id, postazione_id').eq('utente_id', utenteId)
    if (e1) throw e1
    const ids = (membs ?? []).map(m => m.id as string)
    if (!ids.length) return []
    const [y, m, d] = data.split('-').map(Number)
    const prima = new Date(y, m - 1, d - 1)
    const primaIso = `${prima.getFullYear()}-${String(prima.getMonth() + 1).padStart(2, '0')}-${String(prima.getDate()).padStart(2, '0')}`
    const { data: rows, error: e2 } = await supabase.from('turni').select('data, slot, turno_schema_id, postazione_id').in('turnista_id', ids).in('data', [data, primaIso]).gte('slot', 0)
    if (e2) throw e2
    if (!rows?.length) return []
    const turnoIds = [...new Set(rows.map(r => r.turno_schema_id as string))]
    const postIds = [...new Set(rows.map(r => r.postazione_id as string))]
    const [{ data: schemi }, { data: posts }] = await Promise.all([
      supabase.from('schema_turni').select('id, nome, ora_inizio, ora_fine').in('id', turnoIds),
      supabase.from('postazioni').select('id, nome').in('id', postIds),
    ])
    const sById = new Map((schemi ?? []).map(s => [s.id as string, s]))
    const pById = new Map((posts ?? []).map(p => [p.id as string, p.nome as string]))
    return rows.map(r => {
      const s = sById.get(r.turno_schema_id as string)
      return { data: r.data as string, ora_inizio: (s?.ora_inizio as string) ?? '00:00', ora_fine: (s?.ora_fine as string) ?? '00:00', turnoNome: (s?.nome as string) ?? 'Turno', postazioneNome: pById.get(r.postazione_id as string) ?? '—' }
    })
  },
  async setSuperfestivoTurni(postazioneId: string, mese: string, data: string, turnoSchemaIds: string[]): Promise<void> {
    const del = await supabase.from('superfestivo_turni').delete().eq('postazione_id', postazioneId).eq('mese', mese).eq('data', data)
    if (del.error) throw del.error
    if (turnoSchemaIds.length) {
      const { error } = await supabase.from('superfestivo_turni').insert(turnoSchemaIds.map(tid => ({ postazione_id: postazioneId, mese, data, turno_schema_id: tid })))
      if (error) throw error
    }
  },

  // ── Turni assegnati ──
  async getTurniMese(postazioneId: string, anno: number, mese: number): Promise<Turno[]> {
    const arch = await _archSupa(postazioneId, `${anno}-${String(mese).padStart(2, '0')}`)
    if (arch) return (arch.turni as Turno[]) ?? []
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

  // ── Versioni/backup del calendario (snapshot completo per ripristino) ──
  async snapshotTurni(postazioneId: string, mese: string, motivo: string, autore?: string | null): Promise<void> {
    const { error } = await supabase.rpc('snapshot_turni', { p_postazione: postazioneId, p_mese: mese, p_motivo: motivo, p_autore: autore ?? _autoreCorrente })
    if (error) console.warn('[Backup] snapshot ignorato:', error.message)
  },
  async getBackupTurni(postazioneId: string, mese: string): Promise<BackupTurni[]> {
    const { data, error } = await supabase.from('turni_backup').select('id, mese, motivo, autore, n_turni, created_at')
      .eq('postazione_id', postazioneId).eq('mese', mese).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string, mese: r.mese as string, motivo: (r.motivo as string | null) ?? null,
      autore: (r.autore as string | null) ?? null, nTurni: (r.n_turni as number) ?? 0, createdAt: r.created_at as string,
    }))
  },
  // ritorna il contenuto completo (assegnazioni) di una versione, per caricarlo nella griglia
  async getBackupSnapshot(backupId: string): Promise<SnapshotTurno[]> {
    const { data, error } = await supabase.from('turni_backup').select('snapshot').eq('id', backupId).single()
    if (error) throw error
    return (data?.snapshot as SnapshotTurno[] | null) ?? []
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
  // ultime regole (più recenti PRIMA del mese) che abbiano almeno una regola → sorgente per la copia
  async ultimaRegoleConContenuto(postazioneId: string, primaDelMese: string): Promise<RegolaVersione | null> {
    const { data: vers, error } = await supabase.from('regole_versioni').select('*').eq('postazione_id', postazioneId).lt('valido_da', primaDelMese).order('valido_da', { ascending: false })
    if (error) throw error
    for (const v of (vers ?? []) as RegolaVersione[]) {
      const { count } = await supabase.from('regole_turni').select('id', { count: 'exact', head: true }).eq('regola_versione_id', v.id)
      if ((count ?? 0) > 0) return v
    }
    return null
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
  // ── Regole speciali per turnista (limiti personali, legate alla versione regole) ──
  async getRegoleTurnista(regolaVersioneId: string): Promise<RegolaTurnista[]> {
    const { data, error } = await supabase.from('regole_turnista').select('*').eq('regola_versione_id', regolaVersioneId)
    if (error) throw error
    return (data ?? []) as RegolaTurnista[]
  },
  async setRegolaTurnista(regolaVersioneId: string, turnistaId: string, tipo: TipoRegolaTurnista, valore: number): Promise<void> {
    const { error } = await supabase.from('regole_turnista').upsert({ regola_versione_id: regolaVersioneId, turnista_id: turnistaId, tipo, valore }, { onConflict: 'regola_versione_id,turnista_id,tipo' })
    if (error) throw error
  },
  async deleteRegoleTurnistaVersione(regolaVersioneId: string): Promise<void> {
    const { error } = await supabase.from('regole_turnista').delete().eq('regola_versione_id', regolaVersioneId)
    if (error) throw error
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
  async setOreMaxSettimana(id: string, ore: number | null): Promise<void> {
    const { error } = await supabase.from('regole_versioni').update({ ore_max_settimana: ore }).eq('id', id)
    if (error) throw error
  },
  async setOreMaxConsecutive(id: string, ore: number | null): Promise<void> {
    const { error } = await supabase.from('regole_versioni').update({ ore_max_consecutive: ore }).eq('id', id)
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
  async addTurnistaMese(postazioneId: string, mese: string, turnistaId: string, livello?: Livello): Promise<void> {
    const row: Record<string, unknown> = { mese, turnista_id: turnistaId, postazione_id: postazioneId }
    if (livello) row.livello = livello
    const { error } = await supabase.from('turnisti_mese').upsert(row, { onConflict: 'mese,turnista_id' })
    if (error) throw error
  },
  // personale "del mese" con ruolo congelato (per-mese)
  async getPersonaleMese(postazioneId: string, mese: string): Promise<TurnistaMese[]> {
    const arch = await _archSupa(postazioneId, mese)
    if (arch) return ((arch.turnisti_mese as { turnista_id: string; livello?: string }[]) ?? []).map(r => ({ turnista_id: r.turnista_id, livello: (r.livello ?? 'turnista') as Livello }))
    const { data, error } = await supabase.from('turnisti_mese').select('turnista_id, livello').eq('postazione_id', postazioneId).eq('mese', mese)
    if (error) throw error
    return (data ?? []).map(r => ({ turnista_id: r.turnista_id as string, livello: ((r.livello as string) ?? 'turnista') as Livello }))
  },
  async setLivelloMese(_postazioneId: string, mese: string, turnistaId: string, livello: Livello): Promise<void> {
    const { error } = await supabase.from('turnisti_mese').update({ livello }).match({ mese, turnista_id: turnistaId })
    if (error) throw error
  },
  // true se l'appartenenza ha già storico (turni, desiderata o personale di qualche mese):
  // in tal caso la cancellazione anagrafica va bloccata per non lasciare buchi nei mesi passati.
  // ultimo mese (più recente PRIMA del mese dato) che ha personale → sorgente per la copia
  async ultimoMesePersonale(postazioneId: string, primaDelMese: string): Promise<string | null> {
    const { data, error } = await supabase.from('turnisti_mese').select('mese').eq('postazione_id', postazioneId).lt('mese', primaDelMese).order('mese', { ascending: false }).limit(1)
    if (error) throw error
    return data && data[0] ? (data[0].mese as string) : null
  },
  async turnistaHaStorico(turnistaId: string): Promise<boolean> {
    const t = await supabase.from('turni').select('id', { count: 'exact', head: true }).eq('turnista_id', turnistaId)
    if ((t.count ?? 0) > 0) return true
    const d = await supabase.from('desiderata').select('id', { count: 'exact', head: true }).eq('turnista_id', turnistaId)
    if ((d.count ?? 0) > 0) return true
    const m = await supabase.from('turnisti_mese').select('turnista_id', { count: 'exact', head: true }).eq('turnista_id', turnistaId)
    return (m.count ?? 0) > 0
  },
  async removeTurnistaMese(mese: string, turnistaId: string): Promise<void> {
    const { error } = await supabase.from('turnisti_mese').delete().match({ mese, turnista_id: turnistaId })
    if (error) throw error
  },

  // ── Desiderata / Indisponibilità ──
  async getDesiderataMese(postazioneId: string, anno: number, mese: number): Promise<Desiderata[]> {
    const arch = await _archSupa(postazioneId, `${anno}-${String(mese).padStart(2, '0')}`)
    if (arch) return (arch.desiderata as Desiderata[]) ?? []
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
    const arch = await _archSupa(postazioneId, mese)
    if (arch) { const df = arch.desiderata_finestra as { mese: string; aperta_da: string | null; aperta_a: string | null; pubbliche: boolean } | null; return df ? { mese: df.mese, aperta_da: df.aperta_da, aperta_a: df.aperta_a, pubbliche: !!df.pubbliche } : null }
    const { data, error } = await supabase.from('desiderata_finestra').select('*').eq('postazione_id', postazioneId).eq('mese', mese).maybeSingle()
    if (error) throw error
    return data ? { mese: data.mese as string, aperta_da: data.aperta_da as string | null, aperta_a: data.aperta_a as string | null, pubbliche: !!data.pubbliche } : null
  },
  async setDesiderataFinestra(postazioneId: string, mese: string, da: string | null, a: string | null): Promise<void> {
    const { error } = await supabase.from('desiderata_finestra').upsert({ mese, aperta_da: da, aperta_a: a, postazione_id: postazioneId }, { onConflict: 'postazione_id,mese' })
    if (error) throw error
  },
  async setDesiderataPubbliche(postazioneId: string, mese: string, pubbliche: boolean): Promise<void> {
    const { error } = await supabase.from('desiderata_finestra').upsert({ mese, pubbliche, postazione_id: postazioneId }, { onConflict: 'postazione_id,mese' })
    if (error) throw error
  },
  async attivaDesiderata(postazioneId: string, mese: string): Promise<void> {
    const { error } = await supabase.from('desiderata_finestra').upsert({ mese, postazione_id: postazioneId }, { onConflict: 'postazione_id,mese', ignoreDuplicates: true })
    if (error) throw error
  },

  // ── Stato calendario turni (non_pubblicato | pubblicato | pianificazione) ──
  async getStatoCalendario(postazioneId: string, mese: string): Promise<StatoCalendario> {
    const arch = await _archSupa(postazioneId, mese)
    if (arch) return ((arch.turni_stato as { stato?: string } | null)?.stato as StatoCalendario) ?? 'pubblicato'
    const { data, error } = await supabase.from('turni_stato').select('stato').eq('postazione_id', postazioneId).eq('mese', mese).maybeSingle()
    if (error) throw error
    return (data?.stato as StatoCalendario) ?? 'non_pubblicato'
  },
  async setStatoCalendario(postazioneId: string, mese: string, stato: StatoCalendario): Promise<void> {
    const { error } = await supabase.from('turni_stato').upsert({ postazione_id: postazioneId, mese, stato, updated_at: new Date().toISOString() }, { onConflict: 'postazione_id,mese' })
    if (error) throw error
  },

  // ── Richieste di turno (candidature in Modalità Pianificazione) ──
  //  getRichiesteMese restituisce solo quelle IN ATTESA (le altre sono già evase).
  async getRichiesteMese(postazioneId: string, anno: number, mese: number): Promise<RichiestaTurno[]> {
    const { first, last } = meseRange(anno, mese)
    const { data, error } = await supabase.from('richieste_turno').select('*').eq('postazione_id', postazioneId).eq('stato', 'in_attesa').gte('data', first).lte('data', last).order('data', { ascending: true }).order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as RichiestaTurno[]
  },
  async addRichiesta(postazioneId: string, data: string, turnoSchemaId: string, turnistaId: string): Promise<void> {
    // ri-proporsi su uno slot già rifiutato lo riporta "in attesa"
    const { error } = await supabase.from('richieste_turno').upsert({ postazione_id: postazioneId, data, turno_schema_id: turnoSchemaId, turnista_id: turnistaId, stato: 'in_attesa' }, { onConflict: 'data,turno_schema_id,turnista_id' })
    if (error) throw error
  },
  async setRichiestaStato(id: string, stato: StatoRichiesta): Promise<void> {
    const { error } = await supabase.from('richieste_turno').update({ stato }).eq('id', id)
    if (error) throw error
  },
  // Stato attuale della richiesta di un candidato per uno slot (per l'annullamento).
  async getRichiestaCorrente(postazioneId: string, data: string, turnoSchemaId: string, turnistaId: string): Promise<RichiestaTurno | null> {
    const { data: rows, error } = await supabase.from('richieste_turno').select('*').eq('postazione_id', postazioneId).eq('data', data).eq('turno_schema_id', turnoSchemaId).eq('turnista_id', turnistaId).limit(1)
    if (error) throw error
    return (rows && rows[0] ? (rows[0] as RichiestaTurno) : null)
  },
  async removeRichiesta(id: string): Promise<void> {
    const { error } = await supabase.from('richieste_turno').delete().eq('id', id)
    if (error) throw error
  },

  // ── Intervallo di mesi con "qualcosa da vedere" (per limitare la navigazione pubblica) ──
  async getMesiConContenuto(postazioneId: string): Promise<{ min: string | null; max: string | null }> {
    const [ts, df] = await Promise.all([
      supabase.from('turni_stato').select('mese').eq('postazione_id', postazioneId).neq('stato', 'non_pubblicato'),
      supabase.from('desiderata_finestra').select('mese').eq('postazione_id', postazioneId).not('aperta_a', 'is', null),
    ])
    if (ts.error) throw ts.error
    if (df.error) throw df.error
    const mesi = [...(ts.data ?? []), ...(df.data ?? [])].map(r => r.mese as string)
    if (!mesi.length) return { min: null, max: null }
    mesi.sort()
    return { min: mesi[0], max: mesi[mesi.length - 1] }
  },

  // ── Impaginazione (versioni + fogli + turni dei fogli) ──
  async getImpaginazioneVersioneMese(postazioneId: string, mese: string): Promise<ImpaginazioneVersione | null> {
    const arch = await _archSupa(postazioneId, mese)
    if (arch) return (arch.impag_versione as ImpaginazioneVersione) ?? null
    const { data, error } = await supabase.from('impaginazione_versioni').select('*').eq('postazione_id', postazioneId)
    if (error) throw error
    return pickVersione((data ?? []) as ImpaginazioneVersione[], mese)
  },
  async getImpaginazioneVersioni(postazioneId: string): Promise<ImpaginazioneVersione[]> {
    const { data, error } = await supabase.from('impaginazione_versioni').select('*').eq('postazione_id', postazioneId).order('valido_da')
    if (error) throw error
    return (data ?? []) as ImpaginazioneVersione[]
  },
  async creaImpaginazioneVersione(postazioneId: string, mese: string): Promise<ImpaginazioneVersione> {
    const { data, error } = await supabase.from('impaginazione_versioni').insert({ valido_da: mese, valido_fino: null, postazione_id: postazioneId }).select().single()
    if (error) throw error
    return data as ImpaginazioneVersione
  },
  async setValiditaImpaginazioneVersione(id: string, validoFino: string | null): Promise<void> {
    const { error } = await supabase.from('impaginazione_versioni').update({ valido_fino: validoFino }).eq('id', id)
    if (error) throw error
  },
  async setValidoDaImpaginazioneVersione(id: string, validoDa: string): Promise<void> {
    const { error } = await supabase.from('impaginazione_versioni').update({ valido_da: validoDa }).eq('id', id)
    if (error) throw error
  },
  // ultima impaginazione (più recente PRIMA del mese) con almeno un foglio → sorgente per la copia
  async ultimaImpaginazioneConContenuto(postazioneId: string, primaDelMese: string): Promise<ImpaginazioneVersione | null> {
    const { data: vers, error } = await supabase.from('impaginazione_versioni').select('*').eq('postazione_id', postazioneId).lt('valido_da', primaDelMese).order('valido_da', { ascending: false })
    if (error) throw error
    for (const v of (vers ?? []) as ImpaginazioneVersione[]) {
      const { count } = await supabase.from('fogli').select('id', { count: 'exact', head: true }).eq('versione_id', v.id)
      if ((count ?? 0) > 0) return v
    }
    return null
  },
  async deleteImpaginazioneVersione(id: string): Promise<void> {
    const { error } = await supabase.from('impaginazione_versioni').delete().eq('id', id)
    if (error) throw error
  },
  async getFogli(versioneId: string): Promise<Foglio[]> {
    const arch = _archPerVersione.get(versioneId)
    if (arch) return [...((arch.fogli as Foglio[]) ?? [])].sort((a, b) => a.ordine - b.ordine)
    const { data, error } = await supabase.from('fogli').select('*').eq('versione_id', versioneId).order('ordine')
    if (error) throw error
    return (data ?? []) as Foglio[]
  },
  async addFoglio(versioneId: string, nome: string): Promise<Foglio> {
    const { data: maxRows } = await supabase.from('fogli').select('ordine').eq('versione_id', versioneId).order('ordine', { ascending: false }).limit(1)
    const ordine = (maxRows && maxRows.length) ? (maxRows[0].ordine as number) + 10 : 10
    const { data, error } = await supabase.from('fogli').insert({ versione_id: versioneId, nome, ordine }).select().single()
    if (error) throw error
    return data as Foglio
  },
  async renameFoglio(id: string, nome: string): Promise<void> {
    const { error } = await supabase.from('fogli').update({ nome }).eq('id', id)
    if (error) throw error
  },
  async deleteFoglio(id: string): Promise<void> {
    const { error } = await supabase.from('fogli').delete().eq('id', id)
    if (error) throw error
  },
  async getFoglioTurni(versioneId: string): Promise<FoglioTurno[]> {
    const arch = _archPerVersione.get(versioneId)
    if (arch) return (arch.foglio_turni as FoglioTurno[]) ?? []
    const { data, error } = await supabase.from('foglio_turni').select('*').eq('versione_id', versioneId)
    if (error) throw error
    return (data ?? []) as FoglioTurno[]
  },
  async setFoglioTurno(versioneId: string, turnoSchemaId: string, foglioId: string | null): Promise<void> {
    if (foglioId === null) {
      const { error } = await supabase.from('foglio_turni').delete().match({ versione_id: versioneId, turno_schema_id: turnoSchemaId })
      if (error) throw error
    } else {
      const { error } = await supabase.from('foglio_turni').upsert({ versione_id: versioneId, turno_schema_id: turnoSchemaId, foglio_id: foglioId }, { onConflict: 'versione_id,turno_schema_id' })
      if (error) throw error
    }
  },

  // ── Debug "doppleganger": tutti gli utenti con livello max dalle appartenenze ──
  async getUtentiImpersonabili(): Promise<UtenteImpersonabile[]> {
    const [u, m] = await Promise.all([
      supabase.from('utenti').select('id, nome, cognome, email'),
      supabase.from('turnisti').select('utente_id, livello, postazione_id'),
    ])
    if (u.error) throw u.error
    if (m.error) throw m.error
    const info = new Map<string, { livello: Livello; postazioneId: string }>()
    ;(m.data ?? []).forEach(r => {
      const uid = r.utente_id as string, lv = r.livello as Livello
      const cur = info.get(uid)
      if (!cur || (RANK_LIVELLO[lv] ?? 0) > (RANK_LIVELLO[cur.livello] ?? 0)) info.set(uid, { livello: lv, postazioneId: r.postazione_id as string })
    })
    return (u.data ?? []).map(x => {
      const i = info.get(x.id as string)
      return { id: x.id as string, nome: (x.nome as string) ?? '', cognome: (x.cognome as string) ?? '', email: (x.email as string) ?? '', livello: (i?.livello ?? 'esterno') as Livello, postazioneId: i?.postazioneId ?? null }
    }).sort((a, b) => `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`, 'it'))
  },

  // Tutti gli utenti con il flag admin (per la gestione amministratori).
  async getUtenti(): Promise<UtenteAdmin[]> {
    const { data, error } = await supabase.from('utenti').select('id, nome, cognome, email, admin')
    if (error) throw error
    return (data ?? []).map(x => ({ id: x.id as string, nome: (x.nome as string) ?? '', cognome: (x.cognome as string) ?? '', email: (x.email as string) ?? '', admin: !!x.admin }))
      .sort((a, b) => `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`, 'it'))
  },
  // Promuove/rimuove un amministratore. Lato DB un trigger garantisce che solo un
  // super-admin possa farlo e protegge il proprietario / l'ultimo admin.
  async setUtenteAdmin(utenteId: string, on: boolean): Promise<void> {
    const { error } = await supabase.from('utenti').update({ admin: on }).eq('id', utenteId)
    if (error) throw error
  },
  // Crea (o promuove, se l'email esiste già) un amministratore "puro", senza
  // appartenenze a postazioni. L'email è quella del suo login Google.
  async creaUtenteAdmin(nome: string, cognome: string, email: string): Promise<void> {
    const em = email.trim().toLowerCase()
    const { data: ex, error: e1 } = await supabase.from('utenti').select('id').ilike('email', em).limit(1)
    if (e1) throw e1
    if (ex && ex[0]) {
      const { error } = await supabase.from('utenti').update({ admin: true }).eq('id', (ex[0] as { id: string }).id)
      if (error) throw error
      return
    }
    const { error } = await supabase.from('utenti').insert({ nome: nome.trim(), cognome: cognome.trim(), email: em, admin: true })
    if (error) throw error
  },

  // ── Anagrafica Utenti (Centro di Controllo, solo admin) ──
  //  Elenco paginato di TUTTE le identità del sistema, con ricerca su nome/cognome/email.
  async getUtentiAnagrafica(search: string, offset: number, limit: number): Promise<{ rows: UtenteAnagrafica[]; total: number }> {
    // Il ruolo (per ordinare) dipende da admin + supervisore + miglior livello di appartenenza,
    // quindi carichiamo tutto e ordiniamo/paginiamo lato client (l'anagrafica è piccola).
    const [u, m, sup] = await Promise.all([
      supabase.from('utenti').select('id, nome, cognome, email, admin, attivo'),
      supabase.from('turnisti').select('utente_id, livello'),
      supabase.from('supervisori').select('utente_id'),
    ])
    if (u.error) throw u.error
    if (m.error) throw m.error
    if (sup.error) throw sup.error
    const supSet = new Set((sup.data ?? []).map(s => s.utente_id as string))
    const best = new Map<string, string>()
    ;(m.data ?? []).forEach(r => { const id = r.utente_id as string, lv = r.livello as string; const cur = best.get(id); if (!cur || (RANK_LIVELLO[lv] ?? 0) > (RANK_LIVELLO[cur] ?? 0)) best.set(id, lv) })
    const ruoloOf = (id: string, admin: boolean) => admin ? 'admin' : supSet.has(id) ? 'supervisore' : (best.get(id) ?? '—')
    let rows: UtenteAnagrafica[] = (u.data ?? []).map(x => { const id = x.id as string, admin = !!x.admin; return { id, nome: (x.nome as string) ?? '', cognome: (x.cognome as string) ?? '', email: (x.email as string) ?? '', admin, attivo: (x.attivo as boolean) !== false, ruolo: ruoloOf(id, admin) } })
    const s = search.trim().toLowerCase()
    if (s) rows = rows.filter(r => `${r.cognome} ${r.nome} ${r.email}`.toLowerCase().includes(s))
    rows.sort((a, b) => (RANK_RUOLO[b.ruolo] - RANK_RUOLO[a.ruolo]) || `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`, 'it'))
    return { rows: rows.slice(offset, offset + limit), total: rows.length }
  },
  // Appartenenze (postazione + ruolo) di un utente, per la sua scheda.
  async getMembershipUtente(utenteId: string): Promise<MembershipUtente[]> {
    const { data, error } = await supabase.from('turnisti').select('id, livello, postazione_id, postazioni(nome)').eq('utente_id', utenteId)
    if (error) throw error
    return (data ?? []).map(x => ({ membershipId: x.id as string, postazioneId: x.postazione_id as string, postazioneNome: ((x.postazioni as { nome?: string } | null)?.nome) ?? '—', livello: x.livello as Livello }))
      .sort((a, b) => a.postazioneNome.localeCompare(b.postazioneNome, 'it'))
  },
  // Sospende / riattiva un utente (RPC admin: protegge se stessi e gli altri admin).
  async setUtenteAttivo(utenteId: string, attivo: boolean): Promise<void> {
    const { error } = await supabase.rpc('admin_set_utente_attivo', { p_utente: utenteId, p_attivo: attivo })
    if (error) throw error
  },
  // Elimina definitivamente un utente (RPC admin: bloccato se ha storico).
  async eliminaUtenteDefinitivo(utenteId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_elimina_utente', { p_utente: utenteId })
    if (error) throw error
  },
  // Aggiorna l'anagrafica (nome/cognome/email) di un utente (RPC admin).
  async aggiornaUtente(utenteId: string, patch: { nome: string; cognome: string; email: string }): Promise<void> {
    const { error } = await supabase.rpc('admin_aggiorna_utente', { p_utente: utenteId, p_nome: patch.nome, p_cognome: patch.cognome, p_email: patch.email })
    if (error) throw error
  },

  // ── Supervisori (accesso all'amministrazione, indipendente dal ruolo del mese) ──
  async getSupervisori(): Promise<Supervisore[]> {
    const [s, sp, u] = await Promise.all([
      supabase.from('supervisori').select('utente_id, tutte_postazioni'),
      supabase.from('supervisore_postazioni').select('utente_id, postazione_id'),
      supabase.from('utenti').select('id, nome, cognome, email'),
    ])
    if (s.error) throw s.error
    if (sp.error) throw sp.error
    if (u.error) throw u.error
    const uById = new Map((u.data ?? []).map(x => [x.id as string, x]))
    const post = new Map<string, string[]>()
    ;(sp.data ?? []).forEach(r => {
      const k = r.utente_id as string
      if (!post.has(k)) post.set(k, [])
      post.get(k)!.push(r.postazione_id as string)
    })
    return (s.data ?? []).map(r => {
      const ut = uById.get(r.utente_id as string)
      return {
        id: r.utente_id as string,
        nome: (ut?.nome as string) ?? '', cognome: (ut?.cognome as string) ?? '', email: (ut?.email as string) ?? '',
        tuttePostazioni: !!r.tutte_postazioni,
        postazioni: post.get(r.utente_id as string) ?? [],
      }
    }).sort((a, b) => `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`, 'it'))
  },
  async addSupervisore(utenteId: string): Promise<void> {
    const { error } = await supabase.from('supervisori').upsert({ utente_id: utenteId }, { onConflict: 'utente_id' })
    if (error) throw error
  },
  async removeSupervisore(utenteId: string): Promise<void> {
    const { error } = await supabase.from('supervisori').delete().eq('utente_id', utenteId)
    if (error) throw error
  },
  async setSupervisoreTutte(utenteId: string, tutte: boolean): Promise<void> {
    const { error } = await supabase.from('supervisori').update({ tutte_postazioni: tutte }).eq('utente_id', utenteId)
    if (error) throw error
  },
  async setSupervisorePostazioni(utenteId: string, postazioniIds: string[]): Promise<void> {
    const { error: e1 } = await supabase.from('supervisore_postazioni').delete().eq('utente_id', utenteId)
    if (e1) throw e1
    if (postazioniIds.length) {
      const { error: e2 } = await supabase.from('supervisore_postazioni').insert(postazioniIds.map(pid => ({ utente_id: utenteId, postazione_id: pid })))
      if (e2) throw e2
    }
  },
  async creaUtenteSupervisore(nome: string, cognome: string, email: string): Promise<void> {
    const em = email.trim().toLowerCase()
    const { data: ex, error: e1 } = await supabase.from('utenti').select('id').ilike('email', em).limit(1)
    if (e1) throw e1
    let id = ex && ex[0] ? (ex[0] as { id: string }).id : null
    if (!id) {
      const { data, error } = await supabase.from('utenti').insert({ nome: nome.trim(), cognome: cognome.trim(), email: em, admin: false }).select('id').limit(1)
      if (error) throw error
      id = (data?.[0] as { id: string } | undefined)?.id ?? null
    }
    if (!id) throw new Error('Creazione utente non riuscita.')
    const { error } = await supabase.from('supervisori').upsert({ utente_id: id }, { onConflict: 'utente_id' })
    if (error) throw error
  },

  // ── Notifiche (eventi della gestione del mese) ──
  async addNotifica(n: AddNotifica): Promise<void> {
    const { error } = await supabase.from('notifiche').insert({ postazione_id: n.postazioneId, mese: n.mese, tipo: n.tipo, messaggio: n.messaggio, target: n.target ?? null, per_admin: n.perAdmin ?? false, turnista_id: n.turnistaId ?? null, autore: n.autore ?? _autoreCorrente })
    if (error) console.warn('[Notifiche] insert ignorato:', error.message)
  },
  async getNotificheAdmin(postazioneId: string): Promise<Notifica[]> {
    const limite = new Date(Date.now() - 60 * 86400000).toISOString()
    const { data, error } = await supabase.from('notifiche').select('*').eq('postazione_id', postazioneId).eq('per_admin', true).gte('created_at', limite).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(mapNotifica)
  },
  async getNotificheUtente(turnistaIds: string[]): Promise<Notifica[]> {
    if (!turnistaIds.length) return []
    const limite = new Date(Date.now() - 60 * 86400000).toISOString()
    const { data, error } = await supabase.from('notifiche').select('*').in('turnista_id', turnistaIds).gte('created_at', limite).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(mapNotifica)
  },
  // candidature ancora "in attesa" dei turnisti dati (per il Centro Messaggi → Ritira)
  async getRichiesteUtente(turnistaIds: string[]): Promise<CandidaturaAttesa[]> {
    if (!turnistaIds.length) return []
    const { data, error } = await supabase.from('richieste_turno')
      .select('id, data, postazione_id, turno_schema_id, turnista_id, turno:schema_turni(nome), postazione:postazioni(nome)')
      .in('turnista_id', turnistaIds).eq('stato', 'in_attesa').order('data')
    if (error) throw error
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string, data: r.data as string, postazioneId: r.postazione_id as string,
      turnoSchemaId: r.turno_schema_id as string, turnistaId: r.turnista_id as string,
      turnoNome: (r.turno as { nome?: string } | null)?.nome ?? 'Turno',
      postazioneNome: (r.postazione as { nome?: string } | null)?.nome ?? '',
    }))
  },
  async marcaNotificheLette(ids: string[]): Promise<void> {
    if (!ids.length) return
    const { error } = await supabase.from('notifiche').update({ letta: true }).in('id', ids)
    if (error) throw error
  },
  async eliminaNotifica(id: string): Promise<void> {
    const { error } = await supabase.from('notifiche').delete().eq('id', id)
    if (error) throw error
  },
  async cleanupNotifiche(postazioneId: string): Promise<void> {
    const limite = new Date(Date.now() - 30 * 86400000).toISOString()
    const { error } = await supabase.from('notifiche').delete().eq('postazione_id', postazioneId).eq('letta', true).lt('created_at', limite)
    if (error) console.warn('[Notifiche] cleanup ignorato:', error.message)
  },

  // ── Log Postazioni (eventi globali: creazione/modifica/eliminazione) ──
  async addLogPostazione(messaggio: string, autore?: string | null): Promise<void> {
    const { error } = await supabase.from('log_postazioni').insert({ messaggio, autore: autore ?? _autoreCorrente })
    if (error) console.warn('[LogPostazioni] insert ignorato:', error.message)
  },
  async getLogPostazioni(): Promise<LogPostazione[]> {
    const { data, error } = await supabase.from('log_postazioni').select('*').order('created_at', { ascending: false }).limit(100)
    if (error) throw error
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string, messaggio: r.messaggio as string,
      autore: (r.autore as string | null) ?? null, createdAt: r.created_at as string,
    }))
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
const LS_REGOLE_TURNISTA  = 'gm_regole_turnista'
const LS_TURNI            = 'gm_turni'
const LS_TURNISTI_MESE    = 'gm_turnisti_mese'
const LS_DESIDERATA       = 'gm_desiderata'
const LS_DESIDERATA_FIN   = 'gm_desiderata_finestra'
const LS_TURNI_STATO      = 'gm_turni_stato'
const LS_RICHIESTE        = 'gm_richieste'
const LS_IMPAG_VERSIONI   = 'gm_impag_versioni'
const LS_FOGLI            = 'gm_fogli'
const LS_FOGLIO_TURNI     = 'gm_foglio_turni'
const LS_POSTAZIONI       = 'gm_postazioni'
const LS_FEST_CUSTOM      = 'gm_festivita_custom'
const LS_FEST_SUPER       = 'gm_festivita_super'
const LS_SUPERF_TURNI     = 'gm_superfestivo_turni'
const LS_FINALIZZAZIONI   = 'gm_finalizzazioni'
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

// Versione DEV del caricatore archivio (legge da localStorage: finalizzazioni + gm_setup_backup)
function _archDev(pid: string, mese: string): SnapMese | null {
  const key = 'dev|' + pid + '|' + mese
  if (_archCache.has(key)) return _archCache.get(key) ?? null
  const fin = read<{ postazioneId?: string; mese: string; archiviato?: boolean }[]>(LS_FINALIZZAZIONI, [])
    .find(f => (f.postazioneId ?? DEV_POSTAZIONE) === pid && f.mese === mese)
  let snap: SnapMese | null = null
  if (fin && fin.archiviato) {
    const bk = read<{ postazioneId?: string; mese: string; snapshot?: SnapMese }[]>('gm_setup_backup', [])
      .filter(b => (b.postazioneId ?? DEV_POSTAZIONE) === pid && b.mese === mese)
    snap = bk.length ? (bk[bk.length - 1].snapshot ?? null) : null
  }
  _archCache.set(key, snap)
  if (snap) _registraVersioni(snap)
  return snap
}

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
  async getPostazioniSupervisione(_utenteId: string): Promise<string[]> {
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
    const arch = _archDev(postazioneId, mese); if (arch) return (arch.config_versione as ConfigVersione) ?? null
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
  async setValidoDaVersione(id: string, validoDa: string): Promise<void> {
    writeLs(LS_VERSIONI, read<WithPost<ConfigVersione>[]>(LS_VERSIONI, []).map(v => v.id === id ? { ...v, valido_da: validoDa } : v))
  },

  // ── Attivazioni mese (DEV) ──
  async getAttivazioni(postazioneId: string, mese: string): Promise<number[]> {
    return read<{ postazioneId: string; mese: string; passo: number }[]>('gm_attivazioni', []).filter(a => a.postazioneId === postazioneId && a.mese === mese).map(a => a.passo)
  },
  async getMesiAttivati(postazioneId: string, passo: number): Promise<string[]> {
    return read<{ postazioneId: string; mese: string; passo: number }[]>('gm_attivazioni', []).filter(a => a.postazioneId === postazioneId && a.passo === passo).map(a => a.mese).sort()
  },
  async attivaPasso(postazioneId: string, mese: string, passo: number, autore?: string | null): Promise<void> {
    const list = read<{ postazioneId: string; mese: string; passo: number; autore: string | null; createdAt: string }[]>('gm_attivazioni', [])
    if (list.some(a => a.postazioneId === postazioneId && a.mese === mese && a.passo === passo)) return
    list.push({ postazioneId, mese, passo, autore: autore ?? _autoreCorrente, createdAt: new Date().toISOString() })
    writeLs('gm_attivazioni', list)
  },
  async disattivaMese(postazioneId: string, mese: string): Promise<void> {
    writeLs('gm_attivazioni', read<{ postazioneId: string; mese: string; passo: number }[]>('gm_attivazioni', []).filter(a => !(a.postazioneId === postazioneId && a.mese === mese)))
  },
  async cancellaMese(postazioneId: string, mese: string, autore?: string | null): Promise<void> {
    const first = `${mese}-01`, last = `${mese}-31`
    const own = (pid: string | undefined) => (pid ?? DEV_POSTAZIONE) === postazioneId
    const inMese = (d: string) => d >= first && d <= last
    // snapshot minimale (DEV) — max 1 per mese: sostituisce l'eventuale precedente
    const backups = read<Record<string, unknown>[]>('gm_setup_backup', []).filter(x => !(x.postazioneId === postazioneId && x.mese === mese))
    backups.push({ id: uid(), postazioneId, mese, autore: autore ?? _autoreCorrente, createdAt: new Date().toISOString(),
      snapshot: { mese, turni: read<WithPost<Turno>[]>(LS_TURNI, []).filter(t => own(t.postazione_id) && inMese(t.data)), desiderata: read<WithPost<Desiderata>[]>(LS_DESIDERATA, []).filter(d => own(d.postazione_id) && inMese(d.data)) } })
    writeLs('gm_setup_backup', backups)
    // dati del mese
    writeLs(LS_TURNI, read<WithPost<Turno>[]>(LS_TURNI, []).filter(t => !(own(t.postazione_id) && inMese(t.data))))
    writeLs(LS_DESIDERATA, read<WithPost<Desiderata>[]>(LS_DESIDERATA, []).filter(d => !(own(d.postazione_id) && inMese(d.data))))
    writeLs(LS_TURNI_STATO, read<WithPost<{ mese: string }>[]>(LS_TURNI_STATO, []).filter(s => !(own(s.postazione_id) && s.mese === mese)))
    writeLs(LS_DESIDERATA_FIN, read<WithPost<{ mese: string }>[]>(LS_DESIDERATA_FIN, []).filter(f => !(own(f.postazione_id) && f.mese === mese)))
    writeLs(LS_TURNISTI_MESE, read<WithPost<{ mese: string }>[]>(LS_TURNISTI_MESE, []).filter(tm => !(own(tm.postazione_id) && tm.mese === mese)))
    writeLs(LS_RICHIESTE, read<WithPost<RichiestaTurno>[]>(LS_RICHIESTE, []).filter(r => !(own(r.postazione_id) && inMese(r.data))))
    // versioni possedute dal mese (DEV: elimina, niente re-ancoraggio)
    const ownIds = <T extends { id: string; valido_da: string; postazione_id?: string }>(rows: T[]) => rows.filter(v => own(v.postazione_id) && v.valido_da === mese).map(v => v.id)
    const cv = read<WithPost<ConfigVersione>[]>(LS_VERSIONI, []); const cvId = ownIds(cv)
    writeLs(LS_VERSIONI, cv.filter(v => !cvId.includes(v.id))); writeLs(LS_SCHEMA, read<TurnoSchema[]>(LS_SCHEMA, []).filter(s => !cvId.includes(s.versione_id)))
    const rv = read<WithPost<RegolaVersione>[]>(LS_REGOLE_VERSIONI, []); const rvId = ownIds(rv)
    writeLs(LS_REGOLE_VERSIONI, rv.filter(v => !rvId.includes(v.id))); writeLs(LS_REGOLE, read<RegolaTurno[]>(LS_REGOLE, []).filter(r => !rvId.includes(r.regola_versione_id)))
    const iv = read<WithPost<ImpaginazioneVersione>[]>(LS_IMPAG_VERSIONI, []); const ivId = ownIds(iv)
    writeLs(LS_IMPAG_VERSIONI, iv.filter(v => !ivId.includes(v.id)))
    writeLs(LS_FOGLI, read<Foglio[]>(LS_FOGLI, []).filter(f => !ivId.includes(f.versione_id)))
    writeLs(LS_FOGLIO_TURNI, read<FoglioTurno[]>(LS_FOGLIO_TURNI, []).filter(ft => !ivId.includes(ft.versione_id)))
    // attivazioni
    writeLs('gm_attivazioni', read<{ postazioneId: string; mese: string }[]>('gm_attivazioni', []).filter(a => !(a.postazioneId === postazioneId && a.mese === mese)))
    // abbinamenti superfestivo del mese (le festività custom/super restano: sono config di postazione)
    writeLs(LS_SUPERF_TURNI, read<{ postazione_id?: string; mese: string }[]>(LS_SUPERF_TURNI, []).filter(x => !((x.postazione_id ?? DEV_POSTAZIONE) === postazioneId && x.mese === mese)))
  },
  async getSetupBackup(postazioneId: string, mese: string): Promise<{ id: string; createdAt: string; autore: string | null } | null> {
    const b = read<Record<string, unknown>[]>('gm_setup_backup', []).filter(x => x.postazioneId === postazioneId && x.mese === mese).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]
    return b ? { id: b.id as string, createdAt: b.createdAt as string, autore: (b.autore as string | null) ?? null } : null
  },
  async ripristinaMese(postazioneId: string, mese: string): Promise<void> {
    const all = read<{ id: string; postazioneId: string; mese: string; snapshot: { turni?: WithPost<Turno>[]; desiderata?: WithPost<Desiderata>[] } }[]>('gm_setup_backup', [])
    const b = all.filter(x => x.postazioneId === postazioneId && x.mese === mese).sort((a, b) => String(b.id).localeCompare(String(a.id)))[0]
    if (!b) throw new Error('Nessuna copia di backup per questo mese')
    const first = `${mese}-01`, last = `${mese}-31`
    const own = (pid: string | undefined) => (pid ?? DEV_POSTAZIONE) === postazioneId
    const inMese = (d: string) => d >= first && d <= last
    writeLs(LS_TURNI, [...read<WithPost<Turno>[]>(LS_TURNI, []).filter(t => !(own(t.postazione_id) && inMese(t.data))), ...(b.snapshot.turni ?? [])])
    writeLs(LS_DESIDERATA, [...read<WithPost<Desiderata>[]>(LS_DESIDERATA, []).filter(d => !(own(d.postazione_id) && inMese(d.data))), ...(b.snapshot.desiderata ?? [])])
    writeLs('gm_setup_backup', all.filter(x => x.id !== b.id))
  },
  async ultimaConfigConTurni(postazioneId: string, primaDelMese: string): Promise<ConfigVersione | null> {
    const schema = read<TurnoSchema[]>(LS_SCHEMA, [])
    const vers = read<WithPost<ConfigVersione>[]>(LS_VERSIONI, [])
      .filter(v => (v.postazione_id ?? DEV_POSTAZIONE) === postazioneId && v.valido_da < primaDelMese)
      .sort((a, b) => b.valido_da.localeCompare(a.valido_da))
    return vers.find(v => schema.some(s => s.versione_id === v.id)) ?? null
  },

  async getSchemaVersione(versioneId: string): Promise<TurnoSchema[]> {
    ensureSeed()
    const arch = _archPerVersione.get(versioneId); if (arch) return [...((arch.config_turni as TurnoSchema[]) ?? [])].sort((a, b) => a.ordine - b.ordine)
    return read<TurnoSchema[]>(LS_SCHEMA, []).filter(s => s.versione_id === versioneId).slice().sort((a, b) => a.ordine - b.ordine)
  },

  // ── Festività / Superfestivi (DEV) ──
  async getNazione(postazioneId: string): Promise<string> {
    return read<WithPost<Postazione>[]>(LS_POSTAZIONI, []).find(p => p.id === postazioneId)?.nazione ?? 'IT'
  },
  async setNazione(postazioneId: string, nazione: string): Promise<void> {
    writeLs(LS_POSTAZIONI, read<Postazione[]>(LS_POSTAZIONI, []).map(p => p.id === postazioneId ? { ...p, nazione } : p))
  },
  async getFestivitaCustom(postazioneId: string): Promise<Festivita[]> {
    return read<WithPost<Festivita>[]>(LS_FEST_CUSTOM, [])
      .filter(f => (f.postazione_id ?? DEV_POSTAZIONE) === postazioneId)
      .map(f => ({ id: f.id, data: f.data, descrizione: f.descrizione }))
      .sort((a, b) => a.data.localeCompare(b.data))
  },
  async addFestivitaCustom(postazioneId: string, data: string, descrizione: string): Promise<void> {
    const list = read<WithPost<Festivita>[]>(LS_FEST_CUSTOM, [])
    if (list.some(f => (f.postazione_id ?? DEV_POSTAZIONE) === postazioneId && f.data === data)) return
    list.push({ id: uid(), postazione_id: postazioneId, data, descrizione })
    writeLs(LS_FEST_CUSTOM, list)
  },
  async removeFestivitaCustom(id: string): Promise<void> {
    writeLs(LS_FEST_CUSTOM, read<WithPost<Festivita>[]>(LS_FEST_CUSTOM, []).filter(f => f.id !== id))
  },
  async getFestivitaSuper(postazioneId: string): Promise<{ data: string; superfestivo: boolean }[]> {
    return read<{ postazione_id?: string; data: string; super: boolean }[]>(LS_FEST_SUPER, [])
      .filter(x => (x.postazione_id ?? DEV_POSTAZIONE) === postazioneId)
      .map(x => ({ data: x.data, superfestivo: !!x.super }))
  },
  async setFestivitaSuper(postazioneId: string, data: string, superfestivo: boolean): Promise<void> {
    const list = read<{ postazione_id?: string; data: string; super: boolean }[]>(LS_FEST_SUPER, [])
    const i = list.findIndex(x => (x.postazione_id ?? DEV_POSTAZIONE) === postazioneId && x.data === data)
    if (i >= 0) list[i] = { ...list[i], super: superfestivo }
    else list.push({ postazione_id: postazioneId, data, super: superfestivo })
    writeLs(LS_FEST_SUPER, list)
  },
  async getSuperfestivoTurni(postazioneId: string, mese: string): Promise<{ data: string; turnoSchemaId: string }[]> {
    const arch = _archDev(postazioneId, mese); if (arch) return ((arch.superfestivo_turni as { data: string; turno_schema_id: string }[]) ?? []).map(r => ({ data: r.data, turnoSchemaId: r.turno_schema_id }))
    return read<{ postazione_id?: string; mese: string; data: string; turno_schema_id: string }[]>(LS_SUPERF_TURNI, [])
      .filter(x => (x.postazione_id ?? DEV_POSTAZIONE) === postazioneId && x.mese === mese)
      .map(x => ({ data: x.data, turnoSchemaId: x.turno_schema_id }))
  },
  async setSuperfestivoTurni(postazioneId: string, mese: string, data: string, turnoSchemaIds: string[]): Promise<void> {
    const list = read<{ postazione_id?: string; mese: string; data: string; turno_schema_id: string }[]>(LS_SUPERF_TURNI, [])
      .filter(x => !((x.postazione_id ?? DEV_POSTAZIONE) === postazioneId && x.mese === mese && x.data === data))
    for (const tid of turnoSchemaIds) list.push({ postazione_id: postazioneId, mese, data, turno_schema_id: tid })
    writeLs(LS_SUPERF_TURNI, list)
  },
  async getSuperfestivoTurniPrecedente(postazioneId: string, meseGiorno: string, primaDelMese: string): Promise<string[]> {
    const rows = read<{ postazione_id?: string; mese: string; data: string; turno_schema_id: string }[]>(LS_SUPERF_TURNI, [])
      .filter(x => (x.postazione_id ?? DEV_POSTAZIONE) === postazioneId && x.mese < primaDelMese && x.data.slice(5) === meseGiorno)
      .sort((a, b) => b.mese.localeCompare(a.mese))
    if (!rows.length) return []
    const best = rows.filter(r => r.mese === rows[0].mese)
    const schema = read<TurnoSchema[]>(LS_SCHEMA, [])
    return best.map(r => schema.find(s => s.id === r.turno_schema_id)?.nome).filter((n): n is string => !!n)
  },

  // ── Finalizzazione (DEV) ──
  async getFinalizzazione(postazioneId: string, mese: string): Promise<{ autore: string | null; createdAt: string } | null> {
    const f = read<{ postazioneId: string; mese: string; autore: string | null; createdAt: string }[]>(LS_FINALIZZAZIONI, [])
      .find(x => x.postazioneId === postazioneId && x.mese === mese)
    return f ? { autore: f.autore, createdAt: f.createdAt } : null
  },
  async getMesiPanoramica(postazioneId: string): Promise<{ mese: string; finalizzato: boolean }[]> {
    const byPost = (pid?: string) => (pid ?? DEV_POSTAZIONE) === postazioneId
    const mesiTurni = new Set(read<WithPost<Turno>[]>(LS_TURNI, []).filter(t => byPost(t.postazione_id)).map(t => t.data.slice(0, 7)))
    const mesiFin = new Set(read<{ postazioneId?: string; mese: string }[]>(LS_FINALIZZAZIONI, []).filter(f => byPost(f.postazioneId)).map(f => f.mese))
    return [...new Set([...mesiTurni, ...mesiFin])].sort().map(mese => ({ mese, finalizzato: mesiFin.has(mese) }))
  },
  async finalizzaMese(postazioneId: string, mese: string, autore?: string | null): Promise<void> {
    const list = read<{ postazioneId: string; mese: string; autore: string | null; createdAt: string }[]>(LS_FINALIZZAZIONI, [])
      .filter(x => !(x.postazioneId === postazioneId && x.mese === mese))
    list.push({ postazioneId, mese, autore: autore ?? _autoreCorrente, createdAt: new Date().toISOString() })
    writeLs(LS_FINALIZZAZIONI, list); clearArchivioCache()
  },
  async sbloccaMese(postazioneId: string, mese: string): Promise<void> {
    writeLs(LS_FINALIZZAZIONI, read<{ postazioneId: string; mese: string }[]>(LS_FINALIZZAZIONI, []).filter(x => !(x.postazioneId === postazioneId && x.mese === mese))); clearArchivioCache()
  },
  async setMioTema(_tema: string): Promise<void> { /* DEV: basta il localStorage di applicaTema */ },
  async getEmailMittente(postazioneId: string): Promise<string> {
    return read<Record<string, string>>('gm_email_mittente', {})[postazioneId] ?? ''
  },
  async setEmailMittente(postazioneId: string, email: string): Promise<void> {
    const m = read<Record<string, string>>('gm_email_mittente', {}); m[postazioneId] = email; writeLs('gm_email_mittente', m)
  },

  // ── Cambi turno (DEV) — replica la logica delle RPC ──
  async getCambiMese(postazioneId: string, mese: string): Promise<CambioTurno[]> {
    return read<CambioTurno[]>('gm_cambi_turno', []).filter(c => (c as CambioTurno & { postazione_id?: string }).postazione_id === postazioneId && c.mese === mese).sort((a, b) => b.created_at.localeCompare(a.created_at))
  },
  async getCambiPendenti(postazioneId: string): Promise<CambioTurno[]> {
    return read<CambioTurno[]>('gm_cambi_turno', []).filter(c => (c as CambioTurno & { postazione_id?: string }).postazione_id === postazioneId && c.stato === 'in_attesa').sort((a, b) => a.created_at.localeCompare(b.created_at))
  },
  async richiediCambio(postazioneId: string, data: string, turnoSchemaId: string, slot: number, daTurnista: string, aTurnista: string, forzato: boolean, descrizione: string, autore?: string | null, soloApprovazione?: boolean): Promise<{ auto: boolean }> {
    const mese = data.slice(0, 7)
    const turni = read<WithPost<Turno>[]>(LS_TURNI, [])
    const own = turni.find(t => (t.postazione_id ?? DEV_POSTAZIONE) === postazioneId && t.data === data && t.turno_schema_id === turnoSchemaId && t.slot === slot && t.turnista_id === daTurnista)
    if (!own) throw new Error('Il turno non risulta (più) assegnato al cedente.')
    const cambi = read<(CambioTurno & { postazione_id: string })[]>('gm_cambi_turno', [])
    if (cambi.some(c => c.postazione_id === postazioneId && c.data === data && c.turno_schema_id === turnoSchemaId && c.slot === slot && c.stato === 'in_attesa')) throw new Error('Esiste già una richiesta di cambio in attesa per questo turno.')
    const regole = await localStore.getRegoleVersioneMese(postazioneId, mese)
    const auto = !!regole?.cambio_auto && !soloApprovazione
    const nuovo: CambioTurno & { postazione_id: string } = {
      id: uid(), postazione_id: postazioneId, mese, data, turno_schema_id: turnoSchemaId, slot,
      da_turnista: daTurnista, a_turnista: aTurnista, stato: auto ? 'approvato' : 'in_attesa', forzato,
      descrizione, richiesto_da: autore ?? _autoreCorrente, created_at: new Date().toISOString(),
      deciso_da: auto ? 'automatico' : null, deciso_il: auto ? new Date().toISOString() : null,
    }
    if (auto) {
      writeLs(LS_TURNI, turni.map(t => t === own ? { ...t, turnista_id: aTurnista } : t))
      await localStore.addTurnistaMese(postazioneId, mese, aTurnista, read<WithPost<Turnista>[]>(LS_TURNISTI, []).find(t => t.id === aTurnista)?.livello)
    }
    writeLs('gm_cambi_turno', [...cambi, nuovo])
    return { auto }
  },
  async decidiCambio(cambioId: string, approva: boolean, autore?: string | null): Promise<void> {
    const cambi = read<(CambioTurno & { postazione_id: string })[]>('gm_cambi_turno', [])
    const c = cambi.find(x => x.id === cambioId)
    if (!c) throw new Error('Richiesta di cambio non trovata.')
    if (c.stato !== 'in_attesa') throw new Error(`Richiesta già decisa (${c.stato}).`)
    if (approva) {
      const turni = read<WithPost<Turno>[]>(LS_TURNI, [])
      const own = turni.find(t => (t.postazione_id ?? DEV_POSTAZIONE) === c.postazione_id && t.data === c.data && t.turno_schema_id === c.turno_schema_id && t.slot === c.slot && t.turnista_id === c.da_turnista)
      if (!own) throw new Error('Il turno non risulta (più) assegnato al cedente: cambio non applicabile.')
      writeLs(LS_TURNI, turni.map(t => t === own ? { ...t, turnista_id: c.a_turnista } : t))
      await localStore.addTurnistaMese(c.postazione_id, c.mese, c.a_turnista, read<WithPost<Turnista>[]>(LS_TURNISTI, []).find(t => t.id === c.a_turnista)?.livello)
    }
    writeLs('gm_cambi_turno', cambi.map(x => x.id === cambioId ? { ...x, stato: approva ? 'approvato' : 'rifiutato', deciso_da: autore ?? _autoreCorrente, deciso_il: new Date().toISOString() } : x))
  },
  async getTurniPersonaData(utenteId: string, data: string): Promise<TurnoPersona[]> {
    const membs = read<WithPost<Turnista>[]>(LS_TURNISTI, []).filter(t => (t.utente_id ?? t.id) === utenteId)
    const ids = new Set(membs.map(m => m.id))
    if (!ids.size) return []
    const [y, m, d] = data.split('-').map(Number)
    const prima = new Date(y, m - 1, d - 1)
    const primaIso = `${prima.getFullYear()}-${String(prima.getMonth() + 1).padStart(2, '0')}-${String(prima.getDate()).padStart(2, '0')}`
    const schema = read<TurnoSchema[]>(LS_SCHEMA, [])
    const posts = read<Postazione[]>(LS_POSTAZIONI, [])
    return read<WithPost<Turno>[]>(LS_TURNI, [])
      .filter(t => t.turnista_id && ids.has(t.turnista_id) && t.slot >= 0 && (t.data === data || t.data === primaIso))
      .map(t => {
        const s = schema.find(x => x.id === t.turno_schema_id)
        return { data: t.data, ora_inizio: s?.ora_inizio ?? '00:00', ora_fine: s?.ora_fine ?? '00:00', turnoNome: s?.nome ?? 'Turno', postazioneNome: posts.find(p => p.id === (t.postazione_id ?? DEV_POSTAZIONE))?.nome ?? '—' }
      })
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
    const arch = _archDev(postazioneId, `${anno}-${String(mese).padStart(2, '0')}`); if (arch) return (arch.turni as WithPost<Turno>[]) ?? []
    const { first, last } = meseRange(anno, mese)
    return read<WithPost<Turno>[]>(LS_TURNI, []).filter(t => (t.postazione_id ?? DEV_POSTAZIONE) === postazioneId && t.data >= first && t.data <= last)
  },
  async setAssegnazione(postazioneId: string, data: string, turnoSchemaId: string, slot: number, turnistaId: string | null): Promise<void> {
    const list = read<WithPost<Turno>[]>(LS_TURNI, []).filter(t => !(t.data === data && t.turno_schema_id === turnoSchemaId && t.slot === slot))
    if (turnistaId !== null) list.push({ id: uid(), data, turno_schema_id: turnoSchemaId, slot, turnista_id: turnistaId, created_at: new Date().toISOString(), postazione_id: postazioneId })
    writeLs(LS_TURNI, list)
  },

  // ── Versioni/backup del calendario (DEV) ──
  async snapshotTurni(postazioneId: string, mese: string, motivo: string, autore?: string | null): Promise<void> {
    const first = `${mese}-01`, last = `${mese}-31`
    const snap = read<WithPost<Turno>[]>(LS_TURNI, [])
      .filter(t => (t.postazione_id ?? DEV_POSTAZIONE) === postazioneId && t.data >= first && t.data <= last)
      .map(t => ({ data: t.data, turno_schema_id: t.turno_schema_id, slot: t.slot, turnista_id: t.turnista_id }))
      .sort((a, b) => (a.data + a.turno_schema_id + a.slot).localeCompare(b.data + b.turno_schema_id + b.slot))
    const all = read<(BackupTurni & { postazioneId: string; snapshot: unknown[] })[]>('gm_turni_backup', [])
    const ultimo = all.filter(b => b.postazioneId === postazioneId && b.mese === mese).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    if (ultimo && JSON.stringify(ultimo.snapshot) === JSON.stringify(snap)) return
    all.push({ id: uid(), postazioneId, mese, snapshot: snap, motivo, autore: autore ?? _autoreCorrente, nTurni: snap.length, createdAt: new Date().toISOString() })
    // conservazione: tiene tutte le versioni < 2 mesi + l'ultima di ogni calendario
    const due = new Date(Date.now() - 60 * 86400000).toISOString()
    const ultima = new Map<string, string>()   // postazione|mese → createdAt più recente
    for (const x of all) { const k = `${x.postazioneId}|${x.mese}`; const c = ultima.get(k); if (!c || x.createdAt > c) ultima.set(k, x.createdAt) }
    writeLs('gm_turni_backup', all.filter(x => x.createdAt >= due || ultima.get(`${x.postazioneId}|${x.mese}`) === x.createdAt))
  },
  async getBackupTurni(postazioneId: string, mese: string): Promise<BackupTurni[]> {
    return read<(BackupTurni & { postazioneId: string })[]>('gm_turni_backup', [])
      .filter(b => b.postazioneId === postazioneId && b.mese === mese)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ id, mese, motivo, autore, nTurni, createdAt }) => ({ id, mese, motivo, autore, nTurni, createdAt }))
  },
  async getBackupSnapshot(backupId: string): Promise<SnapshotTurno[]> {
    const b = read<(BackupTurni & { snapshot: SnapshotTurno[] })[]>('gm_turni_backup', []).find(x => x.id === backupId)
    return b?.snapshot ?? []
  },

  async getRegoleVersioneMese(postazioneId: string, mese: string): Promise<RegolaVersione | null> {
    ensureSeed()
    return pickVersione(read<WithPost<RegolaVersione>[]>(LS_REGOLE_VERSIONI, []).filter(v => (v.postazione_id ?? DEV_POSTAZIONE) === postazioneId), mese)
  },
  async creaRegoleVersione(postazioneId: string, mese: string): Promise<RegolaVersione> {
    const v = { id: uid(), valido_da: mese, valido_fino: null, ore_min_settimana: null, ore_max_settimana: null, ore_max_consecutive: null, cambio_auto: true, created_at: new Date().toISOString(), postazione_id: postazioneId }
    writeLs(LS_REGOLE_VERSIONI, [...read<WithPost<RegolaVersione>[]>(LS_REGOLE_VERSIONI, []), v])
    return v
  },
  async setValiditaRegoleVersione(id: string, validoFino: string | null): Promise<void> {
    writeLs(LS_REGOLE_VERSIONI, read<WithPost<RegolaVersione>[]>(LS_REGOLE_VERSIONI, []).map(v => v.id === id ? { ...v, valido_fino: validoFino } : v))
  },
  async ultimaRegoleConContenuto(postazioneId: string, primaDelMese: string): Promise<RegolaVersione | null> {
    const regole = read<RegolaTurno[]>(LS_REGOLE, [])
    const vers = read<WithPost<RegolaVersione>[]>(LS_REGOLE_VERSIONI, [])
      .filter(v => (v.postazione_id ?? DEV_POSTAZIONE) === postazioneId && v.valido_da < primaDelMese)
      .sort((a, b) => b.valido_da.localeCompare(a.valido_da))
    return vers.find(v => regole.some(r => r.regola_versione_id === v.id)) ?? null
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
    writeLs(LS_REGOLE_TURNISTA, read<RegolaTurnista[]>(LS_REGOLE_TURNISTA, []).filter(r => r.regola_versione_id !== id))
  },
  async getRegoleTurnista(regolaVersioneId: string): Promise<RegolaTurnista[]> {
    return read<RegolaTurnista[]>(LS_REGOLE_TURNISTA, []).filter(r => r.regola_versione_id === regolaVersioneId)
  },
  async setRegolaTurnista(regolaVersioneId: string, turnistaId: string, tipo: TipoRegolaTurnista, valore: number): Promise<void> {
    const list = read<RegolaTurnista[]>(LS_REGOLE_TURNISTA, []).filter(r => !(r.regola_versione_id === regolaVersioneId && r.turnista_id === turnistaId && r.tipo === tipo))
    list.push({ id: uid(), regola_versione_id: regolaVersioneId, turnista_id: turnistaId, tipo, valore })
    writeLs(LS_REGOLE_TURNISTA, list)
  },
  async deleteRegoleTurnistaVersione(regolaVersioneId: string): Promise<void> {
    writeLs(LS_REGOLE_TURNISTA, read<RegolaTurnista[]>(LS_REGOLE_TURNISTA, []).filter(r => r.regola_versione_id !== regolaVersioneId))
  },
  async setOreMinSettimana(id: string, ore: number | null): Promise<void> {
    writeLs(LS_REGOLE_VERSIONI, read<WithPost<RegolaVersione>[]>(LS_REGOLE_VERSIONI, []).map(v => v.id === id ? { ...v, ore_min_settimana: ore } : v))
  },
  async setOreMaxSettimana(id: string, ore: number | null): Promise<void> {
    writeLs(LS_REGOLE_VERSIONI, read<WithPost<RegolaVersione>[]>(LS_REGOLE_VERSIONI, []).map(v => v.id === id ? { ...v, ore_max_settimana: ore } : v))
  },
  async setOreMaxConsecutive(id: string, ore: number | null): Promise<void> {
    writeLs(LS_REGOLE_VERSIONI, read<WithPost<RegolaVersione>[]>(LS_REGOLE_VERSIONI, []).map(v => v.id === id ? { ...v, ore_max_consecutive: ore } : v))
  },
  async setCambioAuto(id: string, on: boolean): Promise<void> {
    writeLs(LS_REGOLE_VERSIONI, read<WithPost<RegolaVersione>[]>(LS_REGOLE_VERSIONI, []).map(v => v.id === id ? { ...v, cambio_auto: on } : v))
  },
  async getTurnistiMese(postazioneId: string, mese: string): Promise<string[]> {
    return read<{ mese: string; turnista_id: string; postazione_id?: string }[]>(LS_TURNISTI_MESE, []).filter(x => x.mese === mese && (x.postazione_id ?? DEV_POSTAZIONE) === postazioneId).map(x => x.turnista_id)
  },
  async addTurnistaMese(postazioneId: string, mese: string, turnistaId: string, livello?: Livello): Promise<void> {
    const l = read<{ mese: string; turnista_id: string; postazione_id?: string; livello?: Livello }[]>(LS_TURNISTI_MESE, [])
    const ex = l.find(x => x.mese === mese && x.turnista_id === turnistaId)
    if (ex) { if (livello) ex.livello = livello } else l.push({ mese, turnista_id: turnistaId, postazione_id: postazioneId, livello })
    writeLs(LS_TURNISTI_MESE, l)
  },
  async getPersonaleMese(postazioneId: string, mese: string): Promise<TurnistaMese[]> {
    const arch = _archDev(postazioneId, mese); if (arch) return ((arch.turnisti_mese as { turnista_id: string; livello?: string }[]) ?? []).map(r => ({ turnista_id: r.turnista_id, livello: (r.livello ?? 'turnista') as Livello }))
    return read<{ mese: string; turnista_id: string; postazione_id?: string; livello?: Livello }[]>(LS_TURNISTI_MESE, [])
      .filter(x => x.mese === mese && (x.postazione_id ?? DEV_POSTAZIONE) === postazioneId)
      .map(x => ({ turnista_id: x.turnista_id, livello: (x.livello ?? 'turnista') as Livello }))
  },
  async setLivelloMese(_postazioneId: string, mese: string, turnistaId: string, livello: Livello): Promise<void> {
    writeLs(LS_TURNISTI_MESE, read<{ mese: string; turnista_id: string; postazione_id?: string; livello?: Livello }[]>(LS_TURNISTI_MESE, []).map(x => x.mese === mese && x.turnista_id === turnistaId ? { ...x, livello } : x))
  },
  async ultimoMesePersonale(postazioneId: string, primaDelMese: string): Promise<string | null> {
    const mesi = read<{ mese: string; postazione_id?: string }[]>(LS_TURNISTI_MESE, [])
      .filter(x => (x.postazione_id ?? DEV_POSTAZIONE) === postazioneId && x.mese < primaDelMese).map(x => x.mese).sort()
    return mesi.length ? mesi[mesi.length - 1] : null
  },
  async turnistaHaStorico(turnistaId: string): Promise<boolean> {
    return read<WithPost<Turno>[]>(LS_TURNI, []).some(t => t.turnista_id === turnistaId)
      || read<WithPost<Desiderata>[]>(LS_DESIDERATA, []).some(d => d.turnista_id === turnistaId)
      || read<{ turnista_id: string }[]>(LS_TURNISTI_MESE, []).some(x => x.turnista_id === turnistaId)
  },
  async removeTurnistaMese(mese: string, turnistaId: string): Promise<void> {
    writeLs(LS_TURNISTI_MESE, read<{ mese: string; turnista_id: string }[]>(LS_TURNISTI_MESE, []).filter(x => !(x.mese === mese && x.turnista_id === turnistaId)))
  },

  async getDesiderataMese(postazioneId: string, anno: number, mese: number): Promise<Desiderata[]> {
    const arch = _archDev(postazioneId, `${anno}-${String(mese).padStart(2, '0')}`); if (arch) return (arch.desiderata as Desiderata[]) ?? []
    const { first, last } = meseRange(anno, mese)
    return read<WithPost<Desiderata>[]>(LS_DESIDERATA, []).filter(d => (d.postazione_id ?? DEV_POSTAZIONE) === postazioneId && d.data >= first && d.data <= last)
  },
  async setDesiderata(postazioneId: string, data: string, turnoSchemaId: string, turnistaId: string, tipo: TipoDesiderata | null): Promise<void> {
    const list = read<WithPost<Desiderata>[]>(LS_DESIDERATA, []).filter(d => !(d.data === data && d.turno_schema_id === turnoSchemaId && d.turnista_id === turnistaId))
    if (tipo !== null) list.push({ id: uid(), data, turno_schema_id: turnoSchemaId, turnista_id: turnistaId, tipo, created_at: new Date().toISOString(), postazione_id: postazioneId })
    writeLs(LS_DESIDERATA, list)
  },
  async getDesiderataFinestra(postazioneId: string, mese: string): Promise<DesiderataFinestra | null> {
    const arch = _archDev(postazioneId, mese); if (arch) { const df = arch.desiderata_finestra as DesiderataFinestra | null; return df ? { mese: df.mese, aperta_da: df.aperta_da, aperta_a: df.aperta_a, pubbliche: !!df.pubbliche } : null }
    const f = read<WithPost<DesiderataFinestra>[]>(LS_DESIDERATA_FIN, []).find(f => f.mese === mese && (f.postazione_id ?? DEV_POSTAZIONE) === postazioneId)
    return f ? { mese: f.mese, aperta_da: f.aperta_da, aperta_a: f.aperta_a, pubbliche: !!f.pubbliche } : null
  },
  async setDesiderataFinestra(postazioneId: string, mese: string, da: string | null, a: string | null): Promise<void> {
    const all = read<WithPost<DesiderataFinestra>[]>(LS_DESIDERATA_FIN, [])
    const prev = all.find(f => f.mese === mese && (f.postazione_id ?? DEV_POSTAZIONE) === postazioneId)
    const list = all.filter(f => !(f.mese === mese && (f.postazione_id ?? DEV_POSTAZIONE) === postazioneId))
    list.push({ mese, aperta_da: da, aperta_a: a, pubbliche: prev?.pubbliche ?? false, postazione_id: postazioneId })
    writeLs(LS_DESIDERATA_FIN, list)
  },
  async setDesiderataPubbliche(postazioneId: string, mese: string, pubbliche: boolean): Promise<void> {
    const all = read<WithPost<DesiderataFinestra>[]>(LS_DESIDERATA_FIN, [])
    const prev = all.find(f => f.mese === mese && (f.postazione_id ?? DEV_POSTAZIONE) === postazioneId)
    const list = all.filter(f => !(f.mese === mese && (f.postazione_id ?? DEV_POSTAZIONE) === postazioneId))
    list.push({ mese, aperta_da: prev?.aperta_da ?? null, aperta_a: prev?.aperta_a ?? null, pubbliche, postazione_id: postazioneId })
    writeLs(LS_DESIDERATA_FIN, list)
  },
  async attivaDesiderata(postazioneId: string, mese: string): Promise<void> {
    const list = read<WithPost<DesiderataFinestra>[]>(LS_DESIDERATA_FIN, [])
    if (!list.some(f => f.mese === mese && (f.postazione_id ?? DEV_POSTAZIONE) === postazioneId)) { list.push({ mese, aperta_da: null, aperta_a: null, pubbliche: false, postazione_id: postazioneId }); writeLs(LS_DESIDERATA_FIN, list) }
  },

  async getStatoCalendario(postazioneId: string, mese: string): Promise<StatoCalendario> {
    const arch = _archDev(postazioneId, mese); if (arch) return ((arch.turni_stato as { stato?: string } | null)?.stato as StatoCalendario) ?? 'pubblicato'
    return read<{ postazione_id: string; mese: string; stato: StatoCalendario }[]>(LS_TURNI_STATO, []).find(s => s.mese === mese && (s.postazione_id ?? DEV_POSTAZIONE) === postazioneId)?.stato ?? 'non_pubblicato'
  },
  async setStatoCalendario(postazioneId: string, mese: string, stato: StatoCalendario): Promise<void> {
    const list = read<{ postazione_id: string; mese: string; stato: StatoCalendario }[]>(LS_TURNI_STATO, []).filter(s => !(s.mese === mese && (s.postazione_id ?? DEV_POSTAZIONE) === postazioneId))
    list.push({ postazione_id: postazioneId, mese, stato })
    writeLs(LS_TURNI_STATO, list)
  },

  async getRichiesteMese(postazioneId: string, anno: number, mese: number): Promise<RichiestaTurno[]> {
    const { first, last } = meseRange(anno, mese)
    return read<WithPost<RichiestaTurno>[]>(LS_RICHIESTE, []).filter(r => (r.postazione_id ?? DEV_POSTAZIONE) === postazioneId && (r.stato ?? 'in_attesa') === 'in_attesa' && r.data >= first && r.data <= last)
  },
  async addRichiesta(postazioneId: string, data: string, turnoSchemaId: string, turnistaId: string): Promise<void> {
    const list = read<WithPost<RichiestaTurno>[]>(LS_RICHIESTE, [])
    const ex = list.find(r => r.data === data && r.turno_schema_id === turnoSchemaId && r.turnista_id === turnistaId)
    if (ex) ex.stato = 'in_attesa'
    else list.push({ id: uid(), data, turno_schema_id: turnoSchemaId, turnista_id: turnistaId, stato: 'in_attesa', created_at: new Date().toISOString(), postazione_id: postazioneId })
    writeLs(LS_RICHIESTE, list)
  },
  async setRichiestaStato(id: string, stato: StatoRichiesta): Promise<void> {
    const list = read<WithPost<RichiestaTurno>[]>(LS_RICHIESTE, [])
    const r = list.find(x => x.id === id); if (r) { r.stato = stato; writeLs(LS_RICHIESTE, list) }
  },
  async getRichiestaCorrente(postazioneId: string, data: string, turnoSchemaId: string, turnistaId: string): Promise<RichiestaTurno | null> {
    return read<WithPost<RichiestaTurno>[]>(LS_RICHIESTE, []).find(r => (r.postazione_id ?? DEV_POSTAZIONE) === postazioneId && r.data === data && r.turno_schema_id === turnoSchemaId && r.turnista_id === turnistaId) ?? null
  },
  async removeRichiesta(id: string): Promise<void> {
    writeLs(LS_RICHIESTE, read<WithPost<RichiestaTurno>[]>(LS_RICHIESTE, []).filter(r => r.id !== id))
  },

  async getMesiConContenuto(postazioneId: string): Promise<{ min: string | null; max: string | null }> {
    const ts = read<{ postazione_id?: string; mese: string; stato: StatoCalendario }[]>(LS_TURNI_STATO, []).filter(s => (s.postazione_id ?? DEV_POSTAZIONE) === postazioneId && s.stato !== 'non_pubblicato').map(s => s.mese)
    const df = read<WithPost<DesiderataFinestra>[]>(LS_DESIDERATA_FIN, []).filter(f => (f.postazione_id ?? DEV_POSTAZIONE) === postazioneId && !!f.aperta_a).map(f => f.mese)
    const mesi = [...ts, ...df]
    if (!mesi.length) return { min: null, max: null }
    mesi.sort()
    return { min: mesi[0], max: mesi[mesi.length - 1] }
  },

  async getImpaginazioneVersioneMese(postazioneId: string, mese: string): Promise<ImpaginazioneVersione | null> {
    const arch = _archDev(postazioneId, mese); if (arch) return (arch.impag_versione as ImpaginazioneVersione) ?? null
    return pickVersione(read<WithPost<ImpaginazioneVersione>[]>(LS_IMPAG_VERSIONI, []).filter(v => (v.postazione_id ?? DEV_POSTAZIONE) === postazioneId), mese)
  },
  async getImpaginazioneVersioni(postazioneId: string): Promise<ImpaginazioneVersione[]> {
    return read<WithPost<ImpaginazioneVersione>[]>(LS_IMPAG_VERSIONI, []).filter(v => (v.postazione_id ?? DEV_POSTAZIONE) === postazioneId).slice().sort((a, b) => a.valido_da.localeCompare(b.valido_da))
  },
  async creaImpaginazioneVersione(postazioneId: string, mese: string): Promise<ImpaginazioneVersione> {
    const v = { id: uid(), valido_da: mese, valido_fino: null, created_at: new Date().toISOString(), postazione_id: postazioneId }
    writeLs(LS_IMPAG_VERSIONI, [...read<WithPost<ImpaginazioneVersione>[]>(LS_IMPAG_VERSIONI, []), v])
    return v
  },
  async setValiditaImpaginazioneVersione(id: string, validoFino: string | null): Promise<void> {
    writeLs(LS_IMPAG_VERSIONI, read<WithPost<ImpaginazioneVersione>[]>(LS_IMPAG_VERSIONI, []).map(v => v.id === id ? { ...v, valido_fino: validoFino } : v))
  },
  async setValidoDaImpaginazioneVersione(id: string, validoDa: string): Promise<void> {
    writeLs(LS_IMPAG_VERSIONI, read<WithPost<ImpaginazioneVersione>[]>(LS_IMPAG_VERSIONI, []).map(v => v.id === id ? { ...v, valido_da: validoDa } : v))
  },
  async ultimaImpaginazioneConContenuto(postazioneId: string, primaDelMese: string): Promise<ImpaginazioneVersione | null> {
    const fogli = read<Foglio[]>(LS_FOGLI, [])
    const vers = read<WithPost<ImpaginazioneVersione>[]>(LS_IMPAG_VERSIONI, [])
      .filter(v => (v.postazione_id ?? DEV_POSTAZIONE) === postazioneId && v.valido_da < primaDelMese)
      .sort((a, b) => b.valido_da.localeCompare(a.valido_da))
    return vers.find(v => fogli.some(f => f.versione_id === v.id)) ?? null
  },
  async deleteImpaginazioneVersione(id: string): Promise<void> {
    writeLs(LS_IMPAG_VERSIONI, read<WithPost<ImpaginazioneVersione>[]>(LS_IMPAG_VERSIONI, []).filter(v => v.id !== id))
    writeLs(LS_FOGLI, read<Foglio[]>(LS_FOGLI, []).filter(f => f.versione_id !== id))
    writeLs(LS_FOGLIO_TURNI, read<FoglioTurno[]>(LS_FOGLIO_TURNI, []).filter(ft => ft.versione_id !== id))
  },
  async getFogli(versioneId: string): Promise<Foglio[]> {
    const arch = _archPerVersione.get(versioneId); if (arch) return [...((arch.fogli as Foglio[]) ?? [])].sort((a, b) => a.ordine - b.ordine)
    return read<Foglio[]>(LS_FOGLI, []).filter(f => f.versione_id === versioneId).slice().sort((a, b) => a.ordine - b.ordine)
  },
  async addFoglio(versioneId: string, nome: string): Promise<Foglio> {
    const list = read<Foglio[]>(LS_FOGLI, [])
    const ordine = list.filter(f => f.versione_id === versioneId).reduce((m, f) => Math.max(m, f.ordine), 0) + 10
    const f: Foglio = { id: uid(), versione_id: versioneId, nome, ordine, created_at: new Date().toISOString() }
    writeLs(LS_FOGLI, [...list, f])
    return f
  },
  async renameFoglio(id: string, nome: string): Promise<void> {
    writeLs(LS_FOGLI, read<Foglio[]>(LS_FOGLI, []).map(f => f.id === id ? { ...f, nome } : f))
  },
  async deleteFoglio(id: string): Promise<void> {
    writeLs(LS_FOGLI, read<Foglio[]>(LS_FOGLI, []).filter(f => f.id !== id))
    writeLs(LS_FOGLIO_TURNI, read<FoglioTurno[]>(LS_FOGLIO_TURNI, []).filter(ft => ft.foglio_id !== id))
  },
  async getFoglioTurni(versioneId: string): Promise<FoglioTurno[]> {
    const arch = _archPerVersione.get(versioneId); if (arch) return (arch.foglio_turni as FoglioTurno[]) ?? []
    return read<FoglioTurno[]>(LS_FOGLIO_TURNI, []).filter(ft => ft.versione_id === versioneId)
  },
  async setFoglioTurno(versioneId: string, turnoSchemaId: string, foglioId: string | null): Promise<void> {
    const list = read<FoglioTurno[]>(LS_FOGLIO_TURNI, []).filter(ft => !(ft.versione_id === versioneId && ft.turno_schema_id === turnoSchemaId))
    if (foglioId !== null) list.push({ versione_id: versioneId, turno_schema_id: turnoSchemaId, foglio_id: foglioId })
    writeLs(LS_FOGLIO_TURNI, list)
  },

  async getUtentiImpersonabili(): Promise<UtenteImpersonabile[]> {
    ensureSeed()
    const map = new Map<string, UtenteImpersonabile>()
    read<WithPost<Turnista>[]>(LS_TURNISTI, []).forEach(t => {
      const cur = map.get(t.utente_id)
      if (!cur || (RANK_LIVELLO[t.livello] ?? 0) > (RANK_LIVELLO[cur.livello] ?? 0)) {
        map.set(t.utente_id, { id: t.utente_id, nome: t.nome, cognome: t.cognome, email: t.email, livello: t.livello, postazioneId: t.postazione_id ?? null })
      }
    })
    return [...map.values()].sort((a, b) => `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`, 'it'))
  },

  async getUtenti(): Promise<UtenteAdmin[]> {
    ensureSeed()
    const extra = new Set(read<string[]>('gm_dev_admins', []))
    const map = new Map<string, UtenteAdmin>()
    read<WithPost<Turnista>[]>(LS_TURNISTI, []).forEach(t => {
      if (!map.has(t.utente_id)) map.set(t.utente_id, { id: t.utente_id, nome: t.nome, cognome: t.cognome, email: t.email, admin: t.email === ADMIN_EMAIL || extra.has(t.utente_id) })
    })
    read<UtenteAdmin[]>('gm_dev_extra_utenti', []).forEach(u => { if (!map.has(u.id)) map.set(u.id, { ...u, admin: u.admin || extra.has(u.id) }) })
    return [...map.values()].sort((a, b) => `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`, 'it'))
  },
  async setUtenteAdmin(utenteId: string, on: boolean): Promise<void> {
    const s = new Set(read<string[]>('gm_dev_admins', []))
    if (on) s.add(utenteId); else s.delete(utenteId)
    writeLs('gm_dev_admins', [...s])
  },
  async creaUtenteAdmin(nome: string, cognome: string, email: string): Promise<void> {
    const em = email.trim().toLowerCase()
    const inTurnisti = read<WithPost<Turnista>[]>(LS_TURNISTI, []).find(t => t.email.toLowerCase() === em)
    const extra = read<UtenteAdmin[]>('gm_dev_extra_utenti', [])
    const inExtra = extra.find(u => u.email.toLowerCase() === em)
    const existingId = inTurnisti?.utente_id ?? inExtra?.id
    if (existingId) {
      const s = new Set(read<string[]>('gm_dev_admins', [])); s.add(existingId); writeLs('gm_dev_admins', [...s]); return
    }
    extra.push({ id: uid(), nome: nome.trim(), cognome: cognome.trim(), email: em, admin: true })
    writeLs('gm_dev_extra_utenti', extra)
  },

  // ── Anagrafica Utenti (DEV) ── (sospesi in 'gm_utenti_sospesi')
  async getUtentiAnagrafica(search: string, offset: number, limit: number): Promise<{ rows: UtenteAnagrafica[]; total: number }> {
    ensureSeed()
    const adminSet = new Set(read<string[]>('gm_dev_admins', []))
    const sosp = new Set(read<string[]>('gm_utenti_sospesi', []))
    const supSet = new Set(read<{ utenteId: string }[]>('gm_dev_supervisori', []).map(s => s.utenteId))
    const best = new Map<string, string>()
    const base = new Map<string, { id: string; nome: string; cognome: string; email: string }>()
    read<WithPost<Turnista>[]>(LS_TURNISTI, []).forEach(t => {
      const id = t.utente_id ?? t.id
      const cur = best.get(id); if (!cur || (RANK_LIVELLO[t.livello] ?? 0) > (RANK_LIVELLO[cur] ?? 0)) best.set(id, t.livello)
      if (!base.has(id)) base.set(id, { id, nome: t.nome, cognome: t.cognome, email: t.email })
    })
    read<UtenteAdmin[]>('gm_dev_extra_utenti', []).forEach(u => { if (!base.has(u.id)) base.set(u.id, { id: u.id, nome: u.nome, cognome: u.cognome, email: u.email }) })
    const ruoloOf = (id: string, admin: boolean) => admin ? 'admin' : supSet.has(id) ? 'supervisore' : (best.get(id) ?? '—')
    let rows: UtenteAnagrafica[] = [...base.values()].map(x => { const admin = x.email === ADMIN_EMAIL || adminSet.has(x.id); return { ...x, admin, attivo: !sosp.has(x.id), ruolo: ruoloOf(x.id, admin) } })
    const s = search.trim().toLowerCase()
    if (s) rows = rows.filter(r => `${r.cognome} ${r.nome} ${r.email}`.toLowerCase().includes(s))
    rows.sort((a, b) => (RANK_RUOLO[b.ruolo] - RANK_RUOLO[a.ruolo]) || `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`, 'it'))
    return { rows: rows.slice(offset, offset + limit), total: rows.length }
  },
  async getMembershipUtente(utenteId: string): Promise<MembershipUtente[]> {
    const posts = read<Postazione[]>(LS_POSTAZIONI, [])
    return read<WithPost<Turnista>[]>(LS_TURNISTI, []).filter(t => (t.utente_id ?? t.id) === utenteId)
      .map(t => { const pid = t.postazione_id ?? DEV_POSTAZIONE; return { membershipId: t.id, postazioneId: pid, postazioneNome: posts.find(p => p.id === pid)?.nome ?? '—', livello: t.livello } })
      .sort((a, b) => a.postazioneNome.localeCompare(b.postazioneNome, 'it'))
  },
  async setUtenteAttivo(utenteId: string, attivo: boolean): Promise<void> {
    const s = new Set(read<string[]>('gm_utenti_sospesi', []))
    if (attivo) s.delete(utenteId); else s.add(utenteId)
    writeLs('gm_utenti_sospesi', [...s])
  },
  async eliminaUtenteDefinitivo(utenteId: string): Promise<void> {
    const memberships = read<WithPost<Turnista>[]>(LS_TURNISTI, []).filter(t => (t.utente_id ?? t.id) === utenteId)
    for (const m of memberships) if (await localStore.turnistaHaStorico(m.id)) throw new Error('Ha turni, desiderata o fa parte del personale di uno o più mesi: non è eliminabile (si creerebbero buchi nello storico). Puoi sospenderlo per togliergli l’accesso mantenendo lo storico.')
    writeLs(LS_TURNISTI, read<WithPost<Turnista>[]>(LS_TURNISTI, []).filter(t => (t.utente_id ?? t.id) !== utenteId))
    writeLs('gm_dev_extra_utenti', read<UtenteAdmin[]>('gm_dev_extra_utenti', []).filter(u => u.id !== utenteId))
    const sosp = new Set(read<string[]>('gm_utenti_sospesi', [])); sosp.delete(utenteId); writeLs('gm_utenti_sospesi', [...sosp])
  },
  async aggiornaUtente(utenteId: string, patch: { nome: string; cognome: string; email: string }): Promise<void> {
    const nome = patch.nome.trim(), cognome = patch.cognome.trim(), email = patch.email.trim().toLowerCase()
    writeLs(LS_TURNISTI, read<WithPost<Turnista>[]>(LS_TURNISTI, []).map(t => (t.utente_id ?? t.id) === utenteId ? { ...t, nome: nome || t.nome, cognome, email: email || t.email } : t))
    writeLs('gm_dev_extra_utenti', read<UtenteAdmin[]>('gm_dev_extra_utenti', []).map(u => u.id === utenteId ? { ...u, nome: nome || u.nome, cognome, email: email || u.email } : u))
  },

  // ── Supervisori (DEV) ──
  async getSupervisori(): Promise<Supervisore[]> {
    ensureSeed()
    const sup = read<{ utenteId: string; tuttePostazioni: boolean; postazioni: string[] }[]>('gm_dev_supervisori', [])
    const nameMap = new Map<string, { nome: string; cognome: string; email: string }>()
    read<WithPost<Turnista>[]>(LS_TURNISTI, []).forEach(t => { if (!nameMap.has(t.utente_id)) nameMap.set(t.utente_id, { nome: t.nome, cognome: t.cognome, email: t.email }) })
    read<UtenteAdmin[]>('gm_dev_extra_utenti', []).forEach(u => { if (!nameMap.has(u.id)) nameMap.set(u.id, { nome: u.nome, cognome: u.cognome, email: u.email }) })
    return sup.map(s => ({ id: s.utenteId, nome: nameMap.get(s.utenteId)?.nome ?? '', cognome: nameMap.get(s.utenteId)?.cognome ?? '', email: nameMap.get(s.utenteId)?.email ?? '', tuttePostazioni: s.tuttePostazioni, postazioni: s.postazioni }))
      .sort((a, b) => `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`, 'it'))
  },
  async addSupervisore(utenteId: string): Promise<void> {
    const sup = read<{ utenteId: string; tuttePostazioni: boolean; postazioni: string[] }[]>('gm_dev_supervisori', [])
    if (!sup.some(s => s.utenteId === utenteId)) sup.push({ utenteId, tuttePostazioni: false, postazioni: [] })
    writeLs('gm_dev_supervisori', sup)
  },
  async removeSupervisore(utenteId: string): Promise<void> {
    writeLs('gm_dev_supervisori', read<{ utenteId: string }[]>('gm_dev_supervisori', []).filter(s => s.utenteId !== utenteId))
  },
  async setSupervisoreTutte(utenteId: string, tutte: boolean): Promise<void> {
    const sup = read<{ utenteId: string; tuttePostazioni: boolean; postazioni: string[] }[]>('gm_dev_supervisori', [])
    const s = sup.find(x => x.utenteId === utenteId); if (s) s.tuttePostazioni = tutte
    writeLs('gm_dev_supervisori', sup)
  },
  async setSupervisorePostazioni(utenteId: string, postazioniIds: string[]): Promise<void> {
    const sup = read<{ utenteId: string; tuttePostazioni: boolean; postazioni: string[] }[]>('gm_dev_supervisori', [])
    const s = sup.find(x => x.utenteId === utenteId); if (s) s.postazioni = postazioniIds
    writeLs('gm_dev_supervisori', sup)
  },
  async creaUtenteSupervisore(nome: string, cognome: string, email: string): Promise<void> {
    const em = email.trim().toLowerCase()
    const inTurnisti = read<WithPost<Turnista>[]>(LS_TURNISTI, []).find(t => t.email.toLowerCase() === em)
    const extra = read<UtenteAdmin[]>('gm_dev_extra_utenti', [])
    let id = inTurnisti?.utente_id ?? extra.find(u => u.email.toLowerCase() === em)?.id
    if (!id) { id = uid(); extra.push({ id, nome: nome.trim(), cognome: cognome.trim(), email: em, admin: false }); writeLs('gm_dev_extra_utenti', extra) }
    const sup = read<{ utenteId: string; tuttePostazioni: boolean; postazioni: string[] }[]>('gm_dev_supervisori', [])
    if (!sup.some(s => s.utenteId === id)) { sup.push({ utenteId: id, tuttePostazioni: false, postazioni: [] }); writeLs('gm_dev_supervisori', sup) }
  },

  // ── Notifiche (DEV) ──
  async addNotifica(n: AddNotifica): Promise<void> {
    const list = read<Notifica[]>('gm_notifiche', [])
    list.push({ id: uid(), postazioneId: n.postazioneId, mese: n.mese, tipo: n.tipo, messaggio: n.messaggio, target: n.target ?? null, perAdmin: n.perAdmin ?? false, turnistaId: n.turnistaId ?? null, autore: n.autore ?? _autoreCorrente, letta: false, created_at: new Date().toISOString() })
    writeLs('gm_notifiche', list)
  },
  async getNotificheAdmin(postazioneId: string): Promise<Notifica[]> {
    return read<Notifica[]>('gm_notifiche', []).filter(n => (n.postazioneId ?? DEV_POSTAZIONE) === postazioneId && n.perAdmin).sort((a, b) => b.created_at.localeCompare(a.created_at))
  },
  async getNotificheUtente(turnistaIds: string[]): Promise<Notifica[]> {
    const s = new Set(turnistaIds)
    return read<Notifica[]>('gm_notifiche', []).filter(n => n.turnistaId && s.has(n.turnistaId)).sort((a, b) => b.created_at.localeCompare(a.created_at))
  },
  async getRichiesteUtente(turnistaIds: string[]): Promise<CandidaturaAttesa[]> {
    const s = new Set(turnistaIds)
    const schema = read<TurnoSchema[]>(LS_SCHEMA, []), post = read<Postazione[]>(LS_POSTAZIONI, [])
    return read<WithPost<RichiestaTurno>[]>(LS_RICHIESTE, [])
      .filter(r => s.has(r.turnista_id) && (r.stato ?? 'in_attesa') === 'in_attesa')
      .map(r => ({ id: r.id, data: r.data, postazioneId: r.postazione_id ?? DEV_POSTAZIONE, turnoSchemaId: r.turno_schema_id, turnistaId: r.turnista_id, turnoNome: schema.find(x => x.id === r.turno_schema_id)?.nome ?? 'Turno', postazioneNome: post.find(p => p.id === (r.postazione_id ?? DEV_POSTAZIONE))?.nome ?? '' }))
  },
  async marcaNotificheLette(ids: string[]): Promise<void> {
    const set = new Set(ids)
    writeLs('gm_notifiche', read<Notifica[]>('gm_notifiche', []).map(n => set.has(n.id) ? { ...n, letta: true } : n))
  },
  async eliminaNotifica(id: string): Promise<void> {
    writeLs('gm_notifiche', read<Notifica[]>('gm_notifiche', []).filter(n => n.id !== id))
  },
  async cleanupNotifiche(_postazioneId: string): Promise<void> {
    const limite = new Date(Date.now() - 30 * 86400000).toISOString()
    writeLs('gm_notifiche', read<Notifica[]>('gm_notifiche', []).filter(n => !(n.letta && n.created_at < limite)))
  },

  // ── Log Postazioni (DEV) ──
  async addLogPostazione(messaggio: string, autore?: string | null): Promise<void> {
    const list = read<LogPostazione[]>('gm_log_postazioni', [])
    list.push({ id: uid(), messaggio, autore: autore ?? _autoreCorrente, createdAt: new Date().toISOString() })
    writeLs('gm_log_postazioni', list)
  },
  async getLogPostazioni(): Promise<LogPostazione[]> {
    return read<LogPostazione[]>('gm_log_postazioni', []).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100)
  },
}

// ────────────────────────────────────────────────────────────────
export const store = isSupabaseConfigured ? supaStore : localStore
export type { Ricorrenza }
