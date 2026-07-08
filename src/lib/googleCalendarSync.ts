/**
 * googleCalendarSync — sincronizzazione dei turni del turnista loggato con il
 * suo Google Calendar (l'account Google usato per il login).
 *
 * Architettura: 100% client-side (siamo su GitHub Pages, niente backend).
 *   1. Google Identity Services (GIS) → token OAuth on-demand (~1h) con scope
 *      calendario: l'app tocca SOLO il calendario che crea lei (nome = postazione)
 *      e SOLO gli eventi che ha taggato come propri (app=guardia). Gli eventi
 *      personali del turnista restano invisibili e intoccabili.
 *   2. Google Calendar REST API per creare il calendario + diff degli eventi.
 *
 * Sync intelligente e PER-MESE: si sincronizza SOLO il mese visualizzato. Ogni
 * evento ha un ID DETERMINISTICO derivato da (turnista, data, turno). Ad ogni
 * sincronizzazione si confronta lo stato desiderato del mese con gli eventi
 * gestiti già presenti:
 *   - turno nuovo               → crea
 *   - turno modificato          → aggiorna (confronto via "signature")
 *   - turno del mese sparito     → elimina
 *   - turno identico            → NON tocca (zero chiamate API)
 * Gli eventi di ALTRI mesi non vengono mai toccati: sincronizzare Luglio non
 * cancella Agosto. Così cambi turno e cancellazioni si riflettono senza
 * distruggere e ricreare tutto.
 *
 * Setup richiesto (lato Google Cloud, una volta):
 *   - progetto Google Cloud (lo stesso del login Google va bene)
 *   - Calendar API abilitata
 *   - OAuth Client ID (Web) con origine JS = https://gmedicaguidonia-prog.github.io
 *   - scope calendario nella schermata consenso + app PUBBLICATA
 *   - Client ID nel secret VITE_GOOGLE_OAUTH_CLIENT_ID (build env)
 */

import type { Turno, TurnoSchema } from '../types'

// Client ID OAuth (pubblico, sicuro nel bundle). Vuoto finché non configurato
// → la UI mostra un avviso "funzione non ancora attiva".
export const GOOGLE_OAUTH_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined) ?? ''

// Scope completo calendario: necessario per impostare il COLORE del calendario
// (calendarList.patch), oltre a creare il calendario e gestirne gli eventi.
// Operiamo comunque solo sul calendario della postazione e sugli eventi taggati
// app=guardia: gli altri eventi/calendari non vengono mai toccati.
const SCOPE = 'https://www.googleapis.com/auth/calendar'

const CAL_API = 'https://www.googleapis.com/calendar/v3'
const CAL_FALLBACK = 'TURNI'
const TZ = 'Europe/Rome'
const APP_TAG = 'guardia'                             // tag privato sugli eventi gestiti
const LS_CAL_HINT  = 'gm_gcal_id'                     // hint localStorage (PREFISSO; + _<postazioneId>)
const LS_CAL_COLOR = 'gm_gcal_color'                  // ultimo colorId turni

/** Chiave hint per-POSTAZIONE: ogni postazione ha il proprio calendario (nome =
 *  nome della postazione) e quindi il proprio hint → calendari Google distinti. */
function hintKeyFor(postazioneId: string): string {
  return postazioneId ? `${LS_CAL_HINT}_${postazioneId}` : LS_CAL_HINT
}

