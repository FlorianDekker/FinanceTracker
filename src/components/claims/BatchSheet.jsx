import { useState } from 'react'
import { TransactionListSheet } from '../transactions/TransactionListSheet'
import { Sheet } from '../ui/Sheet'
import { euro, fmtTimestamp } from '../../utils/formatters'
import { claimStatusOf, round2, sumAmount } from '../../utils/claims'
import { dissolveClaimBatch, mergeClaimBatches, reopenClaimBatch, useBatchItems, useSubmittedBatches } from '../../hooks/useClaims'

/**
 * De inhoud van één batch, in dezelfde lijstvorm als overal elders.
 * Een ingediende batch kun je hier ontbinden (alles terug naar open) of
 * samenvoegen met een andere ingediende batch (als werk ze in één keer
 * betaalt); een afgehandelde kun je heropenen (uitbetaling los, alles terug
 * naar ingediend).
 * `onSelectItem` opent het declaratie-detail van een item in plaats van het
 * transactieformulier.
 */
export function BatchSheet({ batch, onClose, onSelectItem }) {
  const items = useBatchItems(batch.id)
  const rejected = (items ?? []).filter(tx => claimStatusOf(tx) === 'rejected')
  const submitted = useSubmittedBatches()
  const anderen = (submitted ?? []).filter(b => b.id !== batch.id)
  const [mergeOpen, setMergeOpen] = useState(false)

  async function handleMerge(other) {
    const totaal = round2((batch.expectedTotal ?? 0) + (other.expectedTotal ?? 0))
    if (!window.confirm(
      `"${other.name}" samenvoegen met "${batch.name}"? Eén batch van ${euro(totaal)}; de naam "${batch.name}" blijft.`
    )) return
    await mergeClaimBatches(batch.id, [other.id])
    setMergeOpen(false)
    onClose()
  }

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
    <>
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
        <div className="space-y-2">
          {anderen.length > 0 && (
            <button onClick={() => setMergeOpen(true)} className="w-full text-sm rounded-xl py-2.5" style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}>
              Samenvoegen met andere batch
            </button>
          )}
          <button onClick={handleDissolve} className="w-full text-red text-sm bg-red-dim rounded-xl py-2.5">
            Batch ontbinden
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {batch.note && <div className="text-xs text-muted pb-1">{batch.note}</div>}
          <button onClick={handleReopen} className="w-full text-sm rounded-xl py-2.5" style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}>
            Batch heropenen
          </button>
        </div>
      )}
    />

    {mergeOpen && (
      <Sheet open onClose={() => setMergeOpen(false)} title="Samenvoegen met" subtitle={`Betaalt werk deze samen met "${batch.name}"?`}>
        <div className="divide-y divide-border">
          {anderen.map(b => (
            <button key={b.id} onClick={() => handleMerge(b)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
              <span className="text-xl shrink-0">💼</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{b.name}</div>
                <div className="text-[11px] text-muted">Ingediend {fmtTimestamp(b.submittedAt)}</div>
              </div>
              <span className="text-sm font-semibold tabular-nums">{euro(b.expectedTotal ?? 0)}</span>
            </button>
          ))}
        </div>
      </Sheet>
    )}
    </>
  )
}
