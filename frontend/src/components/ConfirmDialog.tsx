import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useT } from './ui'

/**
 * Blocking confirmation for destructive actions.
 *
 * Uses a native <dialog> so it is modal for real: focus is trapped, Escape
 * closes it, and the page behind cannot be tapped. A div-with-overlay looks the
 * same and lets a stray tap fall through to whatever is underneath — which on a
 * list of delete buttons means deleting the wrong row.
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = true,
}: {
  open: boolean
  title: string
  body?: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}) {
  const { t } = useT()
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancel() // tap the backdrop
      }}
      className="m-auto w-[min(92vw,360px)] rounded-3xl bg-surface p-0 backdrop:bg-black/45"
    >
      <div className="p-6">
        <div className="flex items-start gap-3">
          {danger && (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-danger/10 text-danger">
              <AlertTriangle size={20} />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold">{title}</h2>
            {body && (
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{body}</p>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-2">
          <button
            onClick={onConfirm}
            className={
              'press min-h-13 rounded-2xl px-5 text-[16px] font-semibold text-white ' +
              (danger ? 'bg-danger' : 'bg-accent')
            }
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className="press min-h-13 rounded-2xl bg-panel px-5 text-[16px] font-semibold text-ink"
          >
            {t('history.deleteCancel')}
          </button>
        </div>
      </div>
    </dialog>
  )
}
