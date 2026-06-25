import { useMemo, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ArrowRightLeft, Bell, ChevronLeft, ChevronRight } from 'lucide-react'
import { store } from '../../lib/store'
import { usePostazione } from '../../contexts/PostazioneContext'
import { useRealtimePostazione } from '../../hooks/useRealtime'
import { NOTIFICA_CATEGORIE, categoriaNotifica } from '../../types'
import type { ConfigVersione, DesiderataFinestra, Notifica } from '../../types'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
function meseKeyOffset(off: number): string {
  const d = new Date()
  const x = new Date(d.getFullYear(), d.getMonth() + off, 1)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`
}
function meseLabel(key: string): string { const [a, m] = key.split('-').map(Number); return `${MESI[m - 1]} ${a}` }
function itDate(iso: string): string { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}` }
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
  const meseProssimo = meseKeyOffset(1)
  const { data: versioni = [] } = useQuery<ConfigVersione[]>({ queryKey: ['versioni-all', postazioneId], queryFn: () => store.getVersioni(postazioneId!), enabled: !!postazioneId })
  const { data: finestraProssimo } = useQuery<DesiderataFinestra | null>({ queryKey: ['desiderata-finestra', postazioneId, meseProssimo], queryFn: () => store.getDesiderataFinestra(postazioneId!, meseProssimo), enabled: !!postazioneId })

  // ── Centro Notifiche ──
  const qc = useQueryClient()
  const { data: notifiche = [] } = useQuery<Notifica[]>({ queryKey: ['notifiche-admin', postazioneId], queryFn: () => store.getNotificheAdmin(postazioneId!), enabled: !!postazioneId })
  useEffect(() => { if (postazioneId) store.cleanupNotifiche(postazioneId).catch(() => {}) }, [postazioneId])
  // tempo reale: nuovi eventi compaiono nel Centro Notifiche senza ricaricare
  useRealtimePostazione(postazioneId, [{ tabella: 'notifiche', invalida: [['notifiche-admin', postazioneId]] }])
  const meseCorr = meseKeyOffset(0)
  // mostro gli eventi del mese in corso (o futuri) + tutti i non letti; quando un mese
  // è passato ed è tutto letto, sparisce. Raggruppo per MESE poi per CATEGORIA.
  const notificheVisibili = useMemo(() => notifiche.filter(n => n.mese >= meseCorr || !n.letta), [notifiche, meseCorr])
  const perMese = useMemo(() => {
    const mesi = [...new Set(notificheVisibili.map(n => n.mese))].sort((a, b) => b.localeCompare(a))
    return mesi.map(mese => {
      const dentro = notificheVisibili.filter(n => n.mese === mese)
      const categorie = NOTIFICA_CATEGORIE.map(c => ({ ...c, items: dentro.filter(n => categoriaNotifica(n.tipo) === c.key) })).filter(g => g.items.length)
      return { mese, categorie, nonLette: dentro.filter(n => !n.letta).length }
    }).filter(m => m.categorie.length)
  }, [notificheVisibili])
  const nonLette = notificheVisibili.filter(n => !n.letta).length
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

    // Mesi imminenti senza configurazione
    mesi.forEach(mk => {
      if (!versioni.some(v => copre(v, mk))) {
        out.push({ testo: `Nessuna configurazione turni per ${meseLabel(mk)}.`, cta: 'Configura', azione: () => navigate('/admin/schema') })
      }
    })
    // Configurazione attiva in scadenza entro il mese prossimo
    const corrente = versioni.filter(v => copre(v, mesi[0])).sort((a, b) => b.valido_da.localeCompare(a.valido_da))[0]
    if (corrente?.valido_fino && corrente.valido_fino <= mesi[1]) {
      out.push({ testo: `La configurazione turni scade a ${meseLabel(corrente.valido_fino)}: ricordati di riconfigurare i turni.`, cta: 'Configura', azione: () => navigate('/admin/schema') })
    }
    // Raccolta desiderata per il mese prossimo (solo se i turni sono già configurati)
    if (versioni.some(v => copre(v, meseProssimo))) {
      const oggiStr = new Date().toISOString().slice(0, 10)
      if (!finestraProssimo?.aperta_a) {
        out.push({ testo: `Non hai ancora impostato il periodo di raccolta desiderata per ${meseLabel(meseProssimo)}.`, cta: 'Imposta', azione: () => navigate('/admin/desiderata') })
      } else if (finestraProssimo.aperta_a < oggiStr) {
        out.push({ testo: `La raccolta desiderata per ${meseLabel(meseProssimo)} si è chiusa il ${itDate(finestraProssimo.aperta_a)}.`, cta: 'Apri', azione: () => navigate('/admin/desiderata') })
      }
    }
    return out
  }, [versioni, finestraProssimo, meseProssimo, navigate])

  return (
    <div className="relative min-h-full">
      {/* Logo filigrana, fuso con lo sfondo */}
      <img src={`${import.meta.env.BASE_URL}icon-512.png`} alt="" aria-hidden draggable={false}
        className="pointer-events-none select-none"
        style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(50%, 320px)', opacity: 0.06 }} />

      <div className="relative max-w-3xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-bold" style={{ color: '#2b3c24' }}>Riepilogo{postazioneAttiva ? ` - ${postazioneAttiva.nome}` : ''}</h1>

        {/* Centro Notifiche — per mese, poi per categoria */}
        {perMese.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5"><Bell size={13} /> Centro Notifiche{nonLette > 0 ? ` · ${nonLette} non lett${nonLette === 1 ? 'a' : 'e'}` : ''}</h2>
              {nonLette > 0 && <button onClick={() => marca(notificheVisibili.filter(n => !n.letta).map(n => n.id))} className="ml-auto text-[11px] text-stone-500 hover:text-stone-700">Segna tutte lette</button>}
            </div>
            {perMese.map(m => (
              <div key={m.mese} className="card p-3 space-y-2.5">
                <h3 className="text-base font-bold flex items-center gap-2" style={{ color: '#2b3c24' }}>{meseLabel(m.mese)}{m.nonLette > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#fef3c7', color: '#92400e' }}>{m.nonLette} non lett{m.nonLette === 1 ? 'a' : 'e'}</span>}</h3>
                {m.categorie.map(c => {
                  const key = `${m.mese}|${c.key}`
                  const totPag = Math.ceil(c.items.length / PER_PAGINA)
                  const pag = Math.min(pagine[key] ?? 0, Math.max(0, totPag - 1))
                  const vis = c.items.slice(pag * PER_PAGINA, pag * PER_PAGINA + PER_PAGINA)
                  return (
                    <div key={c.key}>
                      <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#476540' }}>{c.label}{c.items.length > PER_PAGINA && <span className="text-stone-400 font-semibold normal-case"> · {c.items.length} messaggi</span>}</p>
                      <div className="space-y-1">
                        {vis.map(n => (
                          <div key={n.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: n.letta ? '#f7f8f4' : '#fff7ed' }}>
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: n.letta ? 'transparent' : '#f59e0b' }} />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm block leading-tight" style={{ color: n.letta ? '#78716c' : '#3a3d30', fontWeight: n.letta ? 400 : 600 }}>{n.messaggio}</span>
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
            ))}
          </section>
        )}

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
              <span className="text-sm flex-1" style={{ color: '#3a3d30' }}>{a.testo}</span>
              {a.cta && <button onClick={a.azione} className="btn-primary text-xs py-1 px-2.5 shrink-0">{a.cta}</button>}
            </div>
          ))}
        </section>

        {/* Funzioni in arrivo (placeholder) */}
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">In arrivo</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <PlaceholderCard Icon={ArrowRightLeft} titolo="Cambi turno" descr="Avvisi delle richieste e dei cambi turno effettuati dai turnisti." />
          </div>
        </section>
      </div>
    </div>
  )
}
