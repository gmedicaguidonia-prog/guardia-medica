import { useEffect, useRef, useState } from 'react'
import { useIsFetching } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'

// Velo con spinner mostrato al CAMBIO MESE finché le query del nuovo mese non hanno
// finito di caricare: senza, il contenuto vecchio restava a video e poi "saltava" al nuovo.
// Il contenitore che lo ospita deve essere `relative`.
export function SpinnerMese({ meseKey, etichetta }: { meseKey: string; etichetta?: string }) {
  const fetching = useIsFetching()
  const [attivo, setAttivo] = useState(false)
  const prev = useRef(meseKey)
  useEffect(() => { if (prev.current !== meseKey) { prev.current = meseKey; setAttivo(true) } }, [meseKey])
  // le query del nuovo mese partono un render dopo il cambio: piccola attesa prima di spegnere
  useEffect(() => {
    if (!attivo || fetching > 0) return
    const t = setTimeout(() => setAttivo(false), 350)
    return () => clearTimeout(t)
  }, [attivo, fetching])
  if (!attivo) return null
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2" style={{ background: 'rgba(255,255,255,0.78)' }} aria-live="polite">
      <Loader2 size={36} className="animate-spin" style={{ color: 'var(--t-accento)' }} />
      <p className="text-sm font-semibold" style={{ color: 'var(--t-titolo)' }}>{etichetta ?? 'Carico il mese…'}</p>
    </div>
  )
}
