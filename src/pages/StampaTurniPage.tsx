import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Printer, X } from 'lucide-react'
import { store } from '../lib/store'
import { giorniDelMese, turnoSiApplica } from '../lib/turniLogic'
import { isoDate, isFestivo } from '../lib/holidays'
import { useFestivita } from '../hooks/useFestivita'
import { useImpaginazione } from '../hooks/useImpaginazione'
import { useFinalizzato } from '../hooks/useFinalizzato'
import type { TurnoSchema, Turnista, ConfigVersione, Turno, Postazione } from '../types'

const MESI = ['GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO', 'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE']
const WD = ['DOMENICA', 'LUNEDÌ', 'MARTEDÌ', 'MERCOLEDÌ', 'GIOVEDÌ', 'VENERDÌ', 'SABATO']

/** "COGNOME N." tutto maiuscolo (es. "MARABELLI S."). */
function nomeStampa(t: Turnista | undefined): string {
  if (!t) return '—'
  const c = (t.cognome ?? '').trim().toUpperCase()
  const n = (t.nome ?? '').trim()
  return n ? `${c} ${n[0].toUpperCase()}.` : c
}

const bordo = '1px solid #000'
const td: CSSProperties = { border: bordo, padding: '2px 8px', fontSize: 13, color: '#000', background: '#fff' }

/**
 * Pagina di STAMPA (aperta in una scheda a parte dal riquadro Stampa/PDF della
 * Finalizzazione): impagina il calendario del mese seguendo l'ordine definito in
 * Impaginazione — un FOGLIO per pagina — in bianco e nero, con la dicitura rossa
 * "TURNI DI [postazione] [mese] [anno]" in testa a ogni tabella.
 * Colonne: n° giorno · giorno settimana · turno · turnisti "COGNOME N." separati
 * da trattino · reperibile (colonna presente solo se nel foglio c'è un reperibile).
 */
