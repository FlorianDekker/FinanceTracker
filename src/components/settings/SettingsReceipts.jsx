import { useState } from 'react'
import { AiReceiptsCard } from './AiReceiptsCard'
import { StatusToast } from './StatusToast'

/**
 * Instellingen -> Bonnetjes & AI: dunne wrapper rond AiReceiptsCard met een
 * eigen statustoast (was voorheen de gedeelde toast op de Instellingen-pagina).
 */
export function SettingsReceipts() {
  const [status, setStatus] = useState(null)
  return (
    <>
      <StatusToast status={status} onDismiss={() => setStatus(null)} />
      <AiReceiptsCard onStatus={setStatus} />
    </>
  )
}
