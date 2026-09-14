import { Sheet } from '../ui/Sheet'
import { CategoryIcon } from '../categories/CategoryPicker'
import { useCategories } from '../../hooks/useCategories'
import { euro, fmtDate } from '../../utils/formatters'
import { CLAIM_STATUS_LABELS, claimAgeLabel, claimStatusOf } from '../../utils/claims'
import { unmarkClaim } from '../../hooks/useClaims'

/**
 * Detail van één declaratie. Bij een open item kun je hem hier alsnog uit de
 * declaraties halen of hem afkeuren (dan landt de uitgave in een categorie).
 */
export function ClaimItemSheet({ tx, onClose, onReject }) {
  const { catMap } = useCategories()
  const cat = catMap[tx.category]
  const sub = cat?.subs?.find(s => s.key === tx.subcategory)
  const status = claimStatusOf(tx)

  async function handleUnmark() {
    if (!window.confirm('Markering weghalen? Deze uitgave telt daarna weer gewoon mee in je budget.')) return
    await unmarkClaim(tx.id)
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={tx.note || cat?.label || 'Declaratie'} subtitle={fmtDate(tx.date)} bodyClassName="p-4">
      <div className="flex items-center gap-3 rounded-xl px-3 py-3" style={{ background: 'var(--color-surface-2)' }}>
        <CategoryIcon cat={cat} size={32} />
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate">
            {cat?.label ?? tx.category}
            {sub && <span className="text-muted"> › {sub.label}</span>}
          </div>
          <div className="text-[11px] text-muted">
            {CLAIM_STATUS_LABELS[status] ?? 'Geen declaratie'} · {claimAgeLabel(tx)} oud
          </div>
        </div>
        <span className="text-sm font-semibold tabular-nums">{euro(tx.amount)}</span>
      </div>

      {status === 'open' && (
        <div className="mt-4 space-y-2 pb-2">
          {onReject && (
            <button
              onClick={() => onReject(tx)}
              className="w-full rounded-2xl py-3 text-sm font-semibold"
              style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
            >
              Niet declareren
            </button>
          )}
          <button onClick={handleUnmark} className="w-full text-red text-sm bg-red-dim rounded-xl py-2.5">
            Markering weghalen
          </button>
        </div>
      )}

      {status === 'submitted' && (
        <p className="text-xs text-muted mt-4">
          Deze declaratie is ingediend. Ontbind de batch als je hem toch wil aanpassen.
        </p>
      )}
      {status === 'rejected' && (
        <p className="text-xs text-muted mt-4">
          Afgekeurd — deze uitgave telt gewoon mee in {cat?.label ?? tx.category}.
        </p>
      )}
      {status === 'paid' && (
        <p className="text-xs text-muted mt-4">Terugbetaald door werk.</p>
      )}
    </Sheet>
  )
}
