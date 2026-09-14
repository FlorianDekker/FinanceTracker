// Declaraties in de database: upgrade naar v5, de sommen die het dashboard en
// de budgetten voeden, de index op claimStatus, de instelling en de backup.
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import Dexie from 'dexie'
const SRC = new URL('../../src', import.meta.url).href

let pass = 0, fail = 0
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok  ', name) }
  catch (e) { fail++; console.log('  FOUT', name, '\n       ', e.message) }
}

// Eerst een bestaande v4-database met gewone transacties.
const legacy = new Dexie('BudgetTracker')
legacy.version(4).stores({
  transactions: '++id, date, category, type, [date+category]',
  categories: 'key, order', settings: 'key',
  merchantHistory: '++id, merchantKey, baseKey, timestamp', rules: '++id, category',
})
await legacy.open()
await legacy.table('transactions').bulkAdd([
  { date: '2026-09-02', amount: 100, type: 'debit', category: 'boodschappen', subcategory: '', note: 'AH' },
  { date: '2026-08-02', amount: 60, type: 'debit', category: 'boodschappen', subcategory: '', note: 'AH aug' },
])
legacy.close()

const { db } = await import(`${SRC}/db/db.js`)
const B = await import(`${SRC}/utils/backup.js`)
const { countsInTotals, outstandingClaims, isCountedExpense, isCountedIncome } = await import(`${SRC}/utils/claims.js`)
const { buildDefaultCategoryRows } = await import(`${SRC}/constants/categories.js`)
const { getClaimExpiryMonths, setClaimExpiryMonths } = await import(`${SRC}/hooks/useClaims.js`)

await db.open()

await t('upgrade v4 -> v5 laat bestaande transacties ongemoeid', async () => {
  assert.equal(db.verno, 5)
  assert.ok(db.claimBatches, 'tabel claimBatches bestaat')
  assert.equal(await db.transactions.count(), 2)
  const oud = await db.transactions.get(1)
  assert.equal(oud.claimStatus, undefined, 'geen datamigratie nodig')
  assert.equal(countsInTotals(oud), true, 'rij zonder claimStatus telt gewoon mee')
})

await db.categories.bulkPut(buildDefaultCategoryRows({ boodschappen: 400 }))
await db.transactions.bulkAdd([
  { date: '2026-09-03', amount: 50, type: 'debit', category: 'vervoer', subcategory: '', note: 'NS', claimStatus: 'open', claimBatchId: null },
  { date: '2026-09-04', amount: 40, type: 'debit', category: 'vervoer', subcategory: '', note: 'NS 2', claimStatus: 'submitted', claimBatchId: null },
  { date: '2026-09-05', amount: 10, type: 'debit', category: 'vervoer', subcategory: '', note: 'NS 3', claimStatus: 'paid', claimBatchId: null },
  { date: '2026-09-06', amount: 30, type: 'debit', category: 'vervoer', subcategory: '', note: 'NS 4', claimStatus: 'rejected', claimBatchId: null },
  { date: '2026-09-25', amount: 2000, type: 'credit', category: 'salaris', subcategory: '', note: 'Salaris' },
  { date: '2026-09-26', amount: 90, type: 'credit', category: 'salaris', subcategory: '', note: 'Declaratie sep', claimStatus: 'payout', claimBatchId: null },
])
const catMap = Object.fromEntries((await db.categories.toArray()).map(c => [c.key, c]))

// Dezelfde query + lus als src/hooks/useBudgetStats.js
async function budgetSpent(year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const txs = await db.transactions.where('date').startsWith(`${year}-`).filter(countsInTotals).toArray()
  const spent = {}, spentBefore = {}
  for (const tx of txs) {
    if (tx.type === 'credit' && catMap[tx.category]?.type === 'income') continue
    if (tx.category === 'bankoverschrijving') continue
    const amount = tx.type === 'credit' ? -tx.amount : tx.amount
    const m = Number(tx.date.slice(5, 7))
    if (tx.date.startsWith(prefix)) spent[tx.category] = (spent[tx.category] ?? 0) + amount
    else if (m < month) spentBefore[tx.category] = (spentBefore[tx.category] ?? 0) + amount
  }
  return { spent, spentBefore }
}

await t('budgetsommen: open declaratie telt niet mee, afgekeurde wel', async () => {
  const { spent, spentBefore } = await budgetSpent(2026, 9)
  assert.equal(spent.boodschappen, 100)
  assert.equal(spentBefore.boodschappen, 60)
  assert.equal(spent.vervoer, 30, 'open/ingediend/uitbetaald tellen niet, afgekeurd wel')
  assert.equal(spent.salaris, undefined, 'salaris en uitbetaling raken de uitgaven niet')
})

