import { createPortal } from 'react-dom'

/**
 * Kleine stapel toasts onderaan het scherm (boven de tabbalk), met optioneel
 * een actieknop (bijv. "Herstel"). De timer en het wegklikken zitten in
 * `useToast.jsx`; dit component tekent alleen.
 */
export function ToastHost({ toasts, onAction, onDismiss }) {
  if (!toasts?.length) return null
  return createPortal(
    <div
      className="fixed left-0 right-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none"
      style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
    >
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="flex items-center gap-3 rounded-2xl px-4 py-3 w-full max-w-sm animate-fade-in-up pointer-events-auto"
          style={{ background: 'var(--color-text)', color: 'var(--color-bg)', boxShadow: 'var(--shadow-card)' }}
        >
          <span className="flex-1 text-sm min-w-0 truncate">
            {toast.message}
            {toast.actionLabel && <span className="opacity-60"> · </span>}
          </span>
          {toast.actionLabel && (
            <button
              onClick={() => onAction(toast.id)}
              className="text-sm font-semibold shrink-0"
              style={{ color: 'var(--color-accent)' }}
            >
              {toast.actionLabel}
            </button>
          )}
          <button
            onClick={() => onDismiss(toast.id)}
            aria-label="Sluiten"
            className="text-sm shrink-0 opacity-60"
          >
            ✕
          </button>
        </div>
      ))}
    </div>,
    document.body
  )
}
