import { Crown, UserCog, User, Eye, type LucideIcon } from 'lucide-react'
import type { Livello } from '../types'

/** Icone dei ruoli, coerenti in TUTTE le viste che elencano persone.
 *  Per cambiare l'icona di un ruolo, si tocca SOLO questa mappa. */
const META: Record<Livello, { Icon: LucideIcon; color: string; fill?: string }> = {
  admin:        { Icon: Crown,   color: '#a16207', fill: '#facc15' },   // corona dorata (come il proprietario)
  responsabile: { Icon: UserCog, color: '#92400e' },                    // omino "responsabile"
  turnista:     { Icon: User,    color: '#1e40af' },                    // omino (stile MSN)
  esterno:      { Icon: Eye,     color: '#166534' },                    // osservatore: occhio
}

/** Icona del ruolo (livello). Usare ovunque compaia un elenco di persone per ruolo. */
export function IconaLivello({ livello, size = 12, className }: { livello: Livello; size?: number; className?: string }) {
  const m = META[livello]
  return <m.Icon size={size} className={className} style={{ color: m.color }} fill={m.fill ?? 'none'} />
}
