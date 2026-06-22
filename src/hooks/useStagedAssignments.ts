import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Modifiche "in sospeso" su una mappa chiave→turnistaId, con SALVATAGGIO
 * ESPLICITO (niente autosave). `serverMap` = stato salvato (DB), `local` =
 * stato mostrato/modificato. `dirty` è calcolato confrontando le due mappe.
 * Quando `serverMap` cambia (refetch) e non si sta editando, `local` si
 * riallinea da solo.
 */
export function useStagedAssignments(serverMap: Map<string, string>) {
  const [local, setLocal] = useState<Map<string, string>>(() => new Map(serverMap))
  const editingRef = useRef(false)

  useEffect(() => { if (!editingRef.current) setLocal(new Map(serverMap)) }, [serverMap])

  const dirty = useMemo(() => {
    if (local.size !== serverMap.size) return true
    for (const [k, v] of local) if (serverMap.get(k) !== v) return true
    return false
  }, [local, serverMap])

  useEffect(() => { if (!dirty) editingRef.current = false }, [dirty])

  function set(key: string, val: string | null) {
    editingRef.current = true
    setLocal(prev => { const n = new Map(prev); if (val === null) n.delete(key); else n.set(key, val); return n })
  }
  function diff(): { key: string; value: string | null }[] {
    const out: { key: string; value: string | null }[] = []
    const keys = new Set<string>([...serverMap.keys(), ...local.keys()])
    keys.forEach(k => { const s = serverMap.get(k) ?? null; const l = local.get(k) ?? null; if (s !== l) out.push({ key: k, value: l }) })
    return out
  }
  function discard() { editingRef.current = false; setLocal(new Map(serverMap)) }

  return { local, dirty, set, diff, discard }
}