// ── Palette colori EVENTI di Google Calendar (colorId 1-11) ─────────
// I turni vengono colorati impostando event.colorId: i colori sono quelli reali
// di Google Calendar, quindi lo swatch scelto coincide ESATTAMENTE col colore
// dei turni sul calendario.
export interface CalColor { colorId: string; hex: string; nome: string }
export const CAL_COLORS: CalColor[] = [
  { colorId: '7',  hex: '#039be5', nome: 'Pavone' },
  { colorId: '9',  hex: '#3f51b5', nome: 'Mirtillo' },
  { colorId: '1',  hex: '#7986cb', nome: 'Lavanda' },
  { colorId: '10', hex: '#0b8043', nome: 'Basilico' },
  { colorId: '2',  hex: '#33b679', nome: 'Salvia' },
  { colorId: '5',  hex: '#f6bf26', nome: 'Banana' },
  { colorId: '6',  hex: '#f4511e', nome: 'Mandarino' },
  { colorId: '11', hex: '#d50000', nome: 'Pomodoro' },
  { colorId: '4',  hex: '#e67c73', nome: 'Salmone' },
  { colorId: '3',  hex: '#8e24aa', nome: 'Uva' },
  { colorId: '8',  hex: '#616161', nome: 'Grafite' },
]

/** Hex corrispondente a un colorId evento (preview + best-effort calendar bg). */
function hexForColorId(colorId: string): string {
  return CAL_COLORS.find(c => c.colorId === colorId)?.hex ?? CAL_COLORS[0].hex
}

/** Salva l'ultimo colorId scelto, per pre-selezionarlo nel modal. */
function saveColor(colorId: string | undefined): void {
  if (!colorId) return
  try { localStorage.setItem(LS_CAL_COLOR, colorId) } catch { /* ignore */ }
}
/** Legge l'ultimo colorId scelto (o null). */
export function getSavedCalendarColor(): string | null {
  try { return localStorage.getItem(LS_CAL_COLOR) } catch { return null }
}

// ════════════════════════════════════════════════════════════════════
// Google Identity Services (token client)
// ════════════════════════════════════════════════════════════════════

interface TokenClient {
  requestAccessToken: (opts?: { prompt?: string }) => void
}
interface GoogleOAuth2 {
  initTokenClient: (cfg: {
    client_id: string
    scope: string
    callback: (resp: { access_token?: string; error?: string }) => void
    error_callback?: (err: { type?: string; message?: string }) => void
  }) => TokenClient
}
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } }
  }
}

let gisLoading: Promise<void> | null = null
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (gisLoading) return gisLoading
  gisLoading = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Impossibile caricare Google Identity Services'))
    document.head.appendChild(s)
  })
  return gisLoading
}

/** Richiede un access token Google per lo scope calendario. Apre il popup di
 *  consenso (la prima volta) o restituisce un token al volo se già autorizzato. */
export async function requestCalendarToken(clientId: string): Promise<string> {
  if (!clientId) throw new Error('Client ID Google non configurato')
  await loadGis()
  const oauth2 = window.google?.accounts?.oauth2
  if (!oauth2) throw new Error('Google Identity Services non disponibile')

  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.access_token) resolve(resp.access_token)
        else reject(new Error(resp.error || 'Autorizzazione negata'))
      },
      error_callback: (err) => {
        reject(new Error(err.message || err.type || 'Autorizzazione annullata'))
      },
    })
    client.requestAccessToken({ prompt: '' })
  })
}

// ════════════════════════════════════════════════════════════════════
// REST helper (con retry/backoff sui rate limit)
// ════════════════════════════════════════════════════════════════════

const MAX_RETRY = 6
function sleep(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)) }

