import { CLAIM_STATUS_CLASSES, CLAIM_STATUS_LABELS, claimStatusOf } from '../../utils/claims'

/**
 * Klein label achter een transactie die bij een declaratie hoort.
 * Rendert niets voor gewone transacties.
 */
export function ClaimBadge({ tx, className = '' }) {
  const status = claimStatusOf(tx)
  if (!status) return null
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${CLAIM_STATUS_CLASSES[status]} ${className}`}
    >
      💼 {CLAIM_STATUS_LABELS[status]}
    </span>
  )
}
