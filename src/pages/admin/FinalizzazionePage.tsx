import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClipboardCheck, ChevronLeft, ChevronRight, Lock, Unlock, Printer, Mail, BellRing, Table2, Check, Moon, Sun, Star } from 'lucide-react'
import { store } from '../../lib/store'
import { nomeCompleto, gruppiPerLivello } from '../../types'
import { giorniDelMese, turnoSiApplica } from '../../lib/turniLogic'
import { isFestivo, isPrefestivo, isSuperfestivo, isoDate } from '../../lib/holidays'
import { useFestivita } from '../../hooks/useFestivita'
import { useFinalizzato } from '../../hooks/useFinalizzato'
import { useImpaginazione } from '../../hooks/useImpaginazione'
import { usePostazione } from '../../contexts/PostazioneContext'
import { useMeseSelezionato } from '../../hooks/useMeseSelezionato'
import { usePassiCompleti } from '../../hooks/usePassiCompleti'
import { PrerequisitiPassi } from '../../components/PrerequisitiPassi'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmModal } from '../../components/ConfirmModal'
import { useNavigate, useOutletContext } from 'react-router-dom'
import type { TurnoSchema, Turnista, TurnistaMese, ConfigVersione, Turno, Livello, AuthUser } from '../../types'

const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
const WD = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']

function oreTurno(inizio: string, fine: string): number {
  const [h1, m1] = inizio.split(':').map(Number)
  const [h2, m2] = fine.split(':').map(Number)
  let min = (h2 * 60 + m2) - (h1 * 60 + m1)
  if (min <= 0) min += 24 * 60
  return min / 60
}
const fmtOre = (x: number) => (Number.isInteger(x) ? `${x}` : x.toFixed(1))
const itDataOra = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

const ROLE_DOT: Record<Livello, string> = { admin: '#b91c1c', responsabile: '#ca8a04', turnista: '#1e40af', esterno: '#166534' }
const thS: CSSProperties = { background: '#2b3c24', color: '#fff', fontWeight: 700, fontSize: 12, padding: '5px 8px', textAlign: 'left', border: '1px solid #1f2d18' }
const tdS: CSSProperties = { padding: '4px 8px', border: '1px solid #d6d3cc', fontSize: 12.5 }

