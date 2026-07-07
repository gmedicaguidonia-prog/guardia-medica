import { Crown, Users, Eye, type LucideIcon } from 'lucide-react'
import { useId } from 'react'
import type { Livello } from '../types'

/** Colore di ciascun ruolo — combacia con i badge di TurnistiPage. */
const COLORE: Record<Livello, string> = {
  admin:        '#a16207',
  responsabile: '#92400e',
  turnista:     '#1e40af',
  esterno:      '#166534',
}

/** Icone Lucide per i ruoli "semplici" (il responsabile è disegnato a parte, con la fascia). */
const LUCIDE: Partial<Record<Livello, { Icon: LucideIcon; fill?: string }>> = {
  admin:    { Icon: Crown, fill: '#facc15' },   // corona dorata (come il proprietario)
  turnista: { Icon: Users },                    // due sagome = logo MSN Messenger
  esterno:  { Icon: Eye },                       // osservatore: occhio
}

/** Responsabile = lo stesso omino del turnista (Users) con una fascia diagonale
 *  argentata "da sindaco" sul petto. La fascia è un overlay sovrapposto all'icona
 *  Lucide vera, così resta identica al turnista qualunque versione di lucide-react. */
function OminoConFascia({ size, color, className }: { size: number; color: string; className?: string }) {
  const gid = 'fascia' + useId().replace(/:/g, '')   // id pulito (senza ':') per url(#...)
  return (
    <span className={className} style={{ position: 'relative', display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
      <Users size={size} style={{ color }} />
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#e2e8f0" />
            <stop offset="0.35" stopColor="#f8fafc" />
            <stop offset="0.55" stopColor="#cbd5e1" />
            <stop offset="0.8" stopColor="#94a3b8" />
            <stop offset="1" stopColor="#e2e8f0" />
          </linearGradient>
        </defs>
        {/* bordo scuro + banda argentata lucida = fascia da sindaco */}
        <line x1="13.5" y1="12.6" x2="4.5" y2="20.6" stroke="#475569" strokeWidth="3.6" strokeLinecap="round" />
        <line x1="13.5" y1="12.6" x2="4.5" y2="20.6" stroke={`url(#${gid})`} strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </span>
  )
}

/** Icona del ruolo (livello). Usare ovunque compaia un elenco di persone per ruolo.
 *  `color` opzionale sovrascrive il colore del ruolo (utile per adattarsi a un tema). */
export function IconaLivello({ livello, size = 12, className, color }: { livello: Livello; size?: number; className?: string; color?: string }) {
  const col = color ?? COLORE[livello]
  if (livello === 'responsabile') return <OminoConFascia size={size} color={col} className={className} />
  const m = LUCIDE[livello]!
  return <m.Icon size={size} className={className} style={{ color: col }} fill={m.fill ?? 'none'} />
}
