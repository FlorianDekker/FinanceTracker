/**
 * Vermogensverloop uit de momentopnames: één punt per dag waarop er iets
 * gemeten is. Een rekening zonder meting op die dag houdt zijn laatst bekende
 * saldo — anders zou het totaal zakken zodra je één rekening bijwerkt.
 * Een rekening telt pas mee vanaf zijn eigen eerste meting.
 *
 * Bewust zonder Dexie/React, zodat het testbaar is.
 */
import { round2 } from './months'
import { bankAccountHistories } from './bankHistory'

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

/** Eén rekening z'n momentopnames als dagreeks (zelfde vorm als `bankAccountHistories`). */
function snapshotSeries(snapshots, accountKey) {
  const perDag = new Map()
  for (const s of snapshots ?? []) {
    if (String(s?.accountKey ?? '') !== accountKey || !s?.date) continue
    const huidig = perDag.get(s.date)
    if (!huidig || (s.id ?? 0) >= huidig.id) perDag.set(s.date, { balance: round2(s.balance), id: s.id ?? 0 })
  }
  return [...perDag.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, w]) => ({ date, balance: w.balance }))
}

/**
 * Het echte vermogensverloop, met terugwerkende kracht waar dat kan:
 * - rekeningen met `source: 'abn-import'` krijgen hun reeks uit de
 *   transacties zelf (`bankAccountHistories`) — die gaat terug tot het
 *   eerste import-anker, veel verder dan de momentopnames. De momentopnames
 *   van zo'n rekening worden hier *niet* gebruikt: de bankreeks is voor die
 *   rekening altijd completer en leidend, en meenemen zou alleen ruis geven
 *   (een tweede punt op dezelfde dag, met kans op een net iets ander bedrag
 *   door een sindsdien gewijzigde handmatige regel).
 * - handmatige rekeningen houden het bij hun momentopnames, zoals altijd.
 *
 * Een rekening telt pas mee vanaf zijn eigen eerste bekende punt — een
 * rekening van vóór dat punt wordt weggelaten in plaats van als 0 geteld: een
 * 0 zou een valse dip in het totaal geven zodra je een langlopende rekening
 * toevoegt of importeert. `completeFrom` is de eerste dag waarop alle
 * meegegeven rekeningen meetellen, zodat de grafiek kan laten weten dat het
 * totaal daarvóór nog niet compleet is.
 *
 * @param accounts   de rekeningen die moeten meetellen (bijv. niet-gearchiveerd)
 * @param snapshots  rijen uit `db.accountSnapshots`
 * @param txs        rijen uit `db.transactions`
 * @returns { points: [{ date, total, perAccount }], completeFrom: 'YYYY-MM-DD'|null, accountCount }
 */
export function combinedWealthHistory(accounts, snapshots, txs) {
  const rekeningen = (accounts ?? []).filter(a => a?.key)
  const bankReeksen = bankAccountHistories(txs)

  const perRekening = {}
  for (const a of rekeningen) {
    perRekening[a.key] = a.source === 'abn-import' && a.account
      ? (bankReeksen[a.account] ?? [])
      : snapshotSeries(snapshots, a.key)
  }

  const keys = Object.keys(perRekening)
  const perRekeningMap = {}
  const alleDagen = new Set()
  for (const key of keys) {
    perRekeningMap[key] = new Map(perRekening[key].map(p => [p.date, p.balance]))
    for (const p of perRekening[key]) alleDagen.add(p.date)
  }
  const dagen = [...alleDagen].sort()

  const laatstBekend = {}
  const punten = []
  let completeFrom = null
  for (const date of dagen) {
    for (const key of keys) {
      const waarde = perRekeningMap[key].get(date)
      if (waarde != null) laatstBekend[key] = waarde
    }
    const perAccount = { ...laatstBekend }
    if (completeFrom == null && keys.every(k => k in perAccount)) completeFrom = date
    const total = round2(Object.values(perAccount).reduce((s, v) => s + v, 0))
    punten.push({ date, total, perAccount })
  }
  return { points: punten, completeFrom, accountCount: keys.length }
}

/* --------------------------------------------------------- periodekeuze */

const PERIODS = {
  '3m': { label: '3 mnd', months: 3 },
  '1j': { label: '1 jaar', months: 12 },
  alles: { label: 'Alles', months: null },
}

/** Voor de knoppen boven de grafiek. */
export const HISTORY_PERIODS = Object.entries(PERIODS).map(([key, v]) => ({ key, label: v.label }))
export const DEFAULT_HISTORY_PERIOD = '1j'

/** 'YYYY-MM-DD' min `n` maanden — zelfde dag-van-de-maand-logica als `addMonths`, maar op dagniveau. */
function monthsBeforeDate(dateStr, n) {
  const [jaar, maand, dag] = String(dateStr ?? '').split('-').map(Number)
  if (!jaar || !maand) return dateStr
  const d = new Date(jaar, maand - 1 - n, dag || 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Beperkt de punten tot de gekozen periode, teruggerekend vanaf de láátste
 * dag in de reeks zelf (niet per se "vandaag" — zo blijft de functie puur en
 * werkt hij ook op een oudere export). Begint de periode vóór het eerste
 * punt, dan blijft de reeks gewoon vanaf het begin staan. Staat er geen punt
 * precies op de grensdatum, dan schuiven we het laatst bekende punt ervóór
 * naar die grens, zodat de lijn niet uit het niets lijkt te beginnen.
 */
export function filterHistoryPeriod(points, period = DEFAULT_HISTORY_PERIOD) {
  const alle = points ?? []
  if (!alle.length || period === 'alles' || !PERIODS[period]) return alle
  const laatsteDag = alle[alle.length - 1].date
  const grens = monthsBeforeDate(laatsteDag, PERIODS[period].months)

  const erna = alle.filter(p => p.date >= grens)
  if (erna.length && erna[0].date === grens) return erna
  const ervoor = [...alle].reverse().find(p => p.date < grens)
  return ervoor ? [{ ...ervoor, date: grens }, ...erna] : erna
}
