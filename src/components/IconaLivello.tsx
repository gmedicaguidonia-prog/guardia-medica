import { Crown, Users, Eye, type LucideIcon } from 'lucide-react'
import type { Livello } from '../types'

/** Colore di ciascun ruolo — combacia con i badge di TurnistiPage. */
const COLORE: Record<Livello, string> = {
  admin:        '#a16207',
  responsabile: '#ca8a04',   // giallo / oro
  turnista:     '#1e40af',
  esterno:      '#166534',
}

/** Icona Lucide di ciascun ruolo. Responsabile e turnista condividono le due sagome
 *  (logo MSN Messenger): li distingue il colore (oro vs blu). */
const LUCIDE: Record<Livello, { Icon: LucideIcon; fill?: string }> = {
  admin:        { Icon: Crown, fill: '#facc15' },   // corona dorata (come il proprietario)
  responsabile: { Icon: Users },                    // due sagome, oro
  turnista:     { Icon: Users },                    // due sagome, blu
  esterno:      { Icon: Eye },                       // osservatore: occhio
}

/** Icona del ruolo (livello). Usare ovunque compaia un elenco di persone per ruolo.
 *  `color` opzionale sovrascrive il colore del ruolo (utile per adattarsi a un tema). */
export function IconaLivello({ livello, size = 12, className, color }: { livello: Livello; size?: number; className?: string; color?: string }) {
  const m = LUCIDE[livello]
  return <m.Icon size={size} className={className} style={{ color: color ?? COLORE[livello] }} fill={m.fill ?? 'none'} />
}
