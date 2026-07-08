/**
 * SyncCalendarModal
 *
 * Modal "Sincronizza Calendario" per i turnisti. Sincronizza i turni del MESE
 * visualizzato del turnista loggato con un calendario (nome = postazione) sul
 * suo Google Calendar (account usato per il login).
 *
 * Flusso:
 *   1. intro  → spiegazione + scelta colore + "Sincronizza"
 *   2. syncing→ popup consenso Google + creazione calendario + diff eventi
 *   3. done   → riepilogo (creati/aggiornati/eliminati/invariati) + link
 *   error     → messaggio + "Riprova"
 *
 * Vedi src/lib/googleCalendarSync.ts per la logica (diff intelligente e
 * per-mese: tocca solo i turni cambiati, non tocca gli altri mesi).
 */

import { useState } from 'react'
import { CalendarCheck, X, Loader2, Check, AlertTriangle, ExternalLink } from 'lucide-react'
import type { Turno, TurnoSchema } from '../types'
import {
  syncToGoogleCalendar, GOOGLE_OAUTH_CLIENT_ID, CAL_COLORS, getSavedCalendarColor,
  type SyncProgress, type SyncResult,
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

type Step = 'intro' | 'syncing' | 'done' | 'error'

const PHASE_LABEL: Record<SyncProgress['phase'], string> = {
  auth:     'Autorizzazione Google…',
  calendar: 'Preparazione calendario della postazione…',
  reading:  'Lettura turni già presenti…',
  writing:  'Aggiornamento turni…',
  done:     'Completato',
}

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

  async function handleSync() {
    setStep('syncing')
    setError(null)
    setProgress({ phase: 'auth' })
    try {
      const res = await syncToGoogleCalendar({
        clientId: GOOGLE_OAUTH_CLIENT_ID,
        turnistaId, mese, turni, schema, colorId, postazioneNome, postazioneId,
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

              {!configured && (
                <div className="mt-4 rounded-lg p-3 text-xs flex items-start gap-2"
                  style={{ background: '#fef3c7', border: '1px solid #fbbf24', color: '#92400e' }}>
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>Funzione non ancora attiva: manca la configurazione Google (<code>VITE_GOOGLE_OAUTH_CLIENT_ID</code>). Contatta l'amministratore.</span>
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
              <button onClick={handleSync} disabled={!configured || !haDati} className="btn-primary py-2 px-4 text-sm flex items-center gap-1.5">
                <CalendarCheck size={16} /> Sincronizza
              </button>
            </>
          )}
          {step === 'done' && <button onClick={onClose} className="btn-primary py-2 px-4 text-sm">Chiudi</button>}
          {step === 'error' && (
            <>
              <button onClick={onClose} className="btn-secondary py-2 px-4 text-sm">Chiudi</button>
              <button onClick={handleSync} className="btn-primary py-2 px-4 text-sm">Riprova</button>
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
