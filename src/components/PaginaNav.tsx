import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// ═══ Paginazione degli elenchi di nomi (regola: max 30 per pagina) ═══
// usePagine: paginazione client-side di una lista qualsiasi.
// PaginaNav: barra di navigazione BEN VISIBILE (usata anche da elenchi già
// paginati lato server, come l'Anagrafica del Centro di Controllo).

export const NOMI_PER_PAGINA = 30

export function usePagine<T>(items: T[], perPagina: number = NOMI_PER_PAGINA) {
  const [pagina, setPagina] = useState(0)
  const nPagine = Math.max(1, Math.ceil(items.length / perPagina))
  // se la lista si accorcia (ricerca, rimozioni) la pagina corrente può sparire: torna alla prima
  useEffect(() => { if (pagina > nPagine - 1) setPagina(0) }, [pagina, nPagine])
  const slice = items.slice(pagina * perPagina, (pagina + 1) * perPagina)
  return { pagina, setPagina, nPagine, slice, totale: items.length }
}

/** Finestra di `per` elementi sull'elenco APPIATTITO di gruppi (con intestazioni conservate). */
export function paginaGruppi<G extends { items: unknown[] }>(gruppi: G[], pagina: number, per: number = NOMI_PER_PAGINA): G[] {
  let salta = pagina * per, resta = per
  const out: G[] = []
  for (const g of gruppi) {
    if (resta <= 0) break
    if (salta >= g.items.length) { salta -= g.items.length; continue }
    const slice = g.items.slice(salta, salta + resta)
    out.push({ ...g, items: slice })
    resta -= slice.length; salta = 0
  }
  return out
}

export function PaginaNav({ pagina, nPagine, totale, unita = 'nomi', onCambia }: {
  pagina: number
  nPagine: number
  totale: number
  unita?: string
  onCambia: (nuova: number) => void
}) {
  if (nPagine <= 1) return null
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5" style={{ background: '#eef1e9', border: '1px solid #d8dccf' }}>
      <button onClick={() => onCambia(Math.max(0, pagina - 1))} disabled={pagina === 0}
        className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-35 disabled:cursor-default"
        style={{ background: pagina === 0 ? 'transparent' : 'var(--t-primario)', color: pagina === 0 ? 'var(--t-testo)' : '#fff' }}>
        <ChevronLeft size={14} /> Precedente
      </button>
      <span className="text-xs font-bold text-center" style={{ color: 'var(--t-titolo)' }}>
        Pagina {pagina + 1} di {nPagine} <span className="font-normal text-stone-500">· {totale} {unita}</span>
      </span>
      <button onClick={() => onCambia(Math.min(nPagine - 1, pagina + 1))} disabled={pagina >= nPagine - 1}
        className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-35 disabled:cursor-default"
        style={{ background: pagina >= nPagine - 1 ? 'transparent' : 'var(--t-primario)', color: pagina >= nPagine - 1 ? 'var(--t-testo)' : '#fff' }}>
        Successiva <ChevronRight size={14} />
      </button>
    </div>
  )
}
