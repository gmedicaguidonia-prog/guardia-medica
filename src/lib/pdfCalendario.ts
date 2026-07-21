// Generazione del PDF del calendario turni, condivisa tra la pagina di STAMPA
// (aperta dalla Finalizzazione) e il pulsante «Scarica PDF Calendario» della pagina
// PUBBLICA: entrambe producono lo STESSO identico documento.
//
// Il PDF è vettoriale (testo selezionabile, non uno screenshot) e ricalca l'impaginazione
// a schermo: un foglio per pagina, titolo rosso, colonne N°/Giorno/Turno/Turnisti/
// Reperibile, giorni festivi in rosso. Le librerie sono caricate con import DINAMICO
// dentro scaricaPdfCalendario ⇒ finiscono in un chunk a parte, scaricato solo al click.
import { isoDate, isFestivo } from './holidays'
import { turnoSiApplica } from './turniLogic'
import type { TurnoSchema, Turnista, Turno } from '../types'

const MESI = ['GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO', 'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE']
const WD = ['DOMENICA', 'LUNEDÌ', 'MARTEDÌ', 'MERCOLEDÌ', 'GIOVEDÌ', 'VENERDÌ', 'SABATO']
const GHOST_PFX = 'ghost:'

/** "COGNOME N." tutto maiuscolo (es. "MARABELLI S."). */
export function nomeStampa(t: Turnista | undefined): string {
  if (!t) return '—'
  const c = (t.cognome ?? '').trim().toUpperCase()
  const n = (t.nome ?? '').trim()
  return n ? `${c} ${n[0].toUpperCase()}.` : c
}

/** Risolve un valore di assegnazione in "COGNOME N.": turnista reale oppure nome
 *  FANTASMA congelato (turnista cancellato) passato come "ghost:Cognome Nome". */
export function nomeStampaVal(val: string, tById: Map<string, Turnista>): string {
  if (val.startsWith(GHOST_PFX)) {
    const parts = val.slice(GHOST_PFX.length).trim().split(/\s+/)
    const c = (parts[0] ?? '').toUpperCase()
    return parts[1] ? `${c} ${parts[1][0].toUpperCase()}.` : c
  }
  return nomeStampa(tById.get(val))
}

export interface RigaPdf { d: Date; turno: TurnoSchema; nomi: string[]; rep: string | null }
export interface FoglioPdf { foglio: { id: string; nome: string }; righe: RigaPdf[]; conRep: boolean }

/** Assembla i fogli del PDF dagli stessi dati mostrati a schermo (impaginazione + turni del mese). */
export function costruisciFogliPdf(p: {
  fogliConTurni: { foglio: { id: string; nome: string }; turni: TurnoSchema[] }[]
  giorni: Date[]
  turni: Turno[]
  turnisti: Turnista[]
  festivoSet: Set<string>
}): FoglioPdf[] {
  const tById = new Map(p.turnisti.map(t => [t.id, t]))
  // (data|turno) → turnisti assegnati (slot ≥ 0) e reperibile (slot −1)
  const perCella = new Map<string, string[]>(); const repCella = new Map<string, string>()
  for (const t of p.turni) {
    const val = t.turnista_id ?? (t.nome_congelato ? `${GHOST_PFX}${t.nome_congelato}` : null)
    if (!val) continue
    const k = `${t.data}|${t.turno_schema_id}`
    if (t.slot >= 0) { const a = perCella.get(k); if (a) a.push(val); else perCella.set(k, [val]) }
    else repCella.set(k, val)
  }
  return p.fogliConTurni.map(fc => {
    const righe: RigaPdf[] = []
    p.giorni.forEach(d => fc.turni.forEach(c => {
      if (!turnoSiApplica(c, d, p.festivoSet)) return
      const k = `${isoDate(d)}|${c.id}`
      righe.push({
        d, turno: c,
        nomi: (perCella.get(k) ?? []).map(v => nomeStampaVal(v, tById)),
        rep: repCella.has(k) ? nomeStampaVal(repCella.get(k)!, tById) : null,
      })
    }))
    return { foglio: fc.foglio, righe, conRep: righe.some(r => r.rep) }
  })
}

/** Nome del file (= titolo documento): "NOMEFOGLIO - Turni del mese di giugno 2026". */
export function nomeFilePdf(fogli: FoglioPdf[], postazioneNome: string, mese: number, anno: number): string {
  const primo = (fogli[0]?.foglio.nome || postazioneNome || '').toUpperCase()
  return primo ? `${primo} - Turni del mese di ${MESI[mese - 1].toLowerCase()} ${anno}` : 'Calendario turni'
}

/** Genera e SCARICA il PDF del calendario. */
export async function scaricaPdfCalendario(
  fogli: FoglioPdf[],
  opts: { postazioneNome: string; mese: number; anno: number; festivoSet: Set<string> },
): Promise<void> {
  if (!fogli.length) throw new Error('Nessun foglio impaginato per questo mese')
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const titolo = (nomeFoglio: string) => `${(nomeFoglio || opts.postazioneNome || '').toUpperCase()} - TURNI DEL MESE DI ${MESI[opts.mese - 1]} ${opts.anno}`

  fogli.forEach(({ foglio, righe, conRep }, i) => {
    if (i > 0) doc.addPage()
    const festivi = righe.map(r => isFestivo(r.d, opts.festivoSet))
    autoTable(doc, {
      startY: 10,
      margin: { top: 10, right: 10, bottom: 10, left: 10 },
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: { top: 1.1, bottom: 1.1, left: 2, right: 2 }, lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0], overflow: 'linebreak' },
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineColor: [0, 0, 0], lineWidth: 0.2 },
      columnStyles: conRep
        ? { 0: { cellWidth: 11, halign: 'center', fontStyle: 'bold' }, 1: { cellWidth: 24, halign: 'center' }, 2: { cellWidth: 32 }, 3: { fontStyle: 'bold' }, 4: { cellWidth: 34 } }
        : { 0: { cellWidth: 11, halign: 'center', fontStyle: 'bold' }, 1: { cellWidth: 24, halign: 'center' }, 2: { cellWidth: 36 }, 3: { fontStyle: 'bold' } },
      head: [
        [{ content: titolo(foglio.nome), colSpan: conRep ? 5 : 4, styles: { halign: 'center', fontStyle: 'bold', fontSize: 12, textColor: [192, 0, 0] } }],
        conRep ? ['N°', 'Giorno', 'Turno', 'Turnisti', 'Reperibile'] : ['N°', 'Giorno', 'Turno', 'Turnisti'],
      ],
      body: righe.map(r => {
        const base = [String(r.d.getDate()), WD[r.d.getDay()], r.turno.nome || 'Turno', r.nomi.length ? r.nomi.join(' - ') : '']
        return conRep ? [...base, r.rep ?? ''] : base
      }),
      // giorno festivo in rosso e grassetto, come a schermo
      didParseCell: data => {
        if (data.section === 'body' && data.column.index === 1 && festivi[data.row.index]) {
          data.cell.styles.textColor = [192, 0, 0]
          data.cell.styles.fontStyle = 'bold'
        }
      },
    })
  })
  doc.save(`${nomeFilePdf(fogli, opts.postazioneNome, opts.mese, opts.anno)}.pdf`)
}