export function FinalizzazionePage() {
  const { postazioneId, postazioneAttiva } = usePostazione()
  const { anno, mese, meseKey, setMeseAnno } = useMeseSelezionato()
  const { user: actore } = useOutletContext<{ user: AuthUser | null }>()
  const nomeAutore = actore ? nomeCompleto(actore) : null
  const navigate = useNavigate()
  const { confirm, notify, confirmState } = useConfirm()
  const passi = usePassiCompleti(postazioneId, meseKey)
  const { finalizzato, info, invalida } = useFinalizzato(postazioneId, meseKey)
  const { festivoSet, superSet } = useFestivita(postazioneId)

  function cambiaMese(delta: number) {
    let m = mese + delta, a = anno
    if (m < 1) { m = 12; a-- } else if (m > 12) { m = 1; a++ }
    setMeseAnno(a, m)
  }

  const { data: versione } = useQuery<ConfigVersione | null>({ queryKey: ['versione', postazioneId, meseKey], queryFn: () => store.getVersioneMese(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: schema = [] } = useQuery<TurnoSchema[]>({ queryKey: ['schema', versione?.id], queryFn: () => store.getSchemaVersione(versione!.id), enabled: !!versione })
  const { data: turnisti = [] } = useQuery<Turnista[]>({ queryKey: ['turnisti', postazioneId], queryFn: () => store.getTurnisti(postazioneId!), enabled: !!postazioneId })
  const { data: personaleMese = [] } = useQuery<TurnistaMese[]>({ queryKey: ['personale-mese', postazioneId, meseKey], queryFn: () => store.getPersonaleMese(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: turni = [] } = useQuery<Turno[]>({ queryKey: ['turni', postazioneId, anno, mese], queryFn: () => store.getTurniMese(postazioneId!, anno, mese), enabled: !!postazioneId })
  const { data: superTurni = [] } = useQuery<{ data: string; turnoSchemaId: string }[]>({ queryKey: ['superfestivo-turni', postazioneId, meseKey], queryFn: () => store.getSuperfestivoTurni(postazioneId!, meseKey), enabled: !!postazioneId })
  const { fogliConTurni } = useImpaginazione(postazioneId, meseKey, schema)

  const tById = useMemo(() => new Map(turnisti.map(t => [t.id, t])), [turnisti])
  const ruoloMese = useMemo(() => new Map(personaleMese.map(p => [p.turnista_id, p.livello] as const)), [personaleMese])
  const livMese = (id: string): Livello => ruoloMese.get(id) ?? tById.get(id)?.livello ?? 'turnista'
  const turnoById = useMemo(() => new Map(schema.map(t => [t.id, t])), [schema])
  const superTurniByData = useMemo(() => { const m = new Map<string, string[]>(); superTurni.forEach(t => { const a = m.get(t.data); if (a) a.push(t.turnoSchemaId); else m.set(t.data, [t.turnoSchemaId]) }); return m }, [superTurni])
  const giorni = useMemo(() => giorniDelMese(anno, mese), [anno, mese])

  // turnisti assegnati per (data|turno), esclusi i reperibili (slot -1)
  const perCella = useMemo(() => {
    const m = new Map<string, string[]>()
    turni.filter(t => t.slot >= 0 && t.turnista_id).forEach(t => {
      const k = `${t.data}|${t.turno_schema_id}`
      const a = m.get(k); if (a) a.push(t.turnista_id!); else m.set(k, [t.turnista_id!])
    })
    return m
  }, [turni])

  // ── Conteggi di fine mese (estesi): T, Ore, N, F, PF, SF per persona ──
  const conteggi = useMemo(() => {
    const stat = new Map<string, { T: number; Ore: number; N: number; F: number; PF: number; SF: number }>()
    for (const t of turni) {
      if (t.slot < 0 || !t.turnista_id) continue
      const turno = turnoById.get(t.turno_schema_id); if (!turno) continue
      const s = stat.get(t.turnista_id) ?? { T: 0, Ore: 0, N: 0, F: 0, PF: 0, SF: 0 }
      s.T++
      s.Ore += oreTurno(turno.ora_inizio, turno.ora_fine)
      if (turno.ora_fine <= turno.ora_inizio) s.N++
      const [y, m, d] = t.data.split('-').map(Number); const date = new Date(y, m - 1, d)
      if (isFestivo(date, festivoSet)) s.F++; else if (isPrefestivo(date, festivoSet)) s.PF++
      if (isSuperfestivo(date, superSet) && superTurniByData.get(t.data)?.includes(t.turno_schema_id)) s.SF++
      stat.set(t.turnista_id, s)
    }
    return gruppiPerLivello(turnisti.filter(t => stat.has(t.id)).map(t => ({ ...t, livello: livMese(t.id) }))).flatMap(g => g.items).map(t => ({ t, ...stat.get(t.id)! }))
  }, [turni, turnoById, turnisti, ruoloMese, festivoSet, superSet, superTurniByData])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Griglia stampabile: per foglio, righe (giorno, turno) con i turnisti assegnati ──
  const grigliaStampa = useMemo(() => fogliConTurni.map(fc => {
    const righe: { ds: string; d: Date; turno: TurnoSchema; nomi: string[] }[] = []
    giorni.forEach(d => fc.turni.forEach(c => {
      if (!turnoSiApplica(c, d, festivoSet)) return
      const ids = perCella.get(`${isoDate(d)}|${c.id}`) ?? []
      righe.push({ ds: isoDate(d), d, turno: c, nomi: ids.map(id => { const t = tById.get(id); return t ? nomeCompleto(t) : '—' }) })
    }))
    return { foglio: fc.foglio, righe }
  }), [fogliConTurni, giorni, perCella, tById, festivoSet])

  // ── Email (predisposizione: invio Gmail guidato in una fase futura) ──
  const [destinatari, setDestinatari] = useState<string>(() => { try { return localStorage.getItem(`gm_finalizza_email_${postazioneId ?? ''}`) ?? '' } catch { return '' } })
  function salvaDestinatari(v: string) { setDestinatari(v); try { localStorage.setItem(`gm_finalizza_email_${postazioneId ?? ''}`, v) } catch { /* ignore */ } }
  function apriEmail() {
    const oggetto = encodeURIComponent(`Turni ${postazioneAttiva?.nome ?? ''} — ${MESI[mese - 1]} ${anno}`)
    const corpo = encodeURIComponent(`In allegato il calendario turni di ${MESI[mese - 1]} ${anno} per ${postazioneAttiva?.nome ?? ''}.\n(Genera prima il PDF con "Stampa / salva PDF" e allegalo a questa email.)\n\nCalendario online: ${location.origin}${import.meta.env.BASE_URL}turni`)
    location.href = `mailto:${destinatari.trim()}?subject=${oggetto}&body=${corpo}`
  }

  async function finalizza() {
    if (!postazioneId) return
    if (!(await confirm({ title: 'Finalizzare il mese?', message: `${MESI[mese - 1]} ${anno} verrà bloccato: turni, desiderata e personale diventeranno di sola lettura finché non lo sblocchi da questa pagina.`, confirmLabel: 'Finalizza e blocca' }))) return
    await store.finalizzaMese(postazioneId, meseKey, nomeAutore)
    store.addNotifica({ postazioneId, mese: meseKey, tipo: 'finalizzazione', messaggio: `${MESI[mese - 1]} ${anno} finalizzato e bloccato.`, target: '/admin/finalizza', perAdmin: true }).catch(() => {})
    invalida()
  }
  async function sblocca() {
    if (!postazioneId) return
    if (!(await confirm({ title: 'Sbloccare il mese?', message: `${MESI[mese - 1]} ${anno} tornerà modificabile (turni, desiderata, personale).`, confirmLabel: 'Sblocca', danger: true }))) return
    await store.sbloccaMese(postazioneId, meseKey)
    store.addNotifica({ postazioneId, mese: meseKey, tipo: 'finalizzazione', messaggio: `${MESI[mese - 1]} ${anno} sbloccato (di nuovo modificabile).`, target: '/admin/finalizza', perAdmin: true }).catch(() => {})
    invalida()
  }
  async function notificaTurnisti() {
    await notify({ title: 'In arrivo', message: 'La notifica del calendario definitivo ai turnisti sarà attivata in una prossima versione.' })
  }

  if (!postazioneAttiva) return <div className="p-6 text-sm text-stone-600">Seleziona una postazione dal Centro di Controllo.</div>

  const Header = (
    <div className="flex items-start gap-3">
      <ClipboardCheck size={22} style={{ color: '#476540' }} className="mt-1 shrink-0" />
      <div className="flex-1">
        <h1 className="text-2xl font-bold" style={{ color: '#2b3c24' }}>Finalizzazione - {postazioneAttiva.nome}</h1>
        <p className="text-sm text-stone-600">Chiusura di <strong>{MESI[mese - 1]} {anno}</strong>: blocco del mese, stampa/PDF ufficiale con invio email, conteggi di fine mese e notifica ai turnisti.</p>
      </div>
      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
        <button onClick={() => cambiaMese(-1)} className="btn-secondary px-2 py-1" title="Mese precedente"><ChevronLeft size={16} /></button>
        <span className="font-bold text-lg text-center" style={{ color: '#3a3d30', minWidth: 130 }}>{MESI[mese - 1]} {anno}</span>
        <button onClick={() => cambiaMese(1)} className="btn-secondary px-2 py-1" title="Mese successivo"><ChevronRight size={16} /></button>
      </div>
    </div>
  )

  if (passi.nuovaProcedura && !passi.tuttiOk) return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />
      {Header}
      <PrerequisitiPassi titolo={`Per finalizzare ${MESI[mese - 1]} ${anno} completa prima questi passi:`} onVai={navigate} passi={[
        { n: '①', label: 'Personale', ok: passi.passoPersonale, to: '/admin/turnisti' },
        { n: '②', label: 'Configurazione Turni', ok: passi.passo1, to: '/admin/schema' },
        { n: '③', label: 'Regole Turni', ok: passi.passo2, to: '/admin/regole' },
        { n: '④', label: 'Impaginazione', ok: passi.passo3, to: '/admin/impaginazione' },
        { n: '⑤', label: 'Festività', ok: passi.passoFestivita, to: '/admin/festivita' },
      ]} />
    </div>
  )

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />
      {Header}

      {/* ── 🔒 Blocco del mese ── */}
      <div className="card p-4" style={finalizzato ? { border: '1px solid #86efac', background: '#f0fdf4' } : undefined}>
        <div className="flex items-center gap-2 mb-2">
          {finalizzato ? <Lock size={16} style={{ color: '#166534' }} /> : <Unlock size={16} style={{ color: '#476540' }} />}
          <h2 className="text-base font-bold" style={{ color: '#2b3c24' }}>Blocco del mese</h2>
        </div>
        {finalizzato ? (
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm flex-1 min-w-[220px]" style={{ color: '#166534' }}>
              <Check size={14} className="inline mr-1" style={{ verticalAlign: '-2px' }} />
              <strong>{MESI[mese - 1]} {anno} è finalizzato</strong>{info?.autore ? <> da <strong>{info.autore}</strong></> : null}{info?.createdAt ? <> il {itDataOra(info.createdAt)}</> : null}. Turni, desiderata e personale sono in sola lettura.
            </p>
            <button onClick={sblocca} className="btn-secondary text-sm inline-flex items-center gap-1.5"><Unlock size={14} /> Sblocca il mese</button>
          </div>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm text-stone-600 flex-1 min-w-[220px]">Il mese è ancora <strong>modificabile</strong>. Finalizzandolo, turni, desiderata e personale diventano di sola lettura (sbloccabile da qui in ogni momento).</p>
            <button onClick={finalizza} className="btn-primary text-sm inline-flex items-center gap-1.5"><Lock size={14} /> Finalizza il mese</button>
          </div>
        )}
      </div>

      {/* ── 📄 Stampa PDF + Email ── */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Printer size={16} style={{ color: '#476540' }} />
          <h2 className="text-base font-bold" style={{ color: '#2b3c24' }}>Stampa / PDF ufficiale ed email</h2>
        </div>
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <p className="text-sm text-stone-600 flex-1 min-w-[220px]">Genera il tabellone del mese ({grigliaStampa.reduce((n, g) => n + g.righe.length, 0)} righe in {grigliaStampa.length} {grigliaStampa.length === 1 ? 'foglio' : 'fogli'}): dalla finestra di stampa puoi salvarlo come <strong>PDF</strong>.</p>
          <button onClick={() => window.print()} className="btn-primary text-sm inline-flex items-center gap-1.5"><Printer size={14} /> Stampa / salva PDF</button>
        </div>
        <div className="pt-3" style={{ borderTop: '1px solid #eef0ea' }}>
          <div className="flex items-center gap-2 mb-1.5"><Mail size={14} style={{ color: '#476540' }} /><p className="text-sm font-semibold" style={{ color: '#2b3c24' }}>Invio per email</p></div>
          <p className="text-xs text-stone-500 mb-2">L'invio automatico dall'indirizzo Gmail della postazione (con procedura guidata di autorizzazione) arriverà in una prossima versione. Intanto puoi aprire una bozza nel tuo programma di posta e allegare il PDF generato.</p>
          <div className="flex items-end gap-2 flex-wrap">
            <label className="text-xs text-stone-600 flex-1 min-w-[220px]">Destinatari (separati da virgola)<br />
              <input type="text" value={destinatari} onChange={e => salvaDestinatari(e.target.value)} placeholder="nome@esempio.it, altro@esempio.it" className="input text-sm w-full" />
            </label>
            <button onClick={apriEmail} className="btn-secondary text-sm inline-flex items-center gap-1.5"><Mail size={14} /> Apri bozza email</button>
          </div>
        </div>
      </div>

      {/* ── 📊 Conteggi di fine mese ── */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Table2 size={16} style={{ color: '#476540' }} />
          <h2 className="text-base font-bold" style={{ color: '#2b3c24' }}>Conteggi di fine mese</h2>
        </div>
        {conteggi.length === 0 ? (
          <p className="text-sm text-stone-500">Nessun turno assegnato in {MESI[mese - 1]} {anno}.</p>
        ) : (
          <>
            <div className="overflow-auto">
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #d6d3cc' }}>
                    <th style={{ textAlign: 'left', padding: '3px 6px' }}>Turnista</th>
                    <th style={{ padding: '3px 6px', textAlign: 'center', color: '#2b3c24', fontWeight: 800 }} title="Turni">T</th>
                    <th style={{ padding: '3px 6px', textAlign: 'center', color: '#0f766e', fontWeight: 800 }} title="Ore totali">Ore</th>
                    <th style={{ padding: '3px 6px', textAlign: 'center', color: '#64748b', fontWeight: 800 }} title="Notti">N</th>
                    <th style={{ padding: '3px 6px', textAlign: 'center', color: '#b91c1c', fontWeight: 800 }} title="Festivi">F</th>
                    <th style={{ padding: '3px 6px', textAlign: 'center', color: '#b45309', fontWeight: 800 }} title="Prefestivi">PF</th>
                    <th style={{ padding: '3px 6px', textAlign: 'center', color: '#a16207', fontWeight: 800 }} title="Superfestivi">SF</th>
                  </tr>
                </thead>
                <tbody>
                  {conteggi.map(({ t, T, Ore, N, F, PF, SF }) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid #eef0ea' }}>
                      <td style={{ padding: '3px 6px' }}>
                        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: ROLE_DOT[t.livello], marginRight: 5, verticalAlign: 'middle' }} />{nomeCompleto(t)}
                      </td>
                      <td style={{ padding: '3px', textAlign: 'center', fontWeight: 800, color: '#2b3c24' }}>{T}</td>
                      <td style={{ padding: '3px', textAlign: 'center', fontWeight: 700, color: '#0f766e' }}>{fmtOre(Ore)}</td>
                      <td style={{ padding: '3px', textAlign: 'center', color: '#475569' }}>{N || ''}</td>
                      <td style={{ padding: '3px', textAlign: 'center', color: '#b91c1c' }}>{F || ''}</td>
                      <td style={{ padding: '3px', textAlign: 'center', color: '#b45309' }}>{PF || ''}</td>
                      <td style={{ padding: '3px', textAlign: 'center', color: '#a16207', fontWeight: 700 }}>{SF || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] leading-snug text-stone-400 mt-1.5"><strong>T</strong>=turni · <strong>Ore</strong>=ore totali · <strong>N</strong>=notti · <strong>F</strong>=festivi · <strong>PF</strong>=prefestivi · <strong>SF</strong>=superfestivi (solo turni abbinati nel passo ⑤)</p>
          </>
        )}
      </div>

      {/* ── 🔔 Notifica ai turnisti ── */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <BellRing size={16} style={{ color: '#476540' }} />
          <h2 className="text-base font-bold" style={{ color: '#2b3c24' }}>Notifica calendario definitivo</h2>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-sm text-stone-600 flex-1 min-w-[220px]">Avvisa i turnisti che i turni di {MESI[mese - 1]} {anno} sono definitivi.</p>
          <button onClick={notificaTurnisti} className="btn-secondary text-sm inline-flex items-center gap-1.5"><BellRing size={14} /> Notifica i turnisti</button>
        </div>
      </div>

      {/* ── Area SOLO STAMPA: tabellone del mese per foglio ── */}
      <style>{`
        .print-area { display: none; }
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { display: block; position: absolute; left: 0; top: 0; width: 100%; padding: 8mm; background: #fff; }
          .print-area table { page-break-inside: auto; }
          .print-area tr { page-break-inside: avoid; }
        }
      `}</style>
      <div className="print-area">
        {grigliaStampa.map(({ foglio, righe }) => (
          <div key={foglio.id} style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#111', margin: '0 0 2px' }}>{postazioneAttiva.nome} — Turni di {MESI[mese - 1]} {anno}</h2>
            <p style={{ fontSize: 11, color: '#444', margin: '0 0 6px' }}>{foglio.nome}{finalizzato ? ' · CALENDARIO DEFINITIVO' : ' · bozza'} · stampato il {itDataOra(new Date().toISOString())}</p>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr><th style={thS}>Giorno</th><th style={thS}>Turno</th><th style={thS}>Turnisti</th></tr></thead>
              <tbody>
                {righe.map(({ ds, d, turno, nomi }) => {
                  const fest = isFestivo(d, festivoSet), pref = isPrefestivo(d, festivoSet)
                  const superF = isSuperfestivo(d, superSet)
                  const rowBg = fest ? '#fdecea' : pref ? '#fff5e6' : '#fff'
                  const overnight = turno.ora_fine <= turno.ora_inizio
                  return (
                    <tr key={`${ds}|${turno.id}`} style={{ background: rowBg }}>
                      <td style={{ ...tdS, whiteSpace: 'nowrap', fontWeight: 700, color: fest ? '#b91c1c' : pref ? '#b45309' : '#111' }}>
                        {d.getDate()} {WD[d.getDay()]}{superF ? <Star size={10} fill="#facc15" style={{ color: '#ca8a04', display: 'inline', marginLeft: 3, verticalAlign: '-1px' }} /> : null}
                      </td>
                      <td style={{ ...tdS, whiteSpace: 'nowrap' }}>
                        {overnight ? <Moon size={10} style={{ display: 'inline', color: '#64748b', marginRight: 3, verticalAlign: '-1px' }} /> : <Sun size={10} style={{ display: 'inline', color: '#f59e0b', marginRight: 3, verticalAlign: '-1px' }} />}
                        {turno.nome || 'Turno'} <span style={{ color: '#666', fontSize: 11 }}>{turno.ora_inizio}–{turno.ora_fine}</span>
                      </td>
                      <td style={tdS}>{nomi.length ? nomi.join(', ') : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
