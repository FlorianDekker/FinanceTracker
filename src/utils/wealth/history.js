/**
 * Vermogensverloop uit de momentopnames: één punt per dag waarop er iets
 * gemeten is. Een rekening zonder meting op die dag houdt zijn laatst bekende
 * saldo — anders zou het totaal zakken zodra je één rekening bijwerkt.
 * Een rekening telt pas mee vanaf zijn eigen eerste meting.
 *
 * Bewust zonder Dexie/React, zodat het testbaar is.
 */
import { round2 } from './months'

/** Per rekening de laatste momentopname (datum, daarna id). */
export function latestSnapshots(snapshots) {
  const per = {}
  for (const s of snapshots ?? []) {
    const key = String(s?.accountKey ?? '')
    if (!key || !s?.date) continue
    const huidig = per[key]
    const nieuwer = !huidig || s.date > huidig.date || (s.date === huidig.date && (s.id ?? 0) >= (huidig.id ?? 0))
    if (nieuwer) per[key] = { accountKey: key, date: s.date, balance: round2(s.balance), id: s.id }
  }
  return per
}

/**
 * @param snapshots   rijen uit `db.accountSnapshots`
 * @param accountKeys optioneel: alleen deze rekeningen (bijv. de niet-gearchiveerde)
 * @returns [{ date, total, perAccount: { [key]: saldo } }] — oplopend op datum
 */
export function wealthHistory(snapshots, accountKeys = null) {
  const toegestaan = accountKeys == null ? null : new Set(accountKeys)
  const perDag = new Map()
  for (const s of snapshots ?? []) {
    const key = String(s?.accountKey ?? '')
    if (!key || !s?.date) continue
    if (toegestaan && !toegestaan.has(key)) continue
    const dag = perDag.get(s.date) ?? new Map()
    const huidig = dag.get(key)
    // Twee metingen op dezelfde dag: de laatst toegevoegde wint.
    if (!huidig || (s.id ?? 0) >= huidig.id) dag.set(key, { balance: round2(s.balance), id: s.id ?? 0 })
    perDag.set(s.date, dag)
  }

  const laatstBekend = {}
  return [...perDag.keys()].sort().map(date => {
    for (const [key, waarde] of perDag.get(date)) laatstBekend[key] = waarde.balance
    const perAccount = { ...laatstBekend }
    const total = round2(Object.values(perAccount).reduce((s, v) => s + v, 0))
    return { date, total, perAccount }
  })
}
