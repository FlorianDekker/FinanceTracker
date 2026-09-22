/**
 * Voorstellen: welke banktransacties horen (waarschijnlijk) bij een vakantie?
 *
 * Twee kanten op:
 *  - `clusterTrips`  — zoekt in álle transacties zonder vakantie naar reeksen
 *                      buitenlandse betalingen ("je bent hier vast op reis geweest").
 *  - `suggestTripTransactions` — vinkt binnen één periode de kandidaten voor.
 *
 * Puur: geen db, geen React. Datums zijn altijd 'JJJJ-MM-DD'-strings.
 */

import { foreignCountryOf } from './country'

/** Aantal dagen tussen twee datums (b − a); negatief mag. */
export function dayDiff(a, b) {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)
  return Math.round(ms / 86400000)
}

/** Aantal dagen van een vakantie, van/tot meegerekend (minimaal 1). */
export function tripDays(from, to) {
  if (!from || !to) return 1
  return Math.max(1, dayDiff(from, to) + 1)
}

/** Datum verschuiven: shiftDate('2026-07-11', -1) → '2026-07-10'. */
export function shiftDate(date, dagen) {
  const t = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(t)) return date
  return new Date(t + dagen * 86400000).toISOString().slice(0, 10)
}

// Een debit telt op, een credit (verrekening van een reisgenoot) haalt eraf.
const signedAmount = tx => (tx.type === 'credit' ? -1 : 1) * (Number(tx.amount) || 0)

/**
 * Clustert losse buitenlandse betalingen tot reisvoorstellen.
 *
 * Nieuw cluster zodra het gat groter is dan `gapDays`, óf zodra het land
 * wisselt terwijl er meer dan een dag tussen zit. Een landwissel bínnen een
 * dag is één reis met twee landen (denk aan de rit door België naar Parijs).
 *
 * @param {Array} txs         transacties (die met een `tripId` slaan we over)
 * @param {{gapDays?: number}} opties
 * @returns {Array<{from, to, countries, transactions, count, total, days}>}
 *          nieuwste reis eerst
 */
export function clusterTrips(txs, { gapDays = 3 } = {}) {
  const kandidaten = (txs ?? [])
    .filter(tx => tx && tx.tripId == null && foreignCountryOf(tx))
    .map(tx => ({ tx, land: foreignCountryOf(tx) }))
    .sort((a, b) => String(a.tx.date).localeCompare(String(b.tx.date)))

  const clusters = []
  let huidig = null
  let vorige = null

  for (const { tx, land } of kandidaten) {
    const gat = vorige ? dayDiff(vorige.tx.date, tx.date) : 0
    const nieuw = !huidig || gat > gapDays || (land !== vorige.land && gat > 1)
    if (nieuw) {
      huidig = { from: tx.date, to: tx.date, countries: [], transactions: [] }
      clusters.push(huidig)
    }
    huidig.to = tx.date
    if (!huidig.countries.includes(land)) huidig.countries.push(land)
    huidig.transactions.push(tx)
    vorige = { tx, land }
  }

  return clusters
    .map(c => ({
      ...c,
      count: c.transactions.length,
      total: Math.round(c.transactions.reduce((s, tx) => s + signedAmount(tx), 0) * 100) / 100,
      days: tripDays(c.from, c.to),
    }))
    .reverse()
}

/**
 * Vinkt binnen een periode voor welke transacties bij de vakantie horen.
 * Voorgevinkt:
 *  - buitenlandse betalingen (Land: ≠ NLD);
 *  - alles in de vakantie-categorie;
 *  - bijschrijvingen die geen inkomen zijn (reisgenoot die terugbetaalt).
 *
 * @param {Array} txs        transacties in de periode (from − 1 t/m to + 1)
 * @param {{ vakantieKeys?: string[], isIncomeKey?: (key) => boolean, tripId?: number }} opties
 *        `tripId` is de vakantie die je aan het bewerken bent: die transacties
 *        horen er al bij en staan dus altijd aangevinkt.
 * @returns {{ suggested: Array, others: Array, countries: string[] }}
 */
export function suggestTripTransactions(txs, {
  vakantieKeys = ['vakantie'],
  isIncomeKey = () => false,
  tripId = null,
} = {}) {
  const vakantie = new Set(vakantieKeys)
  const suggested = []
  const others = []
  const countries = []

  for (const tx of (txs ?? [])) {
    if (!tx) continue
    // Al bij een ándere vakantie: een transactie hoort bij maximaal één reis.
    if (tx.tripId != null && tx.tripId !== tripId) continue
    const land = foreignCountryOf(tx)
    if (land && !countries.includes(land)) countries.push(land)
    const alBijDezeReis = tripId != null && tx.tripId === tripId
    const kies = alBijDezeReis
      || !!land
      || vakantie.has(tx.category)
      || (tx.type === 'credit' && !isIncomeKey(tx.category))
    ;(kies ? suggested : others).push(tx)
  }

  return { suggested, others, countries }
}
