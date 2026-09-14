import { TransactionListSheet } from '../transactions/TransactionListSheet'
import { euro, fmtTimestamp } from '../../utils/formatters'
import { claimStatusOf, sumAmount } from '../../utils/claims'
import { dissolveClaimBatch, useBatchItems } from '../../hooks/useClaims'

/**
 * De inhoud van één batch, in dezelfde lijstvorm als overal elders.
 * Een ingediende batch kun je hier ontbinden; alles gaat dan terug naar open.
 */
export function BatchSheet({ batch, onClose }) {
  const items = useBatchItems(batch.id)
  const rejected = (items ?? []).filter(tx => claimStatusOf(tx) === 'rejected')

  async function handleDissolve() {
    if (!window.confirm(
      `"${batch.name}" ontbinden? De ${items?.length ?? 0} declaraties komen terug bij Open en de batch verdwijnt.`
    )) return
    await dissolveClaimBatch(batch.id)
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
      footer={batch.status === 'submitted' ? (
        <button onClick={handleDissolve} className="w-full text-red text-sm bg-red-dim rounded-xl py-2.5">
          Batch ontbinden
        </button>
      ) : batch.note ? (
        <div className="text-xs text-muted pb-1">{batch.note}</div>
      ) : null}
    />
  )
}
