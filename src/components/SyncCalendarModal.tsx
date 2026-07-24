/**
 * SyncCalendarModal
 *
 * Modal "Sincronizza Calendario" per i turnisti. Sincronizza i turni del MESE
 * visualizzato del turnista loggato con un calendario (nome = postazione) sul
 * suo Google Calendar (account usato per il login).
 *
 * Flusso:
 *   1. intro  → spiegazione + scelta colore; se nel mese ci sono TURNI A CAVALLO
 *      della mezzanotte il pulsante è «Continua» → step config; altrimenti
 *      «Sincronizza» diretto.
 *   1b. config → per ogni TIPO di turno notturno il turnista sceglie come
 *      rappresentarlo: SINGOLA fascia (un evento nel giorno del turno, default
 *      inizio→22:00) o DOPPIA fascia (in più una riga il giorno dopo, default
 *      2 ore prima della fine→fine, nome libero "Smonto <turno>"). La scelta è
 *      salvata sul profilo (utenti.cal_notte): risincronizzando dopo un cambio
 *      di idea gli eventi esistenti vengono AGGIORNATI (mai doppioni, gli ID
 *      degli eventi non dipendono dalla modalità).
 *   2. syncing→ popup consenso Google + creazione calendario + diff eventi
 *   3. done   → riepilogo (creati/aggiornati/eliminati/invariati) + link
 *   error     → messaggio + "Riprova"
 *
 * Vedi src/lib/googleCalendarSync.ts per la logica (diff intelligente e
 * per-mese: tocca solo i turni cambiati, non tocca gli altri mesi).
 */

import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck, X, Loader2, Check, AlertTriangle, ExternalLink, MoonStar, ChevronLeft, ChevronRight } from 'lucide-react'
import { store } from '../lib/store'
import type { Turno, TurnoSchema } from '../types'
import {
  syncToGoogleCalendar, GOOGLE_OAUTH_CLIENT_ID, CAL_COLORS, getSavedCalendarColor,
  tipiNotteDelMese, defaultConfigNotte,
  type SyncProgress, type SyncResult, type ConfigNotte, type ConfigNotteTipo, type TipoNotte,
} from '../lib/googleCalendarSync'

const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
function meseLabel(mese: string): string { const [a, m] = mese.split('-').map(Number); return `${MESI[m - 1]} ${a}` }

interface Props {
  turnistaId: string
  /** Mese da sincronizzare ('YYYY-MM'). */
  mese: string
  /** Turni del mese (di tutti: il turnista viene filtrato nella sync). */
  turni: Turno[]
  /** Schema turni (orario e nome di ogni turno). */
  schema: TurnoSchema[]
  postazioneNome: string
  postazioneId: string
  onClose: () => void
}

type Step = 'intro' | 'config' | 'syncing' | 'done' | 'error'

const PHASE_LABEL: Record<SyncProgress['phase'], string> = {
  auth:     'Autorizzazione Google…',
  calendar: 'Preparazione calendario della postazione…',
  reading:  'Lettura turni già presenti…',
  writing:  'Aggiornamento turni…',
  done:     'Completato',
}

/** true se 'HH:MM' a < b (confronto lessicografico, valido per il formato). */
const primaDiOra = (a: string, b: string) => !!a && !!b && a < b

