import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PartyPopper, Plus, Trash2, Check, AlertTriangle, Star, Globe, MapPin, ChevronLeft, ChevronRight } from 'lucide-react'
import { store } from '../../lib/store'
import { festiviNazionali, NAZIONI } from '../../lib/holidays'
import { nomeCompleto } from '../../types'
import { usePostazione } from '../../contexts/PostazioneContext'
import { useMeseSelezionato } from '../../hooks/useMeseSelezionato'
import { usePassiCompleti, PASSO_FESTIVITA } from '../../hooks/usePassiCompleti'
import { useFinalizzato } from '../../hooks/useFinalizzato'
import { PrerequisitiPassi } from '../../components/PrerequisitiPassi'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmModal } from '../../components/ConfirmModal'
import { useNavigate, useOutletContext } from 'react-router-dom'
import type { TurnoSchema, ConfigVersione, Festivita, AuthUser } from '../../types'

const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
const WD = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']
const itData = (iso: string) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}` }
const wd = (iso: string) => WD[new Date(iso + 'T00:00:00').getDay()]

interface FestMese { data: string; nome: string; locale: boolean }

export function FestivitaPage() {
  const qc = useQueryClient()
  const { postazioneId, postazioneAttiva } = usePostazione()
  const { anno, mese, meseKey, setMeseAnno } = useMeseSelezionato()
  function cambiaMese(delta: number) {
    let m = mese + delta, a = anno
    if (m < 1) { m = 12; a-- } else if (m > 12) { m = 1; a++ }
    setMeseAnno(a, m)
  }
  const { user: actore } = useOutletContext<{ user: AuthUser | null }>()
  const nomeAutore = actore ? nomeCompleto(actore) : null
  const navigate = useNavigate()
  const { confirm, notify, confirmState } = useConfirm()
  const passi = usePassiCompleti(postazioneId, meseKey)
  const { finalizzato } = useFinalizzato(postazioneId, meseKey)   // mese bloccato ⇒ niente modifiche del mese

  const { data: nazione = 'IT' } = useQuery<string>({ queryKey: ['fest-nazione', postazioneId], queryFn: () => store.getNazione(postazioneId!), enabled: !!postazioneId })
  const { data: locali = [] } = useQuery<Festivita[]>({ queryKey: ['fest-custom', postazioneId], queryFn: () => store.getFestivitaCustom(postazioneId!), enabled: !!postazioneId })
  const { data: superOverride = [] } = useQuery<{ data: string; superfestivo: boolean }[]>({ queryKey: ['fest-super', postazioneId], queryFn: () => store.getFestivitaSuper(postazioneId!), enabled: !!postazioneId })
  const { data: superTurni = [] } = useQuery<{ data: string; turnoSchemaId: string }[]>({ queryKey: ['superfestivo-turni', postazioneId, meseKey], queryFn: () => store.getSuperfestivoTurni(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: versione } = useQuery<ConfigVersione | null>({ queryKey: ['versione', postazioneId, meseKey], queryFn: () => store.getVersioneMese(postazioneId!, meseKey), enabled: !!postazioneId })
  const { data: schema = [] } = useQuery<TurnoSchema[]>({ queryKey: ['schema', versione?.id], queryFn: () => store.getSchemaVersione(versione!.id), enabled: !!versione })
  const { data: attivazioni = [] } = useQuery<number[]>({ queryKey: ['attivazioni', postazioneId, meseKey], queryFn: () => store.getAttivazioni(postazioneId!, meseKey), enabled: !!postazioneId })

  const superSet = useMemo(() => new Set(superOverride.filter(s => s.superfestivo).map(s => s.data)), [superOverride])
  const turniByData = useMemo(() => {
    const m = new Map<string, string[]>()
    superTurni.forEach(t => { const a = m.get(t.data); if (a) a.push(t.turnoSchemaId); else m.set(t.data, [t.turnoSchemaId]) })
    return m
  }, [superTurni])

  // Festività del mese: nazionali (calcolate) + locali, deduplicate per data e ordinate.
  const festivitaMese = useMemo<FestMese[]>(() => {
    const naz: FestMese[] = festiviNazionali(nazione, anno).filter(f => f.data.startsWith(meseKey)).map(f => ({ data: f.data, nome: f.nome, locale: false }))
    const loc: FestMese[] = locali.filter(f => f.data.startsWith(meseKey)).map(f => ({ data: f.data, nome: f.descrizione, locale: true }))
    const seen = new Map<string, FestMese>()
    for (const f of [...naz, ...loc]) if (!seen.has(f.data)) seen.set(f.data, f)
    return [...seen.values()].sort((a, b) => a.data.localeCompare(b.data))
  }, [nazione, anno, meseKey, locali])

  const superDelMese = useMemo(() => festivitaMese.filter(f => superSet.has(f.data)), [festivitaMese, superSet])
  const superNonAbbinati = useMemo(() => superDelMese.filter(f => !(turniByData.get(f.data)?.length)), [superDelMese, turniByData])
  const attivato = attivazioni.includes(PASSO_FESTIVITA)
  const gateOk = attivato && superNonAbbinati.length === 0

  const [nuovaData, setNuovaData] = useState('')
  const [nuovaDescr, setNuovaDescr] = useState('')
  const [busy, setBusy] = useState(false)

  async function cambiaNazione(n: string) { if (!postazioneId) return; await store.setNazione(postazioneId, n); qc.invalidateQueries({ queryKey: ['fest-nazione', postazioneId] }) }
  async function aggiungiLocale() {
    if (!postazioneId || !nuovaData || !nuovaDescr.trim()) return
    setBusy(true)
    try { await store.addFestivitaCustom(postazioneId, nuovaData, nuovaDescr.trim()); setNuovaData(''); setNuovaDescr(''); qc.invalidateQueries({ queryKey: ['fest-custom', postazioneId] }) }
    finally { setBusy(false) }
  }
  async function rimuoviLocale(id: string, descr: string) {
    if (!(await confirm({ title: 'Rimuovere la festività?', message: `Vuoi rimuovere «${descr}»?`, confirmLabel: 'Rimuovi', danger: true }))) return
    await store.removeFestivitaCustom(id)
    qc.invalidateQueries({ queryKey: ['fest-custom', postazioneId] })
  }
  async function toggleSuper(data: string, val: boolean) {
    if (!postazioneId) return
    if (finalizzato) { await notify({ title: 'Mese finalizzato', message: 'Il mese è bloccato: sbloccalo dalla pagina ⑧ Finalizzazione per modificare i superfestivi.' }); return }
    await store.setFestivitaSuper(postazioneId, data, val)
    if (!val) await store.setSuperfestivoTurni(postazioneId, meseKey, data, [])   // smarcato → azzera gli abbinamenti
    else if (!(turniByData.get(data)?.length)) {
      // PRECOMPILAZIONE: propone l'abbinamento usato l'ultima volta per lo stesso giorno-mese
      // (es. 15/08 dell'anno scorso), mappando i turni per NOME sulla configurazione attuale.
      try {
        const nomi = await store.getSuperfestivoTurniPrecedente(postazioneId, data.slice(5), meseKey)
        if (nomi.length) {
          const norm = (s: string) => s.trim().toLowerCase()
          const nomiSet = new Set(nomi.map(norm))
          const ids = schema.filter(t => nomiSet.has(norm(t.nome))).map(t => t.id)
          if (ids.length) await store.setSuperfestivoTurni(postazioneId, meseKey, data, ids)
        }
      } catch { /* precompilazione best-effort: in caso di errore si abbina a mano */ }
    }
    qc.invalidateQueries({ queryKey: ['fest-super', postazioneId] })
    qc.invalidateQueries({ queryKey: ['superfestivo-turni', postazioneId, meseKey] })
  }
  async function toggleTurno(data: string, turnoId: string) {
    if (!postazioneId) return
    if (finalizzato) { await notify({ title: 'Mese finalizzato', message: 'Il mese è bloccato: sbloccalo dalla pagina ⑧ Finalizzazione per modificare gli abbinamenti.' }); return }
    const cur = turniByData.get(data) ?? []
    const next = cur.includes(turnoId) ? cur.filter(x => x !== turnoId) : [...cur, turnoId]
    await store.setSuperfestivoTurni(postazioneId, meseKey, data, next)
    qc.invalidateQueries({ queryKey: ['superfestivo-turni', postazioneId, meseKey] })
  }
  async function conferma() {
    if (!postazioneId) return
    setBusy(true)
    try {
      await store.attivaPasso(postazioneId, meseKey, PASSO_FESTIVITA, nomeAutore)
      qc.invalidateQueries({ queryKey: ['attivazioni', postazioneId, meseKey] })
      notify({ title: 'Festività confermate', message: 'Ora puoi procedere con Desiderata e Turni del Mese.' })
    } finally { setBusy(false) }
  }

  if (!postazioneAttiva) return <div className="p-6 text-sm text-stone-600">Seleziona una postazione dal Centro di Controllo.</div>

  // Prerequisiti: servono i passi ①–④ prima delle Festività.
  const prerequisitiMancano = passi.nuovaProcedura && !passi.passo3

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <ConfirmModal {...confirmState.opts} open={confirmState.open} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} />

      <div className="flex items-start gap-3">
        <PartyPopper size={22} style={{ color: '#476540' }} className="mt-1 shrink-0" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold" style={{ color: '#2b3c24' }}>Festività - {postazioneAttiva.nome}</h1>
          <p className="text-sm text-stone-600">Gestisci le festività di <strong>{MESI[mese - 1]} {anno}</strong>. Un <strong>superfestivo</strong> è un giorno festivo con retribuzione superiore: va marcato a mano e, ogni mese, abbinato ai turni che ne usufruiscono (es. Ferragosto solo il turno Giorno).</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <button onClick={() => cambiaMese(-1)} className="btn-secondary px-2 py-1" title="Mese precedente"><ChevronLeft size={16} /></button>
          <span className="font-bold text-lg text-center" style={{ color: '#3a3d30', minWidth: 130 }}>{MESI[mese - 1]} {anno}</span>
          <button onClick={() => cambiaMese(1)} className="btn-secondary px-2 py-1" title="Mese successivo"><ChevronRight size={16} /></button>
        </div>
      </div>

      {prerequisitiMancano ? (
        <PrerequisitiPassi titolo={`Per gestire le Festività di ${MESI[mese - 1]} ${anno} completa prima questi passi:`} onVai={navigate} passi={[
          { n: '①', label: 'Personale', ok: passi.passoPersonale, to: '/admin/turnisti' },
          { n: '②', label: 'Configurazione Turni', ok: passi.passo1, to: '/admin/schema' },
          { n: '③', label: 'Regole Turni', ok: passi.passo2, to: '/admin/regole' },
          { n: '④', label: 'Impaginazione', ok: passi.passo3, to: '/admin/impaginazione' },
        ]} />
      ) : (
        <>
          {/* Nazione */}
          <div className="card p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Globe size={16} style={{ color: '#476540' }} />
              <span className="text-sm font-semibold" style={{ color: '#2b3c24' }}>Nazione (festività nazionali):</span>
              <select value={nazione} onChange={e => cambiaNazione(e.target.value)} className="input text-sm w-auto">
                {NAZIONI.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
              </select>
            </div>
          </div>

          {/* Festività locali */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin size={16} style={{ color: '#476540' }} />
              <h2 className="text-base font-bold" style={{ color: '#2b3c24' }}>Festività locali</h2>
              <span className="text-xs text-stone-500">— aggiunte a mano (es. Santo Patrono), valide per questa postazione</span>
            </div>
            <div className="flex items-end gap-2 flex-wrap mb-3">
              <label className="text-xs text-stone-600">Data<br /><input type="date" value={nuovaData} onChange={e => setNuovaData(e.target.value)} className="input text-sm" /></label>
              <label className="text-xs text-stone-600 flex-1 min-w-[160px]">Descrizione<br /><input type="text" value={nuovaDescr} onChange={e => setNuovaDescr(e.target.value)} placeholder="Es. Santo Patrono" className="input text-sm w-full" /></label>
              <button onClick={aggiungiLocale} disabled={busy || !nuovaData || !nuovaDescr.trim()} className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-40"><Plus size={14} /> Aggiungi</button>
            </div>
            {locali.length === 0 ? (
              <p className="text-sm text-stone-500">Nessuna festività locale.</p>
            ) : (
              <ul className="divide-y">
                {locali.map(f => (
                  <li key={f.id} className="flex items-center gap-2 py-1.5 text-sm group">
                    <span className="font-mono text-xs text-stone-500 w-24">{itData(f.data)}</span>
                    <span className="text-stone-500 w-8">{wd(f.data)}</span>
                    <span className="flex-1 font-medium text-stone-800">{f.descrizione}</span>
                    <button onClick={() => rimuoviLocale(f.id, f.descrizione)} className="p-1.5 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition" title="Rimuovi"><Trash2 size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Festività del mese + superfestivo + abbinamento turni */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Star size={16} style={{ color: '#ca8a04' }} fill="#fde68a" />
              <h2 className="text-base font-bold" style={{ color: '#2b3c24' }}>Festività di {MESI[mese - 1]} {anno}</h2>
            </div>
            {festivitaMese.length === 0 ? (
              <p className="text-sm text-stone-500">Nessuna festività in questo mese.</p>
            ) : (
              <div className="space-y-2">
                {festivitaMese.map(f => {
                  const isSuper = superSet.has(f.data)
                  const turni = turniByData.get(f.data) ?? []
                  return (
                    <div key={f.data} className="border rounded-lg p-3" style={{ borderColor: isSuper ? '#fcd34d' : '#e5e7eb', background: isSuper ? '#fffbeb' : '#fff' }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-stone-500 w-24">{itData(f.data)}</span>
                        <span className="text-stone-500 w-8">{wd(f.data)}</span>
                        <span className="font-semibold text-stone-800">{f.nome}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={f.locale ? { background: '#e0f2fe', color: '#0369a1' } : { background: '#f1f5f9', color: '#475569' }}>{f.locale ? 'locale' : 'nazionale'}</span>
                        <label className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium cursor-pointer select-none" style={{ color: isSuper ? '#a16207' : '#64748b' }}>
                          <input type="checkbox" checked={isSuper} onChange={e => toggleSuper(f.data, e.target.checked)} />
                          <Star size={14} fill={isSuper ? '#facc15' : 'none'} style={{ color: '#ca8a04' }} /> Superfestivo
                        </label>
                      </div>
                      {isSuper && (
                        <div className="mt-2.5 pt-2.5 border-t" style={{ borderColor: '#fcd34d' }}>
                          <p className="text-xs font-semibold text-stone-600 mb-1.5">Turni che usufruiscono del superfestivo:</p>
                          {schema.length === 0 ? (
                            <p className="text-xs text-amber-700">Nessun turno configurato per questo mese (vedi Configurazione Turni).</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {schema.map(t => {
                                const on = turni.includes(t.id)
                                return (
                                  <button key={t.id} onClick={() => toggleTurno(f.data, t.id)}
                                    className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border transition"
                                    style={on ? { background: '#ca8a04', color: '#fff', borderColor: '#ca8a04' } : { background: '#fff', color: '#78716c', borderColor: '#e7e5e4' }}>
                                    {on && <Check size={12} />} {t.nome} <span className="opacity-70">{t.ora_inizio}–{t.ora_fine}</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                          {turni.length === 0 && <p className="text-xs text-red-600 mt-1.5 inline-flex items-center gap-1"><AlertTriangle size={12} /> Abbina almeno un turno.</p>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Conferma / gate */}
          <div className="card p-4">
            {superNonAbbinati.length > 0 ? (
              <div className="flex items-start gap-2 text-sm">
                <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: '#dc2626' }} />
                <div>
                  <p className="font-semibold text-red-700">Ci sono superfestivi senza turni abbinati.</p>
                  <p className="text-stone-600">Abbina un turno (o togli il superfestivo) per: <strong>{superNonAbbinati.map(f => itData(f.data)).join(', ')}</strong>.</p>
                </div>
              </div>
            ) : gateOk ? (
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#166534' }}>
                <Check size={18} /> Festività confermate per {MESI[mese - 1]} {anno}. Puoi procedere con Desiderata e Turni.
              </div>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-sm text-stone-600 flex-1 min-w-[200px]">
                  {superDelMese.length === 0
                    ? 'Nessun superfestivo marcato in questo mese. Conferma per procedere.'
                    : 'Superfestivi abbinati. Conferma per sbloccare i passi successivi.'}
                </p>
                <button onClick={conferma} disabled={busy} className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-40">
                  <Check size={15} /> {superDelMese.length === 0 ? 'Nessun superfestivo questo mese' : 'Conferma festività del mese'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
