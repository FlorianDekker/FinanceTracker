import { countsInTotals, round2 } from './claims'
import { fmtDate } from './formatters'

/**
 * Pure hulplogica voor het Transacties-scherm: dag-koppen en maandtotalen.
 * Bewust vrij van React/Dexie zodat dit los te testen is (zie
 * tests/unit/transactions.test.mjs), net als utils/claims.js.
 */

const WEEKDAYS_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "Vandaag", "Gisteren" of "ma 22 sep" — voor de sticky dagkop in de lijst. */
export function dayHeaderLabel(dateStr, now = new Date()) {
  const date = String(dateStr ?? '').slice(0, 10)
  const today = ymd(now)
  const gisteren = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  if (date === today) return 'Vandaag'
  if (date === gisteren) return 'Gisteren'
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return date
  return `${WEEKDAYS_SHORT[d.getDay()]} ${fmtDate(date)}`
}

/**
 * Groepeert transacties (al gesorteerd, nieuwste eerst of oudste eerst — de
 * volgorde blijft ongemoeid) per dag, met per dag het netto van wat meetelt
 * (zie `countsInTotals`).
 *
 * @returns {Array<{date: string, label: string, transactions: Array, net: number}>}
 */
export function groupTransactionsByDay(transactions, now = new Date()) {
  const groups = []
  let current = null
  for (const tx of transactions ?? []) {
    const date = String(tx?.date ?? '').slice(0, 10)
    if (!current || current.date !== date) {
      current = { date, label: dayHeaderLabel(date, now), transactions: [], net: 0 }
      groups.push(current)
    }
    current.transactions.push(tx)
    if (countsInTotals(tx)) current.net += tx.type === 'credit' ? (tx.amount ?? 0) : -(tx.amount ?? 0)
  }
  for (const g of groups) g.net = round2(g.net)
  return groups
}

/**
 * In / uit / netto van een lijst transacties, met dezelfde meetel-regels als
 * de rest van de app (`countsInTotals`): lopende declaraties en
 * declaratie-uitbetalingen tellen niet mee.
 */
export function monthTotals(transactions) {
  let inn = 0
  let out = 0
  for (const tx of transactions ?? []) {
    if (!countsInTotals(tx)) continue
    if (tx.type === 'credit') inn += tx.amount ?? 0
    else out += tx.amount ?? 0
  }
  inn = round2(inn)
  out = round2(out)
  return { in: inn, out, net: round2(inn - out) }
}
