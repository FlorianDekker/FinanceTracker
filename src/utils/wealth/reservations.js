/**
 * Reserveringen: geld dat er nog wel staat, maar al vergeven is (de
 * tandarts in november, de nieuwe laptop "ooit").
 *
 * Bewust zonder Dexie/React, zodat het testbaar is.
 */
import { round2 } from './months'

export function isOpen(reservation) {
  return !!reservation && !reservation.done
}

/**
 * @returns {{ planned, unplanned, open, done, count }}
 *          `planned` = open mét maand, `unplanned` = open zonder maand ("ooit").
 */
export function reservationTotals(reservations) {
  let planned = 0
  let unplanned = 0
  let done = 0
  let count = 0
  for (const r of reservations ?? []) {
    const bedrag = Number(r?.amount) || 0
    if (!isOpen(r)) { done += bedrag; continue }
    count += 1
    if (r.dueMonth) planned += bedrag
    else unplanned += bedrag
  }
  return {
    planned: round2(planned),
    unplanned: round2(unplanned),
    open: round2(planned + unplanned),
    done: round2(done),
    count,
  }
}

/** Vrij vermogen: wat je echt kunt uitgeven zonder je buffer of plannen te raken. */
export function freeWealth(total, buffer, reservations) {
  return round2((Number(total) || 0) - (Number(buffer) || 0) - reservationTotals(reservations).open)
}

/** Open reserveringen eerst op maand (ooit achteraan), daarna op bedrag. */
export function sortReservations(reservations) {
  return [...(reservations ?? [])].sort((a, b) => {
    if (isOpen(a) !== isOpen(b)) return isOpen(a) ? -1 : 1
    const ma = a.dueMonth ?? '9999-99'
    const mb = b.dueMonth ?? '9999-99'
    if (ma !== mb) return ma < mb ? -1 : 1
    return (Number(b.amount) || 0) - (Number(a.amount) || 0)
  })
}
