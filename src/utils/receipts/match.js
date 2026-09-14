// Bon → banktransactie koppelen.
//
// Pure functies zonder DB-toegang, zodat ze los te testen zijn en de UI ze
// zowel op een volledige lijst als op een voorgefilterde selectie kan draaien.

const DAG_MS = 24 * 60 * 60 * 1000

function naarDatum(v) {
  if (!v) return null
  const s = typeof v === 'string' ? v.slice(0, 10) : ''
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

export function dagenVerschil(a, b) {
  const da = naarDatum(a)
  const db = naarDatum(b)
  if (da == null || db == null) return null
  return Math.round(Math.abs(da - db) / DAG_MS)
}

/**
 * Zoekt banktransacties die bij een bon kunnen horen.
 *
 * Sortering: eerst op bedragverschil (cent-nauwkeurig hoort bovenaan), bij
 * gelijk bedrag op datumafstand, daarna op datum aflopend voor een stabiele
 * volgorde. Alleen uitgaven (`type === 'debit'`) komen in aanmerking, en
 * transacties die al aan een ándere bon hangen vallen af.
 *
 * @param {{date?: string, total?: number}} receipt
 * @param {Array<{id?: number, date: string, amount: number, type?: string, receiptId?: number|null}>} transactions
 * @param {{days?: number, maxDiff?: number, includeLinked?: boolean}} [opties]
 * @returns {Array<object>} kandidaten met `amountDiff`, `dayDiff` en `exact`
 */
export function findTransactionCandidates(receipt, transactions, opties = {}) {
  const { days = 3, maxDiff = Infinity, includeLinked = false } = opties
  const totaal = Number(receipt?.total)
  const bonDatum = naarDatum(receipt?.date)
  if (!Number.isFinite(totaal) || bonDatum == null) return []
  if (!Array.isArray(transactions)) return []

  const kandidaten = []
  for (const tx of transactions) {
    if (!tx) continue
    if (tx.type && tx.type !== 'debit') continue
    if (!includeLinked && tx.receiptId != null && tx.receiptId !== receipt?.id) continue
    const txDatum = naarDatum(tx.date)
    if (txDatum == null) continue

    const dayDiff = Math.round(Math.abs(txDatum - bonDatum) / DAG_MS)
    if (dayDiff > days) continue

    const amountDiff = Math.round((Math.abs(Number(tx.amount) - totaal) + Number.EPSILON) * 100) / 100
    if (!Number.isFinite(amountDiff) || amountDiff > maxDiff) continue

    kandidaten.push({ ...tx, amountDiff, dayDiff, exact: amountDiff < 0.01 })
  }

  kandidaten.sort((a, b) =>
    a.amountDiff - b.amountDiff ||
    a.dayDiff - b.dayDiff ||
    String(b.date).localeCompare(String(a.date)) ||
    (a.id ?? 0) - (b.id ?? 0),
  )
  return kandidaten
}

/**
 * Eén kandidaat die zonder vragen gekoppeld mag worden: precies één transactie
 * met exact hetzelfde bedrag binnen het datumvenster. Anders `null` en laat de
 * UI kiezen.
 */
export function bestMatch(receipt, transactions, opties = {}) {
  const kandidaten = findTransactionCandidates(receipt, transactions, opties)
  const exact = kandidaten.filter(k => k.exact)
  return exact.length === 1 ? exact[0] : null
}