await t('cashflow: uitgaven 130, inkomen 2000 (payout telt niet als inkomen)', async () => {
  const maand = await db.transactions.where('date').startsWith('2026-09').filter(countsInTotals).toArray()
  const uitgaven = maand.filter(isCountedExpense).reduce((s, t2) => s + t2.amount, 0)
  const inkomen = maand.filter(t2 => isCountedIncome(t2) && catMap[t2.category]?.type === 'income')
    .reduce((s, t2) => s + t2.amount, 0)
  assert.equal(uitgaven, 130)
  assert.equal(inkomen, 2000)
})

await t('index op claimStatus levert de openstaande declaraties', async () => {
  const open = await db.transactions.where('claimStatus').anyOf(['open', 'submitted']).toArray()
  assert.equal(open.length, 2)
  assert.deepEqual(outstandingClaims(open), { total: 90, count: 2 })
  const alle = await db.transactions.where('claimStatus')
    .anyOf(['open', 'submitted', 'paid', 'rejected', 'payout']).toArray()
  assert.equal(alle.length, 5, 'de filterchip vindt alle declaratie-rijen')
})

await t('claimExpiryMonths leest en schrijft via de helper', async () => {
  assert.equal(await getClaimExpiryMonths(), 6, 'standaard 6 maanden')
  await setClaimExpiryMonths(3)
  assert.equal(await getClaimExpiryMonths(), 3)
  await setClaimExpiryMonths('onzin')
  assert.equal(await getClaimExpiryMonths(), 6, 'onzin valt terug op de standaard')
  await setClaimExpiryMonths(999)
  assert.equal(await getClaimExpiryMonths(), 60, 'geklemd op 60')
})

/* ---------------------------- backup ---------------------------------- */

const batchId = await db.claimBatches.add({
  name: 'Declaratie sep 2026', status: 'submitted', createdAt: 1757800000000,
  submittedAt: 1757900000000, expectedTotal: 90, paidTransactionId: null, paidAmount: null, paidAt: null, note: '',
})
await db.transactions.where('claimStatus').equals('submitted').modify({ claimBatchId: batchId })
const backup = await B.createBackup()

await t('backup bevat claimBatches, claimStatus en claimBatchId', () => {
  assert.equal(backup.schemaVersion, 5)
  assert.equal(B.countRows(backup).claimBatches, 1)
  const submitted = backup.tables.transactions.filter(tx => tx.claimStatus === 'submitted')
  assert.equal(submitted.length, 1)
  assert.equal(submitted[0].claimBatchId, batchId)
})

await t('backup van voor Fase 2 (zonder claimBatches) wordt geaccepteerd', async () => {
  const oud = {
    app: 'FinanceTracker', schemaVersion: 4, exportedAt: '2026-08-01T10:00:00.000Z',
    tables: {
      transactions: [{ date: '2026-07-01', amount: 20, type: 'debit', category: 'boodschappen', subcategory: '', note: 'Oud' }],
      categories: [{ key: 'boodschappen', budget: 400 }],
      settings: [{ key: 'theme', value: 'dark' }], merchantHistory: [], rules: [],
    },
  }
  assert.equal(B.summarizeBackup(oud).counts.claimBatches, 0)
  const res = await B.restoreBackup(oud, { mode: 'merge' })
  assert.equal(res.stats.claimBatches.added, 0)
  assert.equal(res.stats.transactions.added, 1)
  assert.equal(await db.claimBatches.count(), 1, 'bestaande batch blijft staan')
})

await db.delete()
await db.open()

await t('samenvoegen hermapt claimBatchId naar het nieuwe batch-id', async () => {
  await db.claimBatches.add({ name: 'Bestaand', status: 'open', createdAt: 1 })
  const res = await B.restoreBackup(backup, { mode: 'merge' })
  assert.equal(res.stats.claimBatches.added, 1)
  const sep = (await db.claimBatches.toArray()).find(b => b.name === 'Declaratie sep 2026')
  const merged = await db.transactions.where('claimStatus').equals('submitted').toArray()
  assert.equal(merged.length, 1)
  assert.equal(merged[0].claimBatchId, sep.id)
})

await t('dezelfde backup twee keer samenvoegen levert geen dubbele batches', async () => {
  const res = await B.restoreBackup(backup, { mode: 'merge' })
  assert.equal(res.stats.claimBatches.added, 0)
  assert.equal(res.stats.transactions.added, 0)
  assert.equal(await db.claimBatches.count(), 2)
})

await t('alles vervangen houdt batch-ids en koppelingen intact', async () => {
  const res = await B.restoreBackup(backup, { mode: 'replace' })
  assert.equal(res.stats.claimBatches.added, 1)
  const batches = await db.claimBatches.toArray()
  assert.equal(batches.length, 1)
  assert.equal(batches[0].id, batchId)
  const gekoppeld = (await db.transactions.toArray()).filter(tx => tx.claimBatchId === batchId)
  assert.equal(gekoppeld.length, 1)
})

console.log(`\n${pass} geslaagd, ${fail} gefaald (declaraties in de database)`)
process.exit(fail ? 1 : 0)
