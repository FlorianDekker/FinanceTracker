import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { DEFAULT_CLAIM_EXPIRY_MONTHS, outstandingClaims } from '../utils/claims'

export const CLAIM_EXPIRY_SETTING = 'claimExpiryMonths'

/* ------------------------------------------------------------------ *
 * Instelling: hoe lang mag je een werkkost nog declareren?             *
 * Altijd via deze helpers lezen/schrijven, nooit rechtstreeks.         *
 * ------------------------------------------------------------------ */

export async function getClaimExpiryMonths() {
  const row = await db.settings.get(CLAIM_EXPIRY_SETTING)
  const value = Number(row?.value)
  return Number.isFinite(value) && value > 0 ? Math.round(value) : DEFAULT_CLAIM_EXPIRY_MONTHS
}

export async function setClaimExpiryMonths(months) {
  const value = Math.max(1, Math.min(60, Math.round(Number(months) || DEFAULT_CLAIM_EXPIRY_MONTHS)))
  await db.settings.put({ key: CLAIM_EXPIRY_SETTING, value })
  return value
}

export function useClaimExpiryMonths() {
  return useLiveQuery(getClaimExpiryMonths, [], DEFAULT_CLAIM_EXPIRY_MONTHS)
}

/* ------------------------------------------------------------------ *
 * Declaraties zelf                                                     *
 * ------------------------------------------------------------------ */

/** Alle declaraties met een van de gegeven statussen (index op claimStatus). */
export function useClaimsByStatus(statuses) {
  const key = statuses.join(',')
  return useLiveQuery(
    () => db.transactions.where('claimStatus').anyOf(statuses).sortBy('date'),
    [key],
  )
}

/** Wat staat er nog uit bij werk: open + ingediend. */
export function useOutstandingClaims() {
  const txs = useClaimsByStatus(['open', 'submitted'])
  return { ...outstandingClaims(txs), transactions: txs ?? null, loading: txs === undefined }
}

/** Markeert of ontmarkeert een bestaande transactie als declaratie. */
export async function setClaimStatus(id, status) {
  return db.transactions.update(id, { claimStatus: status ?? null })
}
