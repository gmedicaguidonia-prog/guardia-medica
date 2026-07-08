import { useMemo, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ArrowRightLeft, Bell, ChevronLeft, ChevronRight } from 'lucide-react'
import { store } from '../../lib/store'
import { usePostazione } from '../../contexts/PostazioneContext'
import { useRealtimePostazione } from '../../hooks/useRealtime'
import { useMeseSelezionato } from '../../hooks/useMeseSelezionato'
import { NOTIFICA_CATEGORIE, categoriaNotifica } from '../../types'
import type { ConfigVersione, DesiderataFinestra, Notifica, CambioTurno, StatoCalendario } from '../../types'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
function meseKeyOffset(off: number): string {
  const d = new Date()
  const x = new Date(d.getFullYear(), d.getMonth() + off, 1)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`
}
function meseLabel(key: string): string { const [a, m] = key.split('-').map(Number); return `${MESI[m - 1]} ${a}` }
function itDate(iso: string): string { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}` }
function meseSucc(mese: string): string { const [a, m] = mese.split('-').map(Number); const d = new Date(a, m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function copre(v: ConfigVersione, mese: string): boolean {
  return v.valido_da <= mese && (v.valido_fino == null || mese <= v.valido_fino)
}

interface Avviso { testo: string; cta?: string; azione?: () => void }

function PlaceholderCard({ Icon, titolo, descr }: { Icon: typeof ArrowRightLeft; titolo: string; descr: string }) {
  return (
    <div className="card p-4 opacity-70">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} style={{ color: '#9ca3af' }} />
        <span className="font-semibold text-sm text-stone-600">{titolo}</span>
        <span className="ml-auto text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: '#e5e7eb', color: '#6b7280' }}>prossimamente</span>
      </div>
      <p className="text-xs text-stone-500">{descr}</p>
    </div>
  )
}

export function AdminHomePage() {
  const navigate = useNavigate()
  const { postazioneId, postazioneAttiva } = usePostazione()
  const { meseKey, setMeseAnno } = useMeseSelezionato()
  const meseProssimo = meseKeyOffset(1)
  const { data: versioni = [] } = useQuery<ConfigVersione[]>({ queryKey: ['versioni-all', postazioneId], queryFn: () => store.getVersioni(postazioneId!), enabled: !!postazioneId })
  const { data: finestraProssimo } = useQuery<DesiderataFinestra | null>({ queryKey: ['desiderata-finestra', postazioneId, meseProssimo], queryFn: () => store.getDesiderataFinestra(postazioneId!, meseProssimo), enabled: !!postazioneId })
  // Stato del calendario del mese prossimo: se è già pubblicato non ha senso chiedere le desiderata
  const { data: statoProssimo } = useQuery<StatoCalendario>({ queryKey: ['turni-stato', postazioneId, meseProssimo], queryFn: () => store.getStatoCalendario(postazioneId!, meseProssimo), enabled: !!postazioneId })
  // Panoramica dei mesi con calendario + finalizzati: per ricordare di finalizzare i mesi passati
  const { data: mesiPanoramica = [] } = useQuery<{ mese: string; finalizzato: boolean }[]>({ queryKey: ['mesi-panoramica', postazioneId], queryFn: () => store.getMesiPanoramica(postazioneId!), enabled: !!postazioneId })

  // ── Centro Notifiche ──
  const qc = useQueryClient()
  const { data: notifiche = [] } = useQuery<Notifica[]>({ queryKey: ['notifiche-admin', postazioneId], queryFn: () => store.getNotificheAdmin(postazioneId!), enabled: !!postazioneId })
  useEffect(() => { if (postazioneId) store.cleanupNotifiche(postazioneId).catch(() => {}) }, [postazioneId])
  // Cambi turno in attesa (riquadro dedicato, aggiornato in tempo reale)
  const { data: cambiPend = [] } = useQuery<CambioTurno[]>({ queryKey: ['cambi-pendenti', postazioneId], queryFn: () => store.getCambiPendenti(postazioneId!), enabled: !!postazioneId })
  // tempo reale: nuovi eventi compaiono nel Centro Notifiche senza ricaricare
  useRealtimePostazione(postazioneId, [
    { tabella: 'notifiche',   invalida: [['notifiche-admin', postazioneId]] },
    { tabella: 'cambi_turno', invalida: [['cambi-pendenti', postazioneId]] },
  ])
  // Il CORPO mostra le notifiche del MESE SELEZIONATO (raggruppate per categoria);
  // un riepilogo a chip dà visibilità ai NON letti degli ALTRI mesi (anche non mostrati).
  const notificheMese = useMemo(() => notifiche.filter(n => n.mese === meseKey), [notifiche, meseKey])
  const categorieMese = useMemo(() => NOTIFICA_CATEGORIE.map(c => ({ ...c, items: notificheMese.filter(n => categoriaNotifica(n.tipo) === c.key) })).filter(g => g.items.length), [notificheMese])
  const nonLetteMese = notificheMese.filter(n => !n.letta).length
  const nonLetteTot = notifiche.filter(n => !n.letta).length
  const riepilogoMesi = useMemo(() => {
    const m = new Map<string, number>()
    notifiche.forEach(n => { if (!n.letta && n.mese !== meseKey) m.set(n.mese, (m.get(n.mese) ?? 0) + 1) })
    return [...m.entries()].map(([mese, count]) => ({ mese, count })).sort((a, b) => b.mese.localeCompare(a.mese))
  }, [notifiche, meseKey])
  const vaiAlMese = (mese: string) => { const [a, m] = mese.split('-').map(Number); setMeseAnno(a, m) }
  // paginazione per sezione (mese|categoria): max 6 messaggi, poi selettore pagine
  const PER_PAGINA = 6
  const [pagine, setPagine] = useState<Record<string, number>>({})
  const setPagina = (key: string, p: number) => setPagine(prev => ({ ...prev, [key]: p }))
  async function marca(ids: string[]) { if (!ids.length) return; await store.marcaNotificheLette(ids); qc.invalidateQueries({ queryKey: ['notifiche-admin', postazioneId] }) }
  function vai(n: Notifica) { marca([n.id]); if (n.target) navigate(n.target) }
  const fmtDT = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  const avvisi = useMemo<Avviso[]>(() => {
    const out: Avviso[] = []
    const mesi = [0, 1, 2].map(meseKeyOffset)   // corrente + 2

    // Tutti i mesi PASSATI che hanno un calendario ma NON sono ancora finalizzati (dal più recente)
    const meseCorrente = meseKeyOffset(0)
    mesiPanoramica
      .filter(x => x.mese < meseCorrente && !x.finalizzato)
      .sort((a, b) => b.mese.localeCompare(a.mese))
      .forEach(x => out.push({
        testo: `${meseLabel(x.mese)} è terminato ma non è ancora stato finalizzato: bloccalo, genera il PDF ufficiale e chiudi i conteggi.`,
        cta: 'Finalizza',
        azione: () => { const [a, m] = x.mese.split('-').map(Number); setMeseAnno(a, m); navigate('/admin/finalizza') },
      }))
    // Mesi imminenti senza configurazione
    mesi.forEach(mk => {
      if (!versioni.some(v => copre(v, mk))) {
        out.push({ testo: `Nessuna configurazione turni per ${meseLabel(mk)}.`, cta: 'Configura', azione: () => navigate('/admin/schema') })
      }
    })
    // Configurazione in scadenza ma SENZA una nuova config che copra il mese dopo (altrimenti nessun buco → nessun avviso)
    const corrente = versioni.filter(v => copre(v, mesi[0])).sort((a, b) => b.valido_da.localeCompare(a.valido_da))[0]
    const scad = corrente?.valido_fino
    if (scad && scad <= mesi[1] && !versioni.some(v => copre(v, meseSucc(scad)))) {
      out.push({ testo: `La configurazione turni scade a ${meseLabel(scad)} e non c'è una nuova configurazione dopo: ricordati di riconfigurare i turni.`, cta: 'Configura', azione: () => navigate('/admin/schema') })
    }
    // Raccolta desiderata per il mese prossimo: solo se i turni sono configurati E il calendario NON è già stato pubblicato
    if (versioni.some(v => copre(v, meseProssimo)) && (statoProssimo ?? 'non_pubblicato') === 'non_pubblicato') {
      const oggiStr = new Date().toISOString().slice(0, 10)
      if (!finestraProssimo?.aperta_a) {
        out.push({ testo: `Non hai ancora impostato il periodo di raccolta desiderata per ${meseLabel(meseProssimo)}.`, cta: 'Imposta', azione: () => navigate('/admin/desiderata') })
      } else if (finestraProssimo.aperta_a < oggiStr) {
        out.push({ testo: `La raccolta desiderata per ${meseLabel(meseProssimo)} si è chiusa il ${itDate(finestraProssimo.aperta_a)}.`, cta: 'Apri', azione: () => navigate('/admin/desiderata') })
      }
    }
    return out
  }, [versioni, finestraProssimo, meseProssimo, statoProssimo, mesiPanoramica, navigate, setMeseAnno])

  return (
    <div className="relative min-h-full">
      {/* Logo filigrana, fuso con lo sfondo */}
      <img src={`${import.meta.env.BASE_URL}icon-512.png`} alt="" aria-hidden draggable={false}
        className="pointer-events-none select-none"
        style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(50%, 320px)', opacity: 0.06 }} />

      <div className="relative max-w-3xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--t-titolo)' }}>Riepilogo{postazioneAttiva ? ` - ${postazioneAttiva.nome}` : ''}</h1>

        {/* Promemoria e scadenze */}
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">Promemoria e scadenze</h2>
          {avvisi.length === 0 ? (
            <div className="card p-4 flex items-center gap-2 text-sm" style={{ color: '#166534' }}>
              <CheckCircle2 size={18} /> Tutto in regola: nessuna scadenza imminente.
            </div>
          ) : avvisi.map((a, i) => (
            <div key={i} className="card p-4 flex items-center gap-3" style={{ borderLeft: '4px solid #f59e0b' }}>
              <AlertTriangle size={18} style={{ color: '#d97706' }} className="shrink-0" />
              <span className="text-sm flex-1" style={{ color: 'var(--t-testo)' }}>{a.testo}</span>
              {a.cta && <button onClick={a.azione} className="btn-primary text-xs py-1 px-2.5 shrink-0">{a.cta}</button>}
            </div>
          ))}
        </section>

        {/* Cambi turno: richieste in attesa di approvazione */}
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">Cambi turno</h2>
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <ArrowRightLeft size={16} style={{ color: cambiPend.length ? '#b45309' : '#9ca3af' }} />
              <span className="font-semibold text-sm text-stone-700">Richieste di cambio turno</span>
              {cambiPend.length > 0 && <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#f59e0b', color: '#fff' }}>{cambiPend.length} in attesa</span>}
            </div>
            {cambiPend.length === 0 ? (
              <p className="text-xs text-stone-500">Nessuna richiesta in attesa di approvazione.</p>
            ) : (
              <div className="space-y-1.5">
                {cambiPend.slice(0, 5).map(c => (
                  <div key={c.id} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                    <span className="text-xs flex-1 leading-tight" style={{ color: 'var(--t-testo)' }}>
                      {c.descrizione || `Cambio del ${c.data}`}
                      {c.forzato && <span className="ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded align-middle" style={{ background: '#fee2e2', color: '#b91c1c' }}>FORZATO</span>}
                    </span>
                    <button onClick={() => { vaiAlMese(c.mese); navigate('/admin/turni') }} className="btn-primary text-[11px] py-0.5 px-2.5 shrink-0">Vai</button>
                  </div>
                ))}
                {cambiPend.length > 5 && <p className="text-[10px] text-stone-400">…e {cambiPend.length - 5} altr{cambiPend.length - 5 === 1 ? 'a' : 'e'}.</p>}
              </div>
            )}
          </div>
        </section>

        {/* Centro Notifiche — mese selezionato + riepilogo altri mesi (in fondo) */}
        {notifiche.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5"><Bell size={13} /> Centro Notifiche{nonLetteTot > 0 ? ` · ${nonLetteTot} non lett${nonLetteTot === 1 ? 'a' : 'e'}` : ''}</h2>
              {nonLetteTot > 0 && <button onClick={() => marca(notifiche.filter(n => !n.letta).map(n => n.id))} className="ml-auto text-[11px] text-stone-500 hover:text-stone-700">Segna tutte lette</button>}
            </div>

            {/* riepilogo NON letti degli ALTRI mesi (anche passati): clic per andarci */}
            {riepilogoMesi.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {riepilogoMesi.map(r => (
                  <button key={r.mese} onClick={() => vaiAlMese(r.mese)} title={`Vai alle notifiche di ${meseLabel(r.mese)}`}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-transform hover:scale-[1.03]" style={{ background: '#fff7ed', color: '#92400e', border: '1px solid #fed7aa' }}>
                    <span className="font-semibold">{meseLabel(r.mese)}</span>
                    <span className="px-1.5 rounded-full text-[10px] font-bold" style={{ background: '#f59e0b', color: '#fff' }}>{r.count}</span>
                    <span className="text-stone-500">{r.count === 1 ? 'nuova' : 'nuove'}</span>
                  </button>
                ))}
              </div>
            )}

            {/* corpo: notifiche del MESE SELEZIONATO, per categoria */}
            <div className="card p-3 space-y-2.5">
              <h3 className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--t-titolo)' }}>{meseLabel(meseKey)}{nonLetteMese > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#fef3c7', color: '#92400e' }}>{nonLetteMese} non lett{nonLetteMese === 1 ? 'a' : 'e'}</span>}</h3>
              {categorieMese.length === 0 ? (
                <p className="text-xs text-stone-400 italic">Nessuna notifica per {meseLabel(meseKey)}.</p>
              ) : categorieMese.map(c => {
                const key = `${meseKey}|${c.key}`
                const totPag = Math.ceil(c.items.length / PER_PAGINA)
                const pag = Math.min(pagine[key] ?? 0, Math.max(0, totPag - 1))
                const vis = c.items.slice(pag * PER_PAGINA, pag * PER_PAGINA + PER_PAGINA)
                return (
                  <div key={c.key}>
                    <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--t-accento)' }}>{c.label}{c.items.length > PER_PAGINA && <span className="text-stone-400 font-semibold normal-case"> · {c.items.length} messaggi</span>}</p>
                    <div className="space-y-1">
                      {vis.map(n => (
                        <div key={n.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: n.letta ? '#f7f8f4' : '#fff7ed' }}>
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: n.letta ? 'transparent' : '#f59e0b' }} />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm block leading-tight" style={{ color: n.letta ? '#78716c' : 'var(--t-testo)', fontWeight: n.letta ? 400 : 600 }}>{n.messaggio}</span>
                            <span className="text-[10px] text-stone-400">{n.autore ? `${n.autore} · ` : ''}{fmtDT(n.created_at)}</span>
                          </div>
                          {n.target
                            ? <button onClick={() => vai(n)} className="btn-primary text-[11px] py-0.5 px-2 shrink-0">Vai</button>
                            : !n.letta && <button onClick={() => marca([n.id])} className="text-[11px] text-stone-500 hover:text-stone-700 shrink-0">ok</button>}
                        </div>
                      ))}
                    </div>
                    {totPag > 1 && (
                      <div className="flex items-center justify-center gap-3 mt-1.5">
                        <button onClick={() => setPagina(key, Math.max(0, pag - 1))} disabled={pag === 0} className="p-0.5 rounded disabled:opacity-30 text-stone-500 hover:text-stone-700" title="Più recenti"><ChevronLeft size={15} /></button>
                        <span className="text-[10px] text-stone-400">{pag + 1} / {totPag}</span>
                        <button onClick={() => setPagina(key, Math.min(totPag - 1, pag + 1))} disabled={pag >= totPag - 1} className="p-0.5 rounded disabled:opacity-30 text-stone-500 hover:text-stone-700" title="Più vecchi"><ChevronRight size={15} /></button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
