import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, Clock, Check, Ban, Bell } from 'lucide-react'
import { store } from '../lib/store'
import { nomeCompleto } from '../types'
import type { AuthUser, Notifica, CandidaturaAttesa, MiaPostazione } from '../types'

const itDate = (iso: string) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}` }
const fmtDT = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Centro Messaggi del turnista: candidature inviate (con Ritira), approvazioni e
 *  rifiuti ricevuti. Icona a lettera con numerello arancione pulsante sui nuovi. */
export function CentroMessaggi({ user }: { user: AuthUser }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: mie = [] } = useQuery<MiaPostazione[]>({ queryKey: ['mie-postazioni', user.id], queryFn: () => store.getMiePostazioni(user.id), enabled: !!user.id })
  const membershipIds = mie.map(m => m.membershipId)
  const { data: notifiche = [] } = useQuery<Notifica[]>({ queryKey: ['notifiche-utente', membershipIds], queryFn: () => store.getNotificheUtente(membershipIds), enabled: membershipIds.length > 0 })
  const { data: candidature = [] } = useQuery<CandidaturaAttesa[]>({ queryKey: ['richieste-utente', membershipIds], queryFn: () => store.getRichiesteUtente(membershipIds), enabled: membershipIds.length > 0 })

  const nonLette = notifiche.filter(n => !n.letta).length

  async function apri() {
    const open2 = !open
    setOpen(open2)
    if (open2 && nonLette > 0) {
      await store.marcaNotificheLette(notifiche.filter(n => !n.letta).map(n => n.id))
      qc.invalidateQueries({ queryKey: ['notifiche-utente', membershipIds] })
    }
  }
  async function ritira(c: CandidaturaAttesa) {
    if (!window.confirm(`Ritirare la candidatura per ${c.turnoNome} del ${itDate(c.data)}?`)) return
    try {
      const cur = await store.getRichiestaCorrente(c.postazioneId, c.data, c.turnoSchemaId, c.turnistaId)
      if (!cur || cur.stato === 'in_attesa') {
        if (cur) {
          await store.removeRichiesta(cur.id)
          store.addNotifica({ postazioneId: c.postazioneId, mese: c.data.slice(0, 7), tipo: 'candidatura_ritirata', messaggio: `${nomeCompleto(user) || 'Un turnista'} ha ritirato la candidatura per ${c.turnoNome} del ${itDate(c.data)}`, target: '/admin/turni', perAdmin: true }).catch(() => {})
        }
      } else if (cur.stato === 'approvata') {
        alert('La tua candidatura è stata appena APPROVATA. Per annullarla ora contatta il tuo responsabile.')
      } else {
        alert('La tua candidatura era già stata RIFIUTATA: non c’è nulla da ritirare.')
      }
      qc.invalidateQueries({ queryKey: ['richieste-utente', membershipIds] })
      qc.invalidateQueries({ queryKey: ['richieste'] })
    } catch (e) { console.error('[Messaggi] ritiro fallito:', e); alert('Errore durante il ritiro.') }
  }

  const iconaTipo = (tipo: string) =>
    tipo === 'candidatura_approvata' ? <Check size={13} style={{ color: '#16a34a' }} />
      : tipo === 'candidatura_rifiutata' ? <Ban size={13} style={{ color: '#dc2626' }} />
      : <Bell size={13} style={{ color: '#476540' }} />

  return (
    <div className="relative shrink-0">
      <button onClick={apri} title="Messaggi"
        className={`relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${nonLette > 0 ? 'animate-pulse' : ''}`}
        style={{ background: nonLette > 0 ? 'rgba(249,115,22,0.18)' : 'transparent' }}>
        <Mail size={18} style={{ color: nonLette > 0 ? '#fb923c' : '#9ab488' }} />
        {nonLette > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center shadow"
            style={{ background: '#f97316', color: '#fff' }}>{nonLette}</span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 z-50 card p-2 shadow-2xl text-stone-800" style={{ width: 320, maxHeight: '70vh', overflow: 'auto', animation: 'fadeSlideIn 140ms ease-out' }}>
            <h3 className="text-[11px] font-bold uppercase tracking-wider px-1 pb-1 flex items-center gap-1.5" style={{ color: '#476540' }}><Mail size={13} /> Messaggi</h3>

            {candidature.length > 0 && (
              <div className="mb-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider px-1 pt-1 text-stone-400">Candidature in attesa</p>
                {candidature.map(c => (
                  <div key={c.id} className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg" style={{ background: '#fffbeb' }}>
                    <Clock size={13} style={{ color: '#92400e' }} className="shrink-0" />
                    <span className="text-xs flex-1 leading-tight" style={{ color: '#3a3d30' }}>{c.turnoNome} del <strong>{itDate(c.data)}</strong>{c.postazioneNome ? ` · ${c.postazioneNome}` : ''}</span>
                    <button onClick={() => ritira(c)} className="text-[11px] font-semibold px-2 py-0.5 rounded shrink-0" style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}>Ritira</button>
                  </div>
                ))}
              </div>
            )}

            {notifiche.length > 0 ? (
              <div>
                {candidature.length > 0 && <p className="text-[10px] font-bold uppercase tracking-wider px-1 pt-1 text-stone-400">Aggiornamenti</p>}
                {notifiche.map(n => (
                  <div key={n.id} className="flex items-start gap-2 px-1.5 py-1.5 rounded-lg" style={{ background: n.letta ? '#f7f8f4' : '#fff7ed' }}>
                    <span className="mt-0.5 shrink-0">{iconaTipo(n.tipo)}</span>
                    <span className="text-xs flex-1 leading-tight" style={{ color: n.letta ? '#78716c' : '#3a3d30', fontWeight: n.letta ? 400 : 600 }}>{n.messaggio}</span>
                    <span className="text-[9px] text-stone-400 shrink-0">{fmtDT(n.created_at)}</span>
                  </div>
                ))}
              </div>
            ) : candidature.length === 0 && (
              <p className="text-xs text-stone-400 px-1.5 py-3 text-center">Nessun messaggio.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