export function StampaTurniPage() {
  const [params] = useSearchParams()
  // parametri espliciti dal chiamante, con fallback allo stato condiviso (localStorage)
  const postazioneId = params.get('p') ?? localStorage.getItem('gm_postazione')
  const meseKey = params.get('m') ?? localStorage.getItem('gm_mese') ?? ''
  const anno = +meseKey.slice(0, 4)
  const mese = +meseKey.slice(5, 7)
  const valido = !!postazioneId && /^\d{4}-(0[1-9]|1[0-2])$/.test(meseKey)

  const { data: postazioni = [] } = useQuery<Postazione[]>({ queryKey: ['postazioni'], queryFn: () => store.getPostazioni(), enabled: valido })
  const postazione = postazioni.find(p => p.id === postazioneId) ?? null
  const { data: versione } = useQuery<ConfigVersione | null>({ queryKey: ['versione', postazioneId, meseKey], queryFn: () => store.getVersioneMese(postazioneId!, meseKey), enabled: valido })
  const { data: schema = [] } = useQuery<TurnoSchema[]>({ queryKey: ['schema', versione?.id], queryFn: () => store.getSchemaVersione(versione!.id), enabled: !!versione })
  const { data: turnisti = [] } = useQuery<Turnista[]>({ queryKey: ['turnisti', postazioneId], queryFn: () => store.getTurnisti(postazioneId!), enabled: valido })
  const { data: turni = [] } = useQuery<Turno[]>({ queryKey: ['turni', postazioneId, anno, mese], queryFn: () => store.getTurniMese(postazioneId!, anno, mese), enabled: valido })
  const { fogliConTurni } = useImpaginazione(postazioneId, meseKey, schema)
  const { festivoSet } = useFestivita(postazioneId)
  const { finalizzato } = useFinalizzato(postazioneId, meseKey)

  const tById = useMemo(() => new Map(turnisti.map(t => [t.id, t])), [turnisti])
  const giorni = useMemo(() => (valido ? giorniDelMese(anno, mese) : []), [valido, anno, mese])

  // (data|turno) → turnisti assegnati (slot ≥ 0) e reperibile (slot -1)
  const { perCella, repCella } = useMemo(() => {
    const pc = new Map<string, string[]>(); const rc = new Map<string, string>()
    for (const t of turni) {
      if (!t.turnista_id) continue
      const k = `${t.data}|${t.turno_schema_id}`
      if (t.slot >= 0) { const a = pc.get(k); if (a) a.push(t.turnista_id); else pc.set(k, [t.turnista_id]) }
      else rc.set(k, t.turnista_id)
    }
    return { perCella: pc, repCella: rc }
  }, [turni])

  // Un blocco per FOGLIO (ordine dell'Impaginazione): righe = (giorno, turno applicabile)
  const fogli = useMemo(() => fogliConTurni.map(fc => {
    const righe: { ds: string; d: Date; turno: TurnoSchema; nomi: string[]; rep: string | null }[] = []
    giorni.forEach(d => fc.turni.forEach(c => {
      if (!turnoSiApplica(c, d, festivoSet)) return
      const k = `${isoDate(d)}|${c.id}`
      righe.push({
        ds: isoDate(d), d, turno: c,
        nomi: (perCella.get(k) ?? []).map(id => nomeStampa(tById.get(id))),
        rep: repCella.has(k) ? nomeStampa(tById.get(repCella.get(k)!)) : null,
      })
    }))
    return { foglio: fc.foglio, righe, conRep: righe.some(r => r.rep) }
  }), [fogliConTurni, giorni, perCella, repCella, tById, festivoSet])

  if (!valido) return <div style={{ padding: 24, fontSize: 14 }}>Parametri mancanti: apri la stampa dalla pagina ⑧ Finalizzazione.</div>

  const titolo = `TURNI DI ${(postazione?.nome ?? '').toUpperCase()} ${MESI[mese - 1]} ${anno}`

  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <title>{`Turni ${postazione?.nome ?? ''} ${MESI[mese - 1].toLowerCase()} ${anno}`}</title>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .foglio-stampa { page-break-after: always; }
          .foglio-stampa:last-child { page-break-after: auto; }
          /* MAI spezzare una riga a cavallo di due pagine */
          .foglio-stampa tr, .foglio-stampa td, .foglio-stampa th { page-break-inside: avoid; break-inside: avoid; }
          /* l'intestazione (dicitura rossa + colonne) si ripete su ogni pagina */
          .foglio-stampa thead { display: table-header-group; }
          @page { margin: 10mm; }
        }
      `}</style>

      {/* Barra comandi (solo a schermo) */}
      <div className="no-print" style={{ position: 'sticky', top: 0, background: 'var(--t-notte)', color: '#fff', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, zIndex: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>Stampa turni — {postazione?.nome ?? '…'} · {MESI[mese - 1]} {anno}{finalizzato ? ' · definitivo' : ' · bozza'}</span>
        <button onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--t-primario)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Printer size={15} /> Stampa / salva PDF
        </button>
        <button onClick={() => window.close()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: 'var(--t-side-testo)', border: '1px solid var(--t-primario)', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <X size={15} /> Chiudi
        </button>
      </div>

      {/* Fogli (uno per pagina in stampa) */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
        {fogli.length === 0 && <p style={{ fontSize: 14 }}>Nessun foglio impaginato per questo mese (passo ④ Impaginazione).</p>}
        {fogli.map(({ foglio, righe, conRep }) => (
          <div key={foglio.id} className="foglio-stampa" style={{ marginBottom: 26 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th colSpan={conRep ? 5 : 4} style={{ ...td, textAlign: 'center', color: '#c00000', fontSize: 16, fontWeight: 800, letterSpacing: 0.5, padding: '6px 8px' }}>
                    {titolo}{fogli.length > 1 ? ` — ${foglio.nome.toUpperCase()}` : ''}
                  </th>
                </tr>
                <tr>
                  <th style={{ ...td, fontWeight: 800, width: 44, textAlign: 'center' }}>N°</th>
                  <th style={{ ...td, fontWeight: 800, width: 110, textAlign: 'center' }}>Giorno</th>
                  <th style={{ ...td, fontWeight: 800, width: 130, textAlign: 'left' }}>Turno</th>
                  <th style={{ ...td, fontWeight: 800, textAlign: 'left' }}>Turnisti</th>
                  {conRep && <th style={{ ...td, fontWeight: 800, width: 150, textAlign: 'left' }}>Reperibile</th>}
                </tr>
              </thead>
              <tbody>
                {righe.map(({ ds, d, turno, nomi, rep }) => (
                  <tr key={`${ds}|${turno.id}`}>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{d.getDate()}</td>
                    <td style={{ ...td, textAlign: 'center', ...(isFestivo(d, festivoSet) ? { color: '#c00000', fontWeight: 700 } : null) }}>{WD[d.getDay()]}</td>
                    <td style={td}>{turno.nome || 'Turno'}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{nomi.length ? nomi.join(' - ') : ''}</td>
                    {conRep && <td style={td}>{rep ?? ''}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
