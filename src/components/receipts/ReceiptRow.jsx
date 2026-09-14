import { useEffect, useMemo, useState } from 'react'
import { euro } from '../../utils/formatters'
import { useReceiptForTransaction } from '../../hooks/useReceipts'
import { ReceiptCapture } from './ReceiptCapture'
import { ReceiptViewer } from './ReceiptViewer'

function Thumb({ blob }) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  if (!url) return <span className="text-xl w-10 text-center">🧾</span>
  return <img src={url} alt="Bon" className="w-10 h-10 rounded-lg object-cover shrink-0" />
}

/**
 * De bon-regel in `TransactionForm`: een thumbnail met het aantal regels als er
 * een bon hangt, anders de ingang om er een toe te voegen. Een bon die hier
 * wordt toegevoegd is meteen aan deze transactie gekoppeld, dus de validatie
 * gaat tegen `transaction.amount`.
 */
export function ReceiptRow({ transaction }) {
  const bon = useReceiptForTransaction(transaction?.id ?? null)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [viewerId, setViewerId] = useState(null)

  if (bon === undefined) return null

  const verschil = bon?.total != null && transaction?.amount != null
    ? Math.round((Math.abs(bon.total - transaction.amount) + Number.EPSILON) * 100) / 100
    : null

  return (
    <>
      {bon ? (
        <button
          onClick={() => setViewerId(bon.id)}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left"
          style={{ background: 'var(--color-surface-2)', minHeight: 44 }}
        >
          <Thumb blob={bon.thumb} />
          <span className="flex-1 min-w-0 text-sm">
            🧾 Bon · {bon.items?.length ?? 0} {(bon.items?.length ?? 0) === 1 ? 'regel' : 'regels'}
            <span className="block text-[11px] text-muted truncate">
              {bon.merchant ?? 'nog niet uitgelezen'}
              {bon.total != null && ` · ${euro(bon.total)}`}
              {verschil != null && verschil >= 0.01 && ` · verschil ${euro(verschil)}`}
            </span>
          </span>
          <span className="text-muted">›</span>
        </button>
      ) : (
        <button
          onClick={() => setCaptureOpen(true)}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left"
          style={{ background: 'var(--color-surface-2)', minHeight: 44 }}
        >
          <span className="text-lg w-6 text-center">🧾</span>
          <span className="flex-1 text-sm">
            Bon toevoegen
            <span className="block text-[11px] text-muted">Foto, screenshot of PDF — wordt meteen gekoppeld</span>
          </span>
          <span className="text-muted">›</span>
        </button>
      )}

      <ReceiptCapture
        open={captureOpen}
        transactionId={transaction?.id ?? null}
        expectedTotal={transaction?.amount ?? null}
        onClose={() => setCaptureOpen(false)}
        onDone={id => { setCaptureOpen(false); setViewerId(id) }}
      />

      {viewerId != null && <ReceiptViewer receiptId={viewerId} onClose={() => setViewerId(null)} />}
    </>
  )
}
