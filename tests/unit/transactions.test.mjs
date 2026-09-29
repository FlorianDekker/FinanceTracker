// Pure logica van het Transacties-scherm: dag-groepering (met kopjes en
// dagnetto) en maandtotalen. Geen Dexie nodig — zie transactions-db.test.mjs
// voor de database-kant (verwijderen/herstellen, bulk-bewerken).
import assert from 'node:assert/strict'

const SRC = new URL('../../src', import.meta.url).href

let pass = 0, fail = 0
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok  ', name) }
  catch (e) { fail++; console.log('  FOUT', name, '\n       ', e.stack ?? e.message) }
}

const { dayHeaderLabel, groupTransactionsByDay, monthTotals } = await import(`${SRC}/utils/transactionGrouping.js`)

const NOW = new Date('2026-09-16T10:00:00')

/* ---------------- dayHeaderLabel ---------------- */

await t('vandaag en gisteren krijgen een woord, andere dagen weekdag + datum', () => {
  assert.equal(dayHeaderLabel('2026-09-16', NOW), 'Vandaag')
  assert.equal(dayHeaderLabel('2026-09-15', NOW), 'Gisteren')
  // 22 september 2026 is een dinsdag.
  assert.equal(dayHeaderLabel('2026-09-22', NOW), 'di 22 sep')
})

/* ---------------- groupTransactionsByDay ---------------- */

const tx = (id, date, amount, type, claimStatus = null) => ({ id, date, amount, type, claimStatus, category: 'boodschappen' })

await t('groepeert opeenvolgende transacties van dezelfde dag samen, in volgorde', () => {
  const txs = [
    tx(1, '2026-09-16', 10, 'debit'),
    tx(2, '2026-09-16', 5, 'debit'),
    tx(3, '2026-09-15', 20, 'debit'),
  ]
  const groups = groupTransactionsByDay(txs, NOW)
  assert.equal(groups.length, 2)
  assert.equal(groups[0].date, '2026-09-16')
  assert.equal(groups[0].label, 'Vandaag')
  assert.equal(groups[0].transactions.length, 2)
  assert.equal(groups[1].date, '2026-09-15')
  assert.equal(groups[1].label, 'Gisteren')
})

await t('het dagnetto telt credit mee en debit eraf, met dezelfde meetel-regels als de rest van de app', () => {
  const txs = [
    tx(1, '2026-09-16', 100, 'credit'),
    tx(2, '2026-09-16', 30, 'debit'),
    // Een lopende declaratie telt niet mee in het netto van de dag.
    tx(3, '2026-09-16', 999, 'debit', 'open'),
  ]
  const groups = groupTransactionsByDay(txs, NOW)
  assert.equal(groups[0].net, 70)
})

await t('een niet-aangesloten rij (geen transacties) levert een lege lijst op', () => {
  assert.deepEqual(groupTransactionsByDay([], NOW), [])
  assert.deepEqual(groupTransactionsByDay(undefined, NOW), [])
})

/* ---------------- monthTotals ---------------- */

await t('in/uit/netto tellen alleen wat meetelt (countsInTotals)', () => {
  const txs = [
    tx(1, '2026-09-01', 2000, 'credit'),           // salaris
    tx(2, '2026-09-02', 400, 'debit'),             // boodschappen
    tx(3, '2026-09-03', 150, 'debit', 'submitted'), // ingediende declaratie: niet van mij
    tx(4, '2026-09-04', 150, 'credit', 'payout'),   // uitbetaling: geen inkomen
  ]
  const totals = monthTotals(txs)
  assert.deepEqual(totals, { in: 2000, out: 400, net: 1600 })
})

await t('een lege lijst levert nullen op', () => {
  assert.deepEqual(monthTotals([]), { in: 0, out: 0, net: 0 })
})

console.log(`\n${pass} ok, ${fail} fout`)
process.exit(fail ? 1 : 0)