export function SyncCalendarModal({ turnistaId, mese, turni, schema, postazioneNome, postazioneId, onClose }: Props) {
  const [step, setStep]         = useState<Step>('intro')
  // Pre-seleziona il colore già scelto all'ultima sincronizzazione; fallback al primo.
  const [colorId, setColorId]   = useState<string>(() => {
    const saved = getSavedCalendarColor()
    return saved && CAL_COLORS.some(c => c.colorId === saved) ? saved : CAL_COLORS[0].colorId
  })
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [result, setResult]     = useState<SyncResult | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const configured = !!GOOGLE_OAUTH_CLIENT_ID
  const nTurni = turni.filter(t => t.turnista_id === turnistaId).length
  const haDati = nTurni > 0

  // ── Turni a cavallo della mezzanotte nel mese (del turnista) ──
  const tipiNotte = useMemo(() => tipiNotteDelMese(turni, schema, turnistaId), [turni, schema, turnistaId])
  const serveConfig = tipiNotte.length > 0

  // Config salvata sul profilo (per precompilare le schede) + form di modifica.
  const [cfgSalvata, setCfgSalvata] = useState<ConfigNotte | null>(null)   // null = in caricamento
  const [form, setForm] = useState<Record<string, ConfigNotteTipo>>({})
  useEffect(() => {
    let via = false
    store.getCalNotte().then(c => { if (!via) setCfgSalvata(c ?? {}) }).catch(() => { if (!via) setCfgSalvata({}) })
    return () => { via = true }
  }, [])

  function apriConfig() {
    // precompila: config salvata del tipo, altrimenti i default proposti
    const f: Record<string, ConfigNotteTipo> = {}
    for (const tipo of tipiNotte) f[tipo.chiave] = { ...(cfgSalvata?.[tipo.chiave] ?? defaultConfigNotte(tipo)) }
    setForm(f)
    setStep('config')
  }
  const setCampo = (chiave: string, patch: Partial<ConfigNotteTipo>) =>
    setForm(prev => ({ ...prev, [chiave]: { ...prev[chiave], ...patch } }))

  /** Errori di validazione del form config (vuoto = tutto ok). */
  const erroriForm = useMemo(() => {
    const errs: string[] = []
    for (const tipo of tipiNotte) {
      const c = form[tipo.chiave]
      if (!c) continue
      if (!c.f1i || !c.f1f || !primaDiOra(c.f1i, c.f1f)) errs.push(`${tipo.nome}: la fascia del giorno del turno deve avere inizio prima della fine (es. ${tipo.ora_inizio} → 22:00).`)
      if (c.mode === 'doppia') {
        if (!c.f2i || !c.f2f || !primaDiOra(c.f2i, c.f2f)) errs.push(`${tipo.nome}: la fascia del giorno dopo deve avere inizio prima della fine (es. 06:00 → ${tipo.ora_fine}).`)
        if (!c.f2n.trim()) errs.push(`${tipo.nome}: dai un nome alla riga del giorno dopo (es. "Smonto ${tipo.nome}").`)
      }
    }
    return errs
  }, [form, tipiNotte])

  async function handleSync(conConfig: boolean) {
    setStep('syncing')
    setError(null)
    setProgress({ phase: 'auth' })
    try {
      // La scelta vale per le prossime sincronizzazioni su OGNI dispositivo:
      // salvala sul profilo PRIMA della sync (se il salvataggio fallisce ci
      // fermiamo: meglio non sincronizzare che farlo con una config non salvata).
      let cfg: ConfigNotte = cfgSalvata ?? {}
      if (conConfig) {
        cfg = { ...(cfgSalvata ?? {}), ...form }
        await store.setCalNotte(cfg)
        setCfgSalvata(cfg)
      }
      const res = await syncToGoogleCalendar({
        clientId: GOOGLE_OAUTH_CLIENT_ID,
        turnistaId, mese, turni, schema, colorId, postazioneNome, postazioneId,
        configNotte: cfg,
        onProgress: setProgress,
      })
      setResult(res)
      setStep('done')
    } catch (e) {
      setError((e as Error).message)
      setStep('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3"
      style={{ background: 'rgba(28,40,24,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={step === 'syncing' ? undefined : onClose}>
      <div className="card flex flex-col w-full" style={{ maxWidth: 'min(94vw, 520px)', maxHeight: 'min(90dvh, 680px)', animation: 'fadeSlideIn 160ms ease-out' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0" style={{ borderBottom: '1px solid var(--t-riga)' }}>
          <div className="flex items-center gap-2.5">
            <CalendarCheck size={20} style={{ color: 'var(--t-accento)' }} />
            <h3 className="font-bold text-base" style={{ color: 'var(--t-titolo)' }}>Sincronizza Calendario</h3>
          </div>
          {step !== 'syncing' && (
            <button onClick={onClose} className="p-1 transition-colors" style={{ color: '#9ca3af' }} title="Chiudi"><X size={20} /></button>
          )}
        </div>

        {/* Body */}
        <div className="overflow-auto p-5 flex-1">

          {/* ── INTRO ──────────────────────────────────────────────── */}
          {step === 'intro' && (
            <>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--t-testo)' }}>
                Verrà creato (se non esiste già) il calendario <strong>{postazioneNome || 'TURNI'}</strong> sul
                tuo Google Calendar e vi saranno sincronizzati <strong>i tuoi turni di {meseLabel(mese)}</strong>.
                Gli altri mesi e i tuoi eventi personali non vengono toccati.
              </p>

              {/* Scelta colore TURNI */}
              <div className="mt-4">
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--t-accento)' }}>
                  Scegli il colore dei turni sul calendario
                </div>
                <div className="flex flex-wrap gap-2">
                  {CAL_COLORS.map(c => {
                    const sel = c.colorId === colorId
                    return (
                      <button key={c.colorId} onClick={() => setColorId(c.colorId)} title={c.nome}
                        className="rounded-full transition-transform"
                        style={{
                          width: 26, height: 26, background: c.hex,
                          border: sel ? '3px solid var(--t-titolo)' : '2px solid #fff',
                          boxShadow: sel ? '0 0 0 1px var(--t-titolo)' : '0 0 0 1px #d5ccb8',
                          transform: sel ? 'scale(1.12)' : 'scale(1)',
                        }} />
                    )
                  })}
                </div>
              </div>

              <div className="mt-4 rounded-lg p-3 text-xs" style={{ background: 'var(--t-tenue)', color: 'var(--t-testo)' }}>
                {haDati
                  ? <>In <strong>{meseLabel(mese)}</strong> hai <strong>{nTurni}</strong> {nTurni === 1 ? 'turno' : 'turni'} da sincronizzare.</>
                  : <>Non hai turni assegnati in <strong>{meseLabel(mese)}</strong>: non c'è nulla da sincronizzare.</>}
              </div>

              {serveConfig && haDati && (
                <div className="mt-3 rounded-lg p-3 text-xs flex items-start gap-2" style={{ background: '#eef2ff', border: '1px solid #c7d2fe', color: '#3730a3' }}>
                  <MoonStar size={14} className="mt-0.5 shrink-0" />
                  <span>Alcuni tuoi turni <strong>finiscono il giorno dopo</strong> ({tipiNotte.map(t => t.nome).join(', ')}): al passo successivo scegli come rappresentarli sul calendario.</span>
                </div>
              )}

              {!configured && (
                <div className="mt-4 rounded-lg p-3 text-xs flex items-start gap-2"
                  style={{ background: '#fef3c7', border: '1px solid #fbbf24', color: '#92400e' }}>
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>Funzione non ancora attiva: manca la configurazione Google (<code>VITE_GOOGLE_OAUTH_CLIENT_ID</code>). Contatta l'amministratore.</span>
                </div>
              )}
            </>
          )}

          {/* ── CONFIG: turni a cavallo della mezzanotte ───────────── */}
          {step === 'config' && (
            <>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--t-testo)' }}>
                Alcuni turni <strong>iniziano un giorno e finiscono il giorno dopo</strong>. Un unico blocco
                a cavallo della mezzanotte si legge male sul calendario: scegli tu come rappresentarli.
                Potrai <strong>cambiare idea quando vuoi</strong>: alla sincronizzazione successiva i turni già
                sul calendario si aggiornano da soli, senza doppioni.
              </p>

              {tipiNotte.map(tipo => {
                const c = form[tipo.chiave]
                if (!c) return null
                return (
                  <div key={tipo.chiave} className="mt-4 rounded-xl p-3.5" style={{ background: 'var(--t-tenue)', border: '1px solid var(--t-riga)' }}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <MoonStar size={15} style={{ color: 'var(--t-accento)' }} />
                      <span className="text-sm font-bold" style={{ color: 'var(--t-titolo)' }}>{tipo.nome}</span>
                      <span className="text-xs" style={{ color: '#94a3b8' }}>{tipo.ora_inizio} → {tipo.ora_fine} del giorno dopo</span>
                    </div>

                    {/* scelta modalità */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {([['singola', 'Singola fascia', 'Un solo evento, nel giorno del turno'], ['doppia', 'Doppia fascia', 'In più una riga il giorno dopo']] as const).map(([val, tit, sub]) => {
                        const sel = c.mode === val
                        return (
                          <button key={val} onClick={() => setCampo(tipo.chiave, { mode: val })}
                            className="rounded-lg p-2.5 text-left transition-colors"
                            style={{ background: sel ? 'var(--t-primario)' : '#fff', color: sel ? '#fff' : 'var(--t-testo)', border: sel ? '2px solid var(--t-primario)' : '1px solid var(--t-riga)' }}>
                            <div className="text-xs font-bold">{tit}</div>
                            <div className="text-[10px] mt-0.5" style={{ opacity: 0.85 }}>{sub}</div>
                          </button>
                        )
                      })}
                    </div>

                    {/* fascia 1 — giorno del turno */}
                    <div className="rounded-lg p-2.5 mb-2" style={{ background: '#fff', border: '1px solid var(--t-riga)' }}>
                      <div className="text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--t-accento)' }}>Giorno del turno · «{tipo.nome}»</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="text-xs" style={{ color: 'var(--t-testo)' }}>dalle</label>
                        <input type="time" value={c.f1i} onChange={e => setCampo(tipo.chiave, { f1i: e.target.value })} className="input text-sm py-1" style={{ width: 96 }} />
                        <label className="text-xs" style={{ color: 'var(--t-testo)' }}>alle</label>
                        <input type="time" value={c.f1f} onChange={e => setCampo(tipo.chiave, { f1f: e.target.value })} className="input text-sm py-1" style={{ width: 96 }} />
                      </div>
                    </div>

                    {/* fascia 2 — giorno dopo (solo doppia) */}
                    {c.mode === 'doppia' && (
                      <div className="rounded-lg p-2.5" style={{ background: '#fff', border: '1px solid var(--t-riga)' }}>
                        <div className="text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--t-accento)' }}>Giorno dopo</div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <label className="text-xs" style={{ color: 'var(--t-testo)' }}>dalle</label>
                          <input type="time" value={c.f2i} onChange={e => setCampo(tipo.chiave, { f2i: e.target.value })} className="input text-sm py-1" style={{ width: 96 }} />
                          <label className="text-xs" style={{ color: 'var(--t-testo)' }}>alle</label>
                          <input type="time" value={c.f2f} onChange={e => setCampo(tipo.chiave, { f2f: e.target.value })} className="input text-sm py-1" style={{ width: 96 }} />
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <label className="text-xs shrink-0" style={{ color: 'var(--t-testo)' }}>nome</label>
                          <input value={c.f2n} onChange={e => setCampo(tipo.chiave, { f2n: e.target.value })} placeholder={`Smonto ${tipo.nome}`} className="input text-sm py-1 flex-1" />
                        </div>
                      </div>
                    )}

                    {/* anteprima */}
                    <div className="mt-2.5 text-[11px] leading-relaxed" style={{ color: '#64748b' }}>
                      Es. turno del 10: <strong>10</strong> · {c.f1i || '?'}–{c.f1f || '?'} «{tipo.nome}{postazioneNome ? ` (${postazioneNome})` : ''}»
                      {c.mode === 'doppia' && <> &nbsp;+&nbsp; <strong>11</strong> · {c.f2i || '?'}–{c.f2f || '?'} «{(c.f2n || `Smonto ${tipo.nome}`).trim()}{postazioneNome ? ` (${postazioneNome})` : ''}»</>}
                    </div>
                  </div>
                )
              })}

              {erroriForm.length > 0 && (
                <div className="mt-3 rounded-lg p-3 text-xs space-y-1" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
                  {erroriForm.map((e, i) => <div key={i}>• {e}</div>)}
                </div>
              )}
            </>
          )}

          {/* ── SYNCING ────────────────────────────────────────────── */}
          {step === 'syncing' && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Loader2 size={36} className="animate-spin mb-4" style={{ color: 'var(--t-accento)' }} />
              <div className="text-sm font-semibold" style={{ color: 'var(--t-testo)' }}>
                {progress ? PHASE_LABEL[progress.phase] : 'Sincronizzazione…'}
              </div>
              {progress?.phase === 'writing' && progress.total !== undefined && (
                <>
                  <div className="text-xs mt-1" style={{ color: '#94a3b8' }}>{progress.done ?? 0} / {progress.total}</div>
                  <div className="w-full max-w-xs h-2 rounded-full mt-3 overflow-hidden" style={{ background: '#e7e5e4' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${progress.total ? Math.round(((progress.done ?? 0) / progress.total) * 100) : 0}%`, background: 'var(--t-primario)' }} />
                  </div>
                </>
              )}
              {progress?.phase === 'auth' && (
                <div className="text-xs mt-2 max-w-xs" style={{ color: '#94a3b8' }}>Se appare un popup di Google, autorizza l'accesso al calendario.</div>
              )}
            </div>
          )}

          {/* ── DONE ───────────────────────────────────────────────── */}
          {step === 'done' && result && (
            <div className="flex flex-col items-center text-center py-4">
              <div className="rounded-full p-2 mb-3" style={{ background: '#dcfce7' }}><Check size={28} style={{ color: '#166534' }} /></div>
              <div className="text-base font-bold" style={{ color: 'var(--t-titolo)' }}>Sincronizzazione completata</div>
              <div className="grid grid-cols-2 gap-2 mt-4 w-full max-w-xs text-sm">
                <Stat label="Creati"     value={result.created}   color="#166534" bg="#dcfce7" />
                <Stat label="Aggiornati" value={result.updated}   color="#1d4ed8" bg="#dbeafe" />
                <Stat label="Eliminati"  value={result.deleted}   color="#991b1b" bg="#fee2e2" />
                <Stat label="Invariati"  value={result.unchanged} color="#57534e" bg="#f5f5f4" />
              </div>
              <a href="https://calendar.google.com/" target="_blank" rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold transition-colors" style={{ color: 'var(--t-accento)' }}>
                <ExternalLink size={14} /> Apri Google Calendar
              </a>
            </div>
          )}

          {/* ── ERROR ──────────────────────────────────────────────── */}
          {step === 'error' && (
            <div className="flex flex-col items-center text-center py-4">
              <div className="rounded-full p-2 mb-3" style={{ background: '#fee2e2' }}><AlertTriangle size={28} style={{ color: '#991b1b' }} /></div>
              <div className="text-base font-bold" style={{ color: 'var(--t-titolo)' }}>Sincronizzazione non riuscita</div>
              <p className="text-xs mt-2 max-w-sm break-words" style={{ color: 'var(--t-testo)' }}>{error}</p>
            </div>
          )}
        </div>

        {/* Footer azioni */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 shrink-0" style={{ borderTop: '1px solid var(--t-riga)' }}>
          {step === 'intro' && (
            <>
              <button onClick={onClose} className="btn-secondary py-2 px-4 text-sm">Annulla</button>
              {serveConfig ? (
                <button onClick={apriConfig} disabled={!configured || !haDati || cfgSalvata === null}
                  className="btn-primary py-2 px-4 text-sm flex items-center gap-1.5"
                  title="Scegli come rappresentare i turni che finiscono il giorno dopo">
                  {cfgSalvata === null ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />} Continua
                </button>
              ) : (
                <button onClick={() => handleSync(false)} disabled={!configured || !haDati} className="btn-primary py-2 px-4 text-sm flex items-center gap-1.5">
                  <CalendarCheck size={16} /> Sincronizza
                </button>
              )}
            </>
          )}
          {step === 'config' && (
            <>
              <button onClick={() => setStep('intro')} className="btn-secondary py-2 px-4 text-sm flex items-center gap-1"><ChevronLeft size={15} /> Indietro</button>
              <button onClick={() => handleSync(true)} disabled={erroriForm.length > 0} className="btn-primary py-2 px-4 text-sm flex items-center gap-1.5">
                <CalendarCheck size={16} /> Sincronizza
              </button>
            </>
          )}
          {step === 'done' && <button onClick={onClose} className="btn-primary py-2 px-4 text-sm">Chiudi</button>}
          {step === 'error' && (
            <>
              <button onClick={onClose} className="btn-secondary py-2 px-4 text-sm">Chiudi</button>
              <button onClick={() => handleSync(serveConfig)} className="btn-primary py-2 px-4 text-sm">Riprova</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className="rounded-lg py-2 px-3 flex flex-col items-center" style={{ background: bg }}>
      <span className="text-lg font-bold" style={{ color }}>{value}</span>
      <span className="text-[11px] font-medium" style={{ color }}>{label}</span>
    </div>
  )
}
