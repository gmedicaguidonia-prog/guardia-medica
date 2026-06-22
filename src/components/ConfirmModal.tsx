import type { ConfirmOpts } from '../hooks/useConfirm'

interface Props extends ConfirmOpts {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open, title, message, confirmLabel = 'Conferma', cancelLabel = 'Annulla', danger, onConfirm, onCancel,
}: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(28,40,24,0.45)' }}
      onClick={onCancel}>
      <div className="card w-full max-w-sm p-5"
        style={{ animation: 'fadeSlideIn 160ms ease-out' }}
        onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold mb-1.5" style={{ color: '#2b3c24' }}>{title}</h3>
        <p className="text-sm mb-5" style={{ color: '#5a5a4a' }}>{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary py-1.5 px-3 text-sm">{cancelLabel}</button>
          <button onClick={onConfirm}
            className={`${danger ? 'btn-danger' : 'btn-primary'} py-1.5 px-3 text-sm`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
