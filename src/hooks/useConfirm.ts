import { useCallback, useRef, useState } from 'react'

export interface ConfirmOpts {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

const DEFAULT: ConfirmOpts = { title: '', message: '' }

/** Conferma a promessa: `await confirm({...})` → true/false.
 *  Da abbinare a <ConfirmModal {...confirmState} />. */
export function useConfirm() {
  const [state, setState] = useState<{ open: boolean; opts: ConfirmOpts }>({ open: false, opts: DEFAULT })
  const resolverRef = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOpts) => new Promise<boolean>(resolve => {
    resolverRef.current = resolve
    setState({ open: true, opts })
  }), [])

  const finish = useCallback((v: boolean) => {
    resolverRef.current?.(v)
    resolverRef.current = null
    setState(s => ({ open: false, opts: s.opts }))
  }, [])

  return {
    confirm,
    confirmState: {
      open:      state.open,
      opts:      state.opts,
      onConfirm: () => finish(true),
      onCancel:  () => finish(false),
    },
  }
}