async function gcal<T = unknown>(
  token: string, method: string, path: string, body?: unknown, attempt = 0,
): Promise<T> {
  const res = await fetch(`${CAL_API}${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    // Errori transitori → retry con backoff esponenziale + jitter. Google limita
    // le scritture in burst sullo stesso calendario (specie se appena creato):
    // risponde 403 rateLimitExceeded o 429. Si risolve riprovando con attese crescenti.
    const transient =
      res.status === 429 ||
      res.status >= 500 ||
      (res.status === 403 && /rate ?limit|userratelimit|quota/i.test(txt))
    if (transient && attempt < MAX_RETRY) {
      const delay = Math.min(30000, 800 * 2 ** attempt) + Math.floor(Math.random() * 400)
      await sleep(delay)
      return gcal<T>(token, method, path, body, attempt + 1)
    }
    throw new Error(`Google Calendar ${method} ${path.split('?')[0]} → HTTP ${res.status} ${txt.slice(0, 120)}`)
  }
  if (res.status === 204) return undefined as T   // DELETE risponde 204 senza body
  return res.json() as Promise<T>
}

// ════════════════════════════════════════════════════════════════════
// Calendario della postazione: find or create + colore
// ════════════════════════════════════════════════════════════════════

interface CalListResp { items?: Array<{ id: string; summary?: string }> }

/** Testo leggibile (bianco/scuro) sul colore di sfondo, in base alla luminanza. */
function readableForeground(hex: string): string {
  const h = hex.replace('#', '')
  if (h.length < 6) return '#1d1d1d'
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#1d1d1d' : '#ffffff'
}

// Errore sentinella: il calendario non esiste più (es. eliminato a mano su
// Google Calendar). Il chiamante lo intercetta, ricrea il calendario e riprova.
function calendarGone(): Error { return new Error('CALENDAR_GONE') }
function isCalendarGone(e: unknown): boolean { return e instanceof Error && e.message === 'CALENDAR_GONE' }

async function applyColor(token: string, calId: string, colorId: string): Promise<void> {
  if (!colorId) return
  const hex = hexForColorId(colorId)
  try {
    await gcal(
      token, 'PATCH',
      `/users/me/calendarList/${encodeURIComponent(calId)}?colorRgbFormat=true`,
      { backgroundColor: hex, foregroundColor: readableForeground(hex) },
    )
  } catch { /* colore del calendario non applicabile con lo scope corrente */ }
}

async function findOrCreateCalendar(token: string, colorId: string, calSummary: string, hintK: string, forceCreate = false): Promise<string> {
  // Il calendario si chiama come la POSTAZIONE (calSummary). Ogni postazione ha il
  // suo calendario e il suo hint (hintK) → mondi separati su Google Calendar.
  // forceCreate=true: salta l'hint (può puntare a un calendario eliminato).

  // 1) hint da localStorage (re-sync sullo stesso dispositivo, per-postazione)
  if (!forceCreate) try {
    const hint = localStorage.getItem(hintK)
    if (hint) {
      try {
        await gcal(token, 'GET', `/calendars/${encodeURIComponent(hint)}`)
        await applyColor(token, hint, colorId)
        saveColor(colorId)
        return hint
      } catch { localStorage.removeItem(hintK) }   // calendario eliminato a mano
    }
  } catch { /* localStorage non disponibile */ }

  // 2) scan della lista calendari: cerca quello col NOME della postazione.
  try {
    const list = await gcal<CalListResp>(token, 'GET', '/users/me/calendarList?maxResults=250')
    const found = list.items?.find(c => c.summary === calSummary)
    if (found) {
      try { localStorage.setItem(hintK, found.id) } catch { /* ignore */ }
      await applyColor(token, found.id, colorId)
      saveColor(colorId)
      return found.id
    }
  } catch { /* calendarList non accessibile: procedo a creare */ }

  // 3) crea il calendario col NOME della postazione
  const created = await gcal<{ id: string }>(token, 'POST', '/calendars', {
    summary: calSummary,
    timeZone: TZ,
    description: 'Turni di servizio — sincronizzati automaticamente dall\'app Guardia Medica. ' +
      'Non modificare manualmente: gli eventi vengono sovrascritti ad ogni sincronizzazione.',
  })
  try { localStorage.setItem(hintK, created.id) } catch { /* ignore */ }
  await applyColor(token, created.id, colorId)
  saveColor(colorId)
  return created.id
}

// ════════════════════════════════════════════════════════════════════
// Eventi: build desiderati (del mese) + lettura esistenti + diff
// ════════════════════════════════════════════════════════════════════

/** Aggiunge (o sottrae, con delta negativo) giorni a una data ISO 'YYYY-MM-DD'. */
function addGiorno(iso: string, delta = 1): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + delta)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** Datetime che precede di `mins` minuti l'orario `endTime` del giorno `endDate`.
 *  Ritorna [dataISO, 'HH:MM'] gestendo l'eventuale rientro al giorno precedente. */
function primaDi(endDate: string, endTime: string, mins: number): [string, string] {
  const [hh, mm] = endTime.split(':').map(Number)
  let tot = hh * 60 + mm - mins
  let date = endDate
  if (tot < 0) { tot += 1440; date = addGiorno(endDate, -1) }
  return [date, `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`]
}

interface Desiderato {
  id: string; date: string; mese: string; startDT: string; endDT: string
  title: string; sig: string; colorId: string
}

/** Costruisce gli eventi desiderati del MESE per il turnista: uno o più eventi per
 *  ogni turno assegnato, con orario/nome presi dallo schema turni.
 *
 *  Regola turni A CAVALLO del giorno (es. 20:00→08:00):
 *   - turno NORMALE → DUE eventi: parte 1 (inizio→mezzanotte) col nome del turno,
 *     e parte 2 "Smonto <nome>" (due ore prima della fine → fine) il giorno dopo,
 *     così si capisce che è la coda del turno iniziato il giorno prima;
 *   - REPERIBILITÀ → UN solo evento continuo (inizio→fine), senza seconda parte.
 *  `mese` (il mese del turno) va tra le proprietà private così la cancellazione
 *  per-mese non elimina lo "Smonto" che cade nel mese successivo. IDs deterministici
 *  base32hex (0-9 a-v): prefisso trn/rep/smo + turnista + data + turno (no trattini). */
function buildDesiderati(
  turni: Turno[], schemaById: Map<string, TurnoSchema>, turnistaId: string, colorId: string,
): Map<string, Desiderato> {
  const m = new Map<string, Desiderato>()
  const put = (d: Desiderato) => m.set(d.id, d)
  for (const t of turni) {
    if (t.turnista_id !== turnistaId) continue
    const sc = schemaById.get(t.turno_schema_id)
    if (!sc) continue
    const rep = t.slot < 0
    const nome = sc.nome || 'Turno'
    const mese = t.data.slice(0, 7)
    const overnight = sc.ora_fine <= sc.ora_inizio
    const base = `${turnistaId.replace(/-/g, '').toLowerCase()}${t.data.replace(/-/g, '')}${t.turno_schema_id.replace(/-/g, '').toLowerCase()}`

    if (rep || !overnight) {
      // Reperibilità (anche a cavallo: resta un unico evento) o turno nello stesso giorno.
      const endDay = overnight ? addGiorno(t.data) : t.data
      put({
        id: `${rep ? 'rep' : 'trn'}${base}`, date: t.data, mese,
        startDT: `${t.data}T${sc.ora_inizio}:00`,
        endDT:   `${endDay}T${sc.ora_fine}:00`,
        title:   rep ? `${nome} (reperibilità)` : nome,
        colorId, sig: `${rep ? 'rep' : 'one'}|${nome}|${sc.ora_inizio}|${sc.ora_fine}|c${colorId}`,
      })
    } else {
      // Turno normale a cavallo del giorno → due parti.
      const nextDay = addGiorno(t.data)
      put({   // parte 1: inizio → mezzanotte
        id: `trn${base}`, date: t.data, mese,
        startDT: `${t.data}T${sc.ora_inizio}:00`,
        endDT:   `${nextDay}T00:00:00`,
        title:   nome,
        colorId, sig: `p1|${nome}|${sc.ora_inizio}|c${colorId}`,
      })
      const [s2date, s2time] = primaDi(nextDay, sc.ora_fine, 120)   // due ore prima della fine
      put({   // parte 2: "Smonto" — coda del turno, il giorno dopo
        id: `smo${base}`, date: s2date, mese,
        startDT: `${s2date}T${s2time}:00`,
        endDT:   `${nextDay}T${sc.ora_fine}:00`,
        title:   `Smonto ${nome}`,
        colorId, sig: `smo|${nome}|${s2time}|${sc.ora_fine}|c${colorId}`,
      })
    }
  }
  return m
}

function eventBody(d: Desiderato) {
  return {
    id: d.id,
    summary: d.title,
    colorId: d.colorId,
    start: { dateTime: d.startDT, timeZone: TZ },
    end:   { dateTime: d.endDT,   timeZone: TZ },
    extendedProperties: { private: { app: APP_TAG, sig: d.sig, mese: d.mese } },
    reminders: { useDefault: false },   // niente promemoria pop-up per i turni
  }
}

interface GEvent {
  id: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  extendedProperties?: { private?: { sig?: string; mese?: string } }
}
interface EventsResp { items?: GEvent[]; nextPageToken?: string }

/** Legge SOLO gli eventi gestiti dall'app (tag privateExtendedProperty
 *  app=guardia), così non tocchiamo eventi aggiunti a mano dal turnista.
 *  Ritorna tutti i mesi: il diff limiterà le CANCELLAZIONI al mese in corso. */
async function listManagedEvents(token: string, calId: string): Promise<Map<string, GEvent>> {
  const map = new Map<string, GEvent>()
  let pageToken: string | undefined
  do {
    const qs = new URLSearchParams({
      privateExtendedProperty: `app=${APP_TAG}`,
      singleEvents: 'true',
      showDeleted: 'false',
      maxResults: '2500',
    })
    if (pageToken) qs.set('pageToken', pageToken)
    let res: EventsResp
    try {
      res = await gcal<EventsResp>(token, 'GET', `/calendars/${encodeURIComponent(calId)}/events?${qs}`)
    } catch (e) {
      if (/HTTP 404/.test((e as Error).message)) throw calendarGone()   // il calendario non esiste più
      throw e
    }
    for (const ev of res.items ?? []) map.set(ev.id, ev)
    pageToken = res.nextPageToken
  } while (pageToken)
  return map
}

/** Mese ('YYYY-MM') di appartenenza di un evento gestito: il tag privato `mese`
 *  (= mese del turno) così lo "Smonto" che cade nel mese dopo resta legato al suo
 *  mese e NON viene cancellato sincronizzando quello successivo. Fallback allo
 *  start per eventuali eventi vecchi senza il tag. */
function meseDiEvento(ev: GEvent): string {
  return ev.extendedProperties?.private?.mese ?? (ev.start?.dateTime ?? ev.start?.date ?? '').slice(0, 7)
}

// ── Pool di concorrenza per non saturare l'API ─────────────────────
async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx]) }
  })
  await Promise.all(workers)
}

// ════════════════════════════════════════════════════════════════════
// API pubblica
// ════════════════════════════════════════════════════════════════════

export type SyncPhase = 'auth' | 'calendar' | 'reading' | 'writing' | 'done'
export interface SyncProgress { phase: SyncPhase; done?: number; total?: number }
export interface SyncResult { calendarId: string; created: number; updated: number; deleted: number; unchanged: number }

export async function syncToGoogleCalendar(opts: {
  clientId: string
  turnistaId: string
  /** Mese da sincronizzare ('YYYY-MM'): SOLO questo mese viene toccato. */
  mese: string
  /** Turni del mese (di tutti i turnisti: filtriamo noi per turnistaId). */
  turni: Turno[]
  /** Schema turni (per ricavare orario e nome di ogni turno). */
  schema: TurnoSchema[]
  colorId: string
  /** Nome della postazione → nome del calendario Google (uno per postazione). */
  postazioneNome: string
  /** Id della postazione → chiave hint localStorage per-postazione. */
  postazioneId: string
  onProgress?: (p: SyncProgress) => void
}): Promise<SyncResult> {
  const { clientId, turnistaId, mese, turni, schema, colorId, postazioneNome, postazioneId, onProgress } = opts

  onProgress?.({ phase: 'auth' })
  const token = await requestCalendarToken(clientId)

  // Prova la sincronizzazione. Se durante l'operazione si scopre che il calendario
  // non esiste più (eliminato a mano → CALENDAR_GONE), si azzera l'hint, si ricrea
  // il calendario da zero e si riprova UNA volta.
  try {
    return await runSyncOnce(token, turnistaId, mese, turni, schema, colorId, postazioneNome, postazioneId, false, onProgress)
  } catch (e) {
    if (isCalendarGone(e)) {
      try { localStorage.removeItem(hintKeyFor(postazioneId)) } catch { /* ignore */ }
      return await runSyncOnce(token, turnistaId, mese, turni, schema, colorId, postazioneNome, postazioneId, true, onProgress)
    }
    throw e
  }
}

async function runSyncOnce(
  token: string, turnistaId: string, mese: string, turni: Turno[], schema: TurnoSchema[],
  colorId: string, postazioneNome: string, postazioneId: string, forceCreate: boolean,
  onProgress?: (p: SyncProgress) => void,
): Promise<SyncResult> {
  onProgress?.({ phase: 'calendar' })
  const calId = await findOrCreateCalendar(token, colorId, postazioneNome || CAL_FALLBACK, hintKeyFor(postazioneId), forceCreate)

  onProgress?.({ phase: 'reading' })
  // Se appena ricreato (forceCreate) la lista è vuota → tutto da creare.
  const existing = forceCreate ? new Map<string, GEvent>() : await listManagedEvents(token, calId)
  const schemaById = new Map(schema.map(s => [s.id, s]))
  const desired = buildDesiderati(turni, schemaById, turnistaId, colorId)

  // ── Diff (le CANCELLAZIONI sono limitate al MESE in corso) ──────────
  const toCreate: Desiderato[] = []
  const toUpdate: Desiderato[] = []
  const toDelete: string[] = []

  for (const [id, d] of desired) {
    const ex = existing.get(id)
    if (!ex) toCreate.push(d)
    else if (ex.extendedProperties?.private?.sig !== d.sig || ex.summary !== d.title) toUpdate.push(d)
    // identico → niente
  }
  for (const [id, ev] of existing) {
    // elimina SOLO gli eventi gestiti di QUESTO mese non più desiderati:
    // gli eventi degli altri mesi restano intatti.
    if (meseDiEvento(ev) === mese && !desired.has(id)) toDelete.push(id)
  }

  // ── Esecuzione con progress ────────────────────────────────────────
  const total = toCreate.length + toUpdate.length + toDelete.length
  let done = 0
  const tick = () => { done++; onProgress?.({ phase: 'writing', done, total }) }
  onProgress?.({ phase: 'writing', done: 0, total })

  const eventsPath = `/calendars/${encodeURIComponent(calId)}/events`

  const createEvent = async (d: Desiderato) => {
    try {
      await gcal(token, 'POST', eventsPath, eventBody(d))
    } catch (e) {
      const msg = (e as Error).message
      if (/HTTP 409/.test(msg)) await gcal(token, 'PUT', `${eventsPath}/${d.id}`, eventBody(d))   // id già esistente → update
      else if (/HTTP 404/.test(msg)) throw calendarGone()
      else throw e
    }
  }

  const WRITE_CONCURRENCY = 2   // basso, per non saturare il rate limit di scrittura
  await pool(toCreate, WRITE_CONCURRENCY, async d => { await createEvent(d); tick() })
  await pool(toUpdate, WRITE_CONCURRENCY, async d => {
    try {
      await gcal(token, 'PUT', `${eventsPath}/${d.id}`, eventBody(d))
    } catch (e) {
      if (/HTTP 404/.test((e as Error).message)) await createEvent(d)   // evento sparito → lo ricreo
      else throw e
    }
    tick()
  })
  await pool(toDelete, WRITE_CONCURRENCY, async id => {
    try {
      await gcal(token, 'DELETE', `${eventsPath}/${id}`)
    } catch (e) {
      if (!/HTTP 4(04|10)/.test((e as Error).message)) throw e   // 404/410 = già eliminato → ok
    }
    tick()
  })

  onProgress?.({ phase: 'done' })
  return {
    calendarId: calId,
    created: toCreate.length,
    updated: toUpdate.length,
    deleted: toDelete.length,
    unchanged: desired.size - toCreate.length - toUpdate.length,
  }
}
