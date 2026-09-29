/* eslint-disable react-refresh/only-export-components -- provider + hook horen hier bij elkaar, zoals useCategories.jsx */
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { ToastHost } from '../components/ui/Toast'

const ToastContext = createContext(null)

let nextId = 1

/**
 * Kleine toast-laag voor de hele app: "Transactie verwijderd · Herstel".
 * `showToast(message, { actionLabel, onAction, duration })` toont een toast
 * onderaan het scherm die na `duration` ms (standaard 6s) vanzelf verdwijnt;
 * een tik op de actieknop roept `onAction()` aan en sluit 'm meteen.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())
  const actions = useRef(new Map())

  const dismiss = useCallback(id => {
    setToasts(list => list.filter(t => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) { clearTimeout(timer); timers.current.delete(id) }
    actions.current.delete(id)
  }, [])

  const showToast = useCallback((message, { actionLabel, onAction, duration = 6000 } = {}) => {
    const id = nextId++
    actions.current.set(id, onAction)
    setToasts(list => [...list, { id, message, actionLabel }])
    if (duration > 0) {
      timers.current.set(id, setTimeout(() => dismiss(id), duration))
    }
    return id
  }, [dismiss])

  const handleAction = useCallback(id => {
    actions.current.get(id)?.()
    dismiss(id)
  }, [dismiss])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <ToastHost toasts={toasts} onAction={handleAction} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

/** @returns {(message: string, options?: { actionLabel?: string, onAction?: Function, duration?: number }) => void} */
export function useToast() {
  const showToast = useContext(ToastContext)
  if (!showToast) throw new Error('useToast moet binnen een <ToastProvider> gebruikt worden')
  return showToast
}
