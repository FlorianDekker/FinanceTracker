import { TransactionListSheet } from '../transactions/TransactionListSheet'
import { euro, fmtTimestamp } from '../../utils/formatters'
import { claimStatusOf, sumAmount } from '../../utils/claims'
import { dissolveClaimBatch, reopenClaimBatch, useBatchItems } from '../../hooks/useClaims'

/**
 * De inhoud van één batch, in dezelfde lijstvorm als overal elders.
 * Een ingediende batch kun je hier ontbinden (alles terug naar open); een
 * afgehandelde kun je heropenen (uitbetaling los, alles terug naar ingediend).
 * `onSelectItem` opent het declaratie-detail van een item in plaats van het
 * transactieformulier.
 */
export function BatchSheet({ batch, onClose, onSelectItem }) {
  const items = useBatchItems(batch.id)
  const rejected = (items ?? []).filter(tx => claimStatusOf(tx) === 'rejected')

  async function handleDissolve() {
    if (!window.confirm(
      `"${batch.name}" ontbinden? De ${items?.length ?? 0} declaraties komen terug bij Open en de batch verdwijnt.`
    )) return
    await dissolveClaimBatch(batch.id)
    onClose()
  }

  async function handleReopen() {
    if (!window.confirm(
      `"${batch.name}" heropenen? De uitbetaling wordt losgekoppeld en de ${items?.length ?? 0} declaraties staan weer op Ingediend.`
    )) return
    await reopenClaimBatch(batch.id)
    onClose()
  }

  const subtitle = batch.status === 'closed'
    ? `Uitbetaald ${fmtTimestamp(batch.paidAt)} · ${euro(batch.paidAmount ?? 0)}` +
      (rejected.length ? ` · ${euro(sumAmount(rejected))} afgekeurd` : '')
    : `Ingediend ${fmtTimestamp(batch.submittedAt)} · ${euro(batch.expectedTotal ?? 0)}`

  return (
    <TransactionListSheet
      onClose={onClose}
      title={batch.name}
      subtitle={subtitle}
      leading={<span className="text-xl shrink-0">💼</span>}
      transactions={items}
      emptyText="Deze batch is leeg"
      signOf={() => '-'}
      toneOf={() => 'text-red'}
      onSelect={onSelectItem}
      footer={batch.status === 'submitted' ? (
        <button onClick={handleDissolve} className="w-full text-red text-sm bg-red-dim rounded-xl py-2.5">
          Batch ontbinden
        </button>
      ) : (
        <div className="space-y-2">
          {batch.note && <div className="text-xs text-muted pb-1">{batch.note}</div>}
          <button onClick={handleReopen} className="w-full text-sm rounded-xl py-2.5" style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}>
            Batch heropenen
          </button>
        </div>
      )}
    />
  )
}
