import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, AlertTriangle, History } from 'lucide-react'
import { store } from '../lib/store'
import { useConfirm } from '../hooks/useConfirm'
import { ConfirmModal } from './ConfirmModal'
import { useFinalizzato } from '../hooks/useFinalizzato'

const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
const fmtDT = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

/**
 * Pulsanti (a destra del selettore mese): "Cancella Impostazioni MESE" (azzera il
 * mese con snapshot JSON unico prima — max 1 per mese, il nuovo sostituisce il
 * vecchio) e — SOLO se esiste uno snapshot per quel mese — "Ripristina mese"
 * (riporta il mese alla versione precedente; poi consuma lo snapshot).
 */
export function CancellaMeseButton({ postazioneId, meseKey, anno, mese }: { postazioneId: string | null; meseKey: string; anno: number; mese: number }) {
  const qc = useQueryClient()
  const { notify, confirmState } = useConfirm()
  const [openDel, setOpenDel] = useState(false)
  const [openRip, setOpenRip] = useState(false)
  const [busy, setBusy] = useState(false)
  const { data: snap } = useQuery({ queryKey: ['setup-backup', postazioneId, meseKey], queryFn: () => store.getSetupBackup(postazioneId!, meseKey), enabled: !!postazioneId })
  const { finalizzato } = useFinalizzato(postazioneId, meseKey)   // mese bloccato ⇒ niente cancellazione/ripristino
  if (!postazioneId) return null
  const nomeMese = MESI[mese - 1].toUpperCase()

  async function cancella() {
    if (finalizzato) { setOpenDel(false); void notify({ title: 'Mese finalizzato', message: `${MESI[mese - 1]} ${anno} è bloccato: sbloccalo dalla pagina ⑧ Finalizzazione prima di cancellarne le impostazioni.` }); return }
    setBusy(true)
    try {
      await store.cancellaMese(postazioneId!, meseKey)
      store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'config_turni', messaggio: `Impostazioni di ${MESI[mese - 1]} ${anno} azzerate (con backup). Mese riportato a vuoto.`, target: '/admin/schema', perAdmin: true }).catch(() => {})
      await qc.invalidateQueries()
      setOpenDel(false)
    } catch (e) { console.error('[CancellaMese] fallito:', e); void notify({ title: 'Errore', message: (e as Error).message || 'Errore nella cancellazione del mese.' }) }
    finally { setBusy(false) }
  }
  async function ripristina() {
    if (finalizzato) { setOpenRip(false); void notify({ title: 'Mese finalizzato', message: `${MESI[mese - 1]} ${anno} è bloccato: sbloccalo dalla pagina ⑧ Finalizzazione prima di ripristinarlo.` }); return }
    setBusy(true)
    try {
      await store.ripristinaMese(postazioneId!, meseKey)
      store.addNotifica({ postazioneId: postazioneId!, mese: meseKey, tipo: 'config_turni', messaggio: `Impostazioni di ${MESI[mese - 1]} ${anno} ripristinate dal backup.`, target: '/admin/schema', perAdmin: true }).catch(() => {})
      await qc.invalidateQueries()
      setOpenRip(false)
    } catch (e) { console.error('[RipristinaMese] fallito:', e); void notify({ title: 'Errore', message: (e as Error).message || 'Errore nel ripristino del mese.' }) }
    finally { setBusy(false) }
  }

  return (
    <>
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />
      {snap && (
        <button onClick={() => setOpenRip(true)} title={`Ripristina ${MESI[mese - 1]} ${anno} dalla copia del ${fmtDT(snap.createdAt)}`}
          className="flex items-center gap-1 text-xs font-semibold py-1.5 px-2.5 rounded-lg transition-colors hover:brightness-95 shrink-0"
          style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd' }}>
          <History size={13} /> Ripristina {MESI[mese - 1]}
        </button>
      )}
      <button onClick={() => setOpenDel(true)} title={`Azzera tutte le impostazioni di ${MESI[mese - 1]} ${anno}`}
        className="flex items-center gap-1 text-xs font-semibold py-1.5 px-2.5 rounded-lg transition-colors hover:brightness-95 shrink-0"
        style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}>
        <Trash2 size={13} /> Cancella Impostazioni {nomeMese}
      </button>

      {openDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(28,40,24,0.45)' }} onClick={() => !busy && setOpenDel(false)}>
          <div className="card w-full max-w-md p-5" style={{ animation: 'fadeSlideIn 160ms ease-out' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={20} style={{ color: '#b91c1c' }} />
              <h3 className="text-base font-bold" style={{ color: 'var(--t-titolo)' }}>Cancellare le impostazioni di {MESI[mese - 1]} {anno}?</h3>
            </div>
            <p className="text-sm text-stone-600 mb-2">Procedendo verranno <strong>eliminate TUTTE</strong> le impostazioni, configurazioni e dati di <strong>{MESI[mese - 1]} {anno}</strong>:</p>
            <ul className="text-sm text-stone-600 list-disc ml-5 mb-2">
              <li>Configurazione Turni e Regole Turni</li>
              <li>Impaginazione (fogli)</li>
              <li>Desiderata / indisponibilità</li>
              <li>Turni del mese (assegnazioni e candidature)</li>
            </ul>
            <p className="text-xs text-stone-500 mb-1">Gli <strong>altri mesi non vengono toccati</strong>. Il mese tornerà a vuoto e potrai ricominciare dal passo ①.</p>
            <p className="text-xs text-stone-500 mb-4">Viene salvata una <strong>copia di backup</strong> dell'intero setup del mese (sostituisce l'eventuale precedente): potrai <strong>ripristinarla</strong> col pulsante «Ripristina».</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpenDel(false)} disabled={busy} className="btn-secondary text-sm py-1.5 px-3">Annulla</button>
              <button onClick={cancella} disabled={busy} className="text-sm font-semibold py-1.5 px-4 rounded-lg" style={{ background: '#dc2626', color: '#fff' }}>{busy ? 'Cancello…' : 'Sì, cancella tutto'}</button>
            </div>
          </div>
        </div>
      )}

      {openRip && snap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(28,40,24,0.45)' }} onClick={() => !busy && setOpenRip(false)}>
          <div className="card w-full max-w-md p-5" style={{ animation: 'fadeSlideIn 160ms ease-out' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <History size={20} style={{ color: '#1d4ed8' }} />
              <h3 className="text-base font-bold" style={{ color: 'var(--t-titolo)' }}>Ripristinare {MESI[mese - 1]} {anno}?</h3>
            </div>
            <p className="text-sm text-stone-600 mb-2">Il mese verrà riportato alla <strong>versione precedente</strong> (la copia salvata il <strong>{fmtDT(snap.createdAt)}</strong>{snap.autore ? `, da ${snap.autore}` : ''}): tornano configurazione, regole, impaginazione, desiderata e turni com'erano prima della cancellazione.</p>
            <p className="text-xs text-stone-500 mb-4">Lo stato attuale del mese verrà sovrascritto. Dopo il ripristino la copia di backup viene consumata.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpenRip(false)} disabled={busy} className="btn-secondary text-sm py-1.5 px-3">Annulla</button>
              <button onClick={ripristina} disabled={busy} className="text-sm font-semibold py-1.5 px-4 rounded-lg" style={{ background: '#2e7d32', color: '#fff' }}>{busy ? 'Ripristino…' : 'Sì, ripristina'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
