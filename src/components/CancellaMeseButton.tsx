import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Trash2, AlertTriangle } from 'lucide-react'
import { store } from '../lib/store'

const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

/**
 * Pulsante (a destra del selettore mese) per azzerare TUTTO il setup del mese
 * selezionato. Salva prima uno snapshot JSON unico (recuperabile) tramite la
 * RPC cancella_mese, poi cancella config/regole/impaginazione/desiderata/turni
 * del mese (gli altri mesi non vengono toccati) → il mese torna "vergine".
 */
export function CancellaMeseButton({ postazioneId, meseKey, anno, mese }: { postazioneId: string | null; meseKey: string; anno: number; mese: number }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!postazioneId) return null
  const nomeMese = MESI[mese - 1].toUpperCase()

  async function conferma() {
    setBusy(true)
    try {
      await store.cancellaMese(postazioneId!, meseKey)
      store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'config_turni', messaggio: `Impostazioni di ${MESI[mese - 1]} ${anno} azzerate (con backup). Mese riportato a vuoto.`, target: '/admin/schema', perAdmin: true }).catch(() => {})
      await qc.invalidateQueries()   // il wipe tocca molte tabelle: rinfresca tutto
      setOpen(false)
    } catch (e) { console.error('[CancellaMese] fallito:', e); alert((e as Error).message || 'Errore nella cancellazione del mese.') }
    finally { setBusy(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} title={`Azzera tutte le impostazioni di ${MESI[mese - 1]} ${anno}`}
        className="flex items-center gap-1 text-xs font-semibold py-1.5 px-2.5 rounded-lg transition-colors hover:brightness-95 shrink-0"
        style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}>
        <Trash2 size={13} /> Cancella Impostazioni {nomeMese}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(28,40,24,0.45)' }} onClick={() => !busy && setOpen(false)}>
          <div className="card w-full max-w-md p-5" style={{ animation: 'fadeSlideIn 160ms ease-out' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={20} style={{ color: '#b91c1c' }} />
              <h3 className="text-base font-bold" style={{ color: '#2b3c24' }}>Cancellare le impostazioni di {MESI[mese - 1]} {anno}?</h3>
            </div>
            <p className="text-sm text-stone-600 mb-2">Procedendo verranno <strong>eliminate TUTTE</strong> le impostazioni, configurazioni e dati di <strong>{MESI[mese - 1]} {anno}</strong>:</p>
            <ul className="text-sm text-stone-600 list-disc ml-5 mb-2">
              <li>Configurazione Turni e Regole Turni</li>
              <li>Impaginazione (fogli)</li>
              <li>Desiderata / indisponibilità</li>
              <li>Turni del mese (assegnazioni e candidature)</li>
            </ul>
            <p className="text-xs text-stone-500 mb-1">Gli <strong>altri mesi non vengono toccati</strong>. Il mese tornerà a vuoto e potrai ricominciare dal passo ①.</p>
            <p className="text-xs text-stone-500 mb-4">Prima della cancellazione viene salvata in automatico una <strong>copia di backup</strong> dell'intero setup del mese, recuperabile.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} disabled={busy} className="btn-secondary text-sm py-1.5 px-3">Annulla</button>
              <button onClick={conferma} disabled={busy} className="text-sm font-semibold py-1.5 px-4 rounded-lg" style={{ background: '#dc2626', color: '#fff' }}>{busy ? 'Cancello…' : 'Sì, cancella tutto'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
