import { useState, useMemo, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, CalendarHeart, ChevronLeft, ChevronRight, Moon, Sun, MapPin, Info, Phone, Check, Ban } from 'lucide-react'
import { store } from '../lib/store'
import { giorniDelMese, turnoSiApplica } from '../lib/turniLogic'
import { isFestivo, isPrefestivo, isoDate } from '../lib/holidays'
import { nomeCompleto } from '../types'
import type { AuthUser, TurnoSchema, Turno, Turnista, MiaPostazione, ConfigVersione, DesiderataFinestra, Desiderata, TipoDesiderata } from '../types'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const WD = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab']
const REP = -1
const thStyle: CSSProperties = { background: '#2b3c24', color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 10px', textAlign: 'left', border: '1px solid #1f2d18' }
const tdBase: CSSProperties = { padding: '6px 10px', border: '1px solid #e5e7eb', verticalAlign: 'top' }
const itDate = (iso: string) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}` }

function Avviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="card p-5 flex items-start gap-3" style={{ background: '#f0f4ee' }}>
      <Info size={18} className="shrink-0 mt-0.5" style={{ color: '#476540' }} />
      <p className="text-sm" style={{ color: '#3a4a30' }}>{children}</p>
    </div>
  )
}

export function PublicTurniPage({ user }: { user: AuthUser | null }) {
  const qc = useQueryClient()
  const oggi = new Date()
  const [anno, setAnno] = useState(oggi.getFullYear())
  const [mese, setMese] = useState(oggi.getMonth() + 1)
  const meseKey = `${anno}-${String(mese).padStart(2, '0')}`
  const oggiStr = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(oggi.getDate()).padStart(2, '0')}`
  const [tab, setTab] = useState<'turni' | 'desiderata'>('turni')

  // postazioni dell'utente
  const { data: mie = [], isLoading: loadingMie } = useQuery<MiaPostazione[]>({ queryKey: ['mie-postazioni', user?.id], queryFn: () => store.getMiePostazioni(user!.id), enabled: !!user })
  const [postazioneId, setPostazioneId] = useState<string | null>(null)
  useEffect(() => { if (mie.length && (!postazioneId || !mie.some(m => m.postazioneId === postazioneId))) setPostazioneId(mie[0].postazioneId) }, [mie, postazioneId])
  const mia = mie.find(m => m.postazioneId === postazioneId) ?? null

  // dati del mese per la postazione selezionata
  const { data: versione } = useQuery<ConfigVersione | null>({ queryKey: ['versione', postazioneId, meseKey], queryFn: () => store.getVersioneMese(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: schema = [] } = useQuery<TurnoSchema[]>({ queryKey: ['schema', versione?.id], queryFn: () => store.getSchemaVersione(versione!.id), enabled: !!versione })
  const { data: personale = [] } = useQuery<Turnista[]>({ queryKey: ['turnisti', postazioneId], queryFn: () => store.getTurnisti(postazioneId!), enabled: !!postazioneId })
  const { data: turni = [] } = useQuery<Turno[]>({ queryKey: ['turni', postazioneId, anno, mese], queryFn: () => store.getTurniMese(postazioneId!, anno, mese), enabled: !!postazioneId && tab === 'turni' })
  const { data: finestra } = useQuery<DesiderataFinestra | null>({ queryKey: ['desiderata-finestra', postazioneId, meseKey], queryFn: () => store.getDesiderataFinestra(postazioneId!, meseKey), enabled: !!postazioneId && tab === 'desiderata' })
  const { data: desiderata = [] } = useQuery<Desiderata[]>({ queryKey: ['desiderata', postazioneId, anno, mese], queryFn: () => store.getDesiderataMese(postazioneId!, anno, mese), enabled: !!postazioneId && tab === 'desiderata' })

  const nomeById = useMemo(() => new Map(personale.map(p => [p.id, nomeCompleto(p)])), [personale])
  const giorni = useMemo(() => giorniDelMese(anno, mese), [anno, mese])
  const righe = useMemo(() => {
    const out: { ds: string; d: Date; turno: TurnoSchema }[] = []
    giorni.forEach(d => schema.forEach(c => { if (turnoSiApplica(c, d)) out.push({ ds: isoDate(d), d, turno: c }) }))
    return out
  }, [giorni, schema])

  // calendario: assegnazioni
  const assegn = useMemo(() => {
    const m = new Map<string, string[]>(), rep = new Map<string, string>()
    turni.forEach(t => { if (!t.turnista_id) return; const k = `${t.data}|${t.turno_schema_id}`; if (t.slot === REP) rep.set(k, t.turnista_id); else { const a = m.get(k) ?? []; a.push(t.turnista_id); m.set(k, a) } })
    return { m, rep }
  }, [turni])

  // desiderata: la MIA preferenza per turno
  const miaPref = useMemo(() => {
    const m = new Map<string, TipoDesiderata>()
    desiderata.filter(d => d.turnista_id === mia?.membershipId).forEach(d => m.set(`${d.data}|${d.turno_schema_id}`, d.tipo))
    return m
  }, [desiderata, mia])

  async function setPref(ds: string, turnoId: string, tipo: TipoDesiderata | null) {
    if (!mia) return
    await store.setDesiderata(postazioneId!, ds, turnoId, mia.membershipId, tipo)
    await qc.invalidateQueries({ queryKey: ['desiderata', postazioneId, anno, mese] })
  }

  function cambiaMese(delta: number) {
    let m = mese + delta, a = anno
    if (m < 1) { m = 12; a-- } else if (m > 12) { m = 1; a++ }
    setMese(m); setAnno(a)
  }

  // stato finestra desiderata
  const fin = finestra
  const desStato: 'aperta' | 'programmata' | 'chiusa' | 'assente' =
    !fin?.aperta_a ? 'assente'
    : fin.aperta_da && oggiStr < fin.aperta_da ? 'programmata'
    : fin.aperta_a < oggiStr ? 'chiusa'
    : 'aperta'

  const turniPubblicati = !!versione && schema.length > 0 && turni.length > 0

  const MeseNav = (
    <div className="flex items-center gap-2">
      <button onClick={() => cambiaMese(-1)} className="btn-secondary px-2 py-1"><ChevronLeft size={16} /></button>
      <span className="font-semibold text-sm text-center" style={{ color: '#3a3d30', minWidth: 140 }}>{MESI[mese - 1]} {anno}</span>
      <button onClick={() => cambiaMese(1)} className="btn-secondary px-2 py-1"><ChevronRight size={16} /></button>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarDays size={22} style={{ color: '#476540' }} />
        <h1 className="text-2xl font-bold" style={{ color: '#2b3c24' }}>I miei turni</h1>
      </div>

      {mie.length === 0 ? (
        <Avviso>{loadingMie ? 'Caricamento…' : 'Non sei ancora inserito nel personale di nessuna postazione. Chiedi al responsabile di aggiungerti.'}</Avviso>
      ) : (
        <>
          {/* Selettore postazione */}
          <div className="card p-3 flex items-center gap-2 flex-wrap">
            <MapPin size={16} style={{ color: '#476540' }} />
            <span className="text-sm font-semibold" style={{ color: '#2b3c24' }}>Postazione:</span>
            {mie.length > 1 ? (
              <select value={postazioneId ?? ''} onChange={e => setPostazioneId(e.target.value)} className="input text-sm w-auto">
                {mie.map(m => <option key={m.postazioneId} value={m.postazioneId}>{m.nome}</option>)}
              </select>
            ) : <span className="text-sm" style={{ color: '#3a3d30' }}>{mie[0].nome}</span>}
            {mia && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#eef3ea', color: '#476540' }}>sei {mia.livello}</span>}
          </div>

          {/* Schede */}
          <div className="flex gap-2">
            {([['turni', 'Calendario Turni', CalendarDays], ['desiderata', 'Desiderata - Indisponibilità', CalendarHeart]] as const).map(([key, label, Icon]) => (
              <button key={key} onClick={() => setTab(key)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
                style={tab === key ? { background: '#456b3a', color: '#fff' } : { background: '#eef1ea', color: '#476540' }}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>

          {/* Selettore mese */}
          <div className="flex justify-end">{MeseNav}</div>

          {/* ───── CALENDARIO TURNI ───── */}
          {tab === 'turni' && (
            !turniPubblicati ? (
              <Avviso>Il <strong>calendario turni</strong> di {MESI[mese - 1]} {anno} non è ancora stato pubblicato per questa postazione.</Avviso>
            ) : (
              <div className="card overflow-auto">
                <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
                  <thead><tr><th style={thStyle}>Giorno</th><th style={thStyle}>Turno</th><th style={thStyle}>Chi è in turno</th></tr></thead>
                  <tbody>
                    {righe.map(({ ds, d, turno }) => {
                      const fest = isFestivo(d), pref = isPrefestivo(d)
                      const dayColor = fest ? '#b91c1c' : pref ? '#b45309' : '#2b3c24'
                      const rowBg = fest ? '#fdecea' : pref ? '#fff5e6' : '#fff'
                      const overnight = turno.ora_fine <= turno.ora_inizio
                      const k = `${ds}|${turno.id}`
                      const ids = assegn.m.get(k) ?? []
                      const rep = assegn.rep.get(k)
                      return (
                        <tr key={k} style={{ background: rowBg }}>
                          <td style={{ ...tdBase, whiteSpace: 'nowrap' }}><span style={{ fontWeight: 700, color: dayColor }}>{d.getDate()} {WD[d.getDay()]}</span></td>
                          <td style={{ ...tdBase, whiteSpace: 'nowrap' }}>
                            <span className="inline-flex items-center gap-1">{overnight ? <Moon size={12} style={{ color: '#64748b' }} /> : <Sun size={12} style={{ color: '#f59e0b' }} />}{turno.nome || 'Turno'}</span>
                            <div style={{ fontSize: 10, color: '#94a3b8' }}>{turno.ora_inizio}–{turno.ora_fine}</div>
                          </td>
                          <td style={tdBase}>
                            <div className="flex flex-wrap gap-1.5 items-center">
                              {ids.length === 0 && !rep && <span className="text-[11px] text-stone-300 italic">—</span>}
                              {ids.map(id => {
                                const io = id === mia?.membershipId
                                return <span key={id} className="rounded px-2 py-0.5 text-[11px] font-medium" style={io ? { background: '#2e7d32', color: '#fff' } : { background: '#eef1ea', color: '#3a3d30' }}>{nomeById.get(id) ?? '—'}{io && ' (tu)'}</span>
                              })}
                              {rep && <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium" style={rep === mia?.membershipId ? { background: '#b45309', color: '#fff' } : { background: '#fff5e6', color: '#92400e' }} title="Reperibile"><Phone size={10} /> {nomeById.get(rep) ?? '—'}{rep === mia?.membershipId && ' (tu)'}</span>}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ───── DESIDERATA ───── */}
          {tab === 'desiderata' && (
            desStato === 'assente' ? (
              <Avviso>La raccolta <strong>desiderata / indisponibilità</strong> di {MESI[mese - 1]} {anno} non è ancora stata pubblicata.</Avviso>
            ) : desStato === 'programmata' ? (
              <Avviso>La raccolta desiderata di {MESI[mese - 1]} {anno} aprirà il <strong>{itDate(fin!.aperta_da!)}</strong>.</Avviso>
            ) : desStato === 'chiusa' ? (
              <Avviso>La raccolta desiderata di {MESI[mese - 1]} {anno} si è chiusa il <strong>{itDate(fin!.aperta_a!)}</strong>.</Avviso>
            ) : !versione || schema.length === 0 ? (
              <Avviso>Non ci sono turni configurati per {MESI[mese - 1]} {anno}.</Avviso>
            ) : (
              <>
                <p className="text-xs text-stone-500">Per ogni turno indica se lo <strong style={{ color: '#166534' }}>vorresti</strong> o se <strong style={{ color: '#b91c1c' }}>non puoi</strong>. Raccolta aperta fino al {itDate(fin!.aperta_a!)}.</p>
                <div className="card overflow-auto">
                  <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
                    <thead><tr><th style={thStyle}>Giorno</th><th style={thStyle}>Turno</th><th style={{ ...thStyle, textAlign: 'center' }}>La tua scelta</th></tr></thead>
                    <tbody>
                      {righe.map(({ ds, d, turno }) => {
                        const fest = isFestivo(d), pref = isPrefestivo(d)
                        const dayColor = fest ? '#b91c1c' : pref ? '#b45309' : '#2b3c24'
                        const rowBg = fest ? '#fdecea' : pref ? '#fff5e6' : '#fff'
                        const overnight = turno.ora_fine <= turno.ora_inizio
                        const cur = miaPref.get(`${ds}|${turno.id}`)
                        return (
                          <tr key={`${ds}|${turno.id}`} style={{ background: rowBg }}>
                            <td style={{ ...tdBase, whiteSpace: 'nowrap' }}><span style={{ fontWeight: 700, color: dayColor }}>{d.getDate()} {WD[d.getDay()]}</span></td>
                            <td style={{ ...tdBase, whiteSpace: 'nowrap' }}>
                              <span className="inline-flex items-center gap-1">{overnight ? <Moon size={12} style={{ color: '#64748b' }} /> : <Sun size={12} style={{ color: '#f59e0b' }} />}{turno.nome || 'Turno'}</span>
                              <div style={{ fontSize: 10, color: '#94a3b8' }}>{turno.ora_inizio}–{turno.ora_fine}</div>
                            </td>
                            <td style={{ ...tdBase, textAlign: 'center' }}>
                              <div className="inline-flex gap-1.5">
                                <button onClick={() => setPref(ds, turno.id, cur === 'desiderata' ? null : 'desiderata')}
                                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold border transition-colors"
                                  style={cur === 'desiderata' ? { background: '#16a34a', color: '#fff', borderColor: '#15803d' } : { background: '#fff', color: '#166534', borderColor: '#bbf7d0' }}>
                                  <Check size={12} /> Vorrei
                                </button>
                                <button onClick={() => setPref(ds, turno.id, cur === 'indisponibilita' ? null : 'indisponibilita')}
                                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold border transition-colors"
                                  style={cur === 'indisponibilita' ? { background: '#dc2626', color: '#fff', borderColor: '#b91c1c' } : { background: '#fff', color: '#b91c1c', borderColor: '#fecaca' }}>
                                  <Ban size={12} /> Non posso
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )
          )}
        </>
      )}
    </div>
  )
}
