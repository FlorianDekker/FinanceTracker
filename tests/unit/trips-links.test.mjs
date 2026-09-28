// Samengevoegde koppelingen bank ↔ Splitser (schema v8): één Splitser-regel
// met meer bankregels, één bankregel bij meer Splitser-regels, en de migratie
// van het oude veld `matchedTxId`.
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import Dexie from 'dexie'

const SRC = new URL('../../src', import.meta.url).href

let pass = 0, fail = 0
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok  ', name) }
  catch (e) { fail++; console.log('  FOUT', name, '\n       ', e.message) }
}

// Een v7-database zoals hij bij Florian op de telefoon staat.
const oud = new Dexie('BudgetTracker')
oud.version(7).stores({
  transactions: '++id, date, category, type, claimStatus, tripId, [date+category]',
  categories: 'key, order',
  settings: 'key',
  merchantHistory: '++id, merchantKey, baseKey, timestamp',
  rules: '++id, category',
  claimBatches: '++id, status',
  receipts: '++id, transactionId, date, merchantKey, status',
  receiptItems: '++id, receiptId, nameKey, group, date',
  trips: '++id, from, to',
  tripItems: '++id, tripId, date',
  accounts: 'key, order',
  accountSnapshots: '++id, accountKey, date, [accountKey+date]',
  reservations: '++id, dueMonth',
  goals: '++id, order',
})
await oud.open()
await oud.table('tripItems').bulkAdd([
  { tripId: 1, date: '2026-07-12', description: 'Gekoppeld', amount: 20, matchedTxId: 4 },
  { tripId: 1, date: '2026-07-12', description: 'Los', amount: 5, matchedTxId: null },
])
oud.close()

const { db } = await import(`${SRC}/db/db.js`)
const K = await import(`${SRC}/utils/trips/costs.js`)
await db.open()

console.log('\n--- migratie v7 → v8 ---')
await t('matchedTxId wordt de lijst matchedTxIds', async () => {
  assert.equal(db.verno, 8)
  const [a, b] = await db.tripItems.orderBy('id').toArray()
  assert.deepEqual(a.matchedTxIds, [4])
  assert.deepEqual(b.matchedTxIds, [])
  assert.equal('matchedTxId' in a, false)
  assert.equal('matchedTxId' in b, false)
})

console.log('\n--- matchedIdsOf ---')
await t('leest de lijst, het oude veld en niets', async () => {
  assert.deepEqual(K.matchedIdsOf({ matchedTxIds: [1, 2] }), [1, 2])
  assert.deepEqual(K.matchedIdsOf({ matchedTxId: 3 }), [3])
  assert.deepEqual(K.matchedIdsOf({ matchedTxId: null }), [])
  assert.deepEqual(K.matchedIdsOf({}), [])
  assert.deepEqual(K.matchedIdsOf(null), [])
})

const debit = (id, amount, date = '2026-07-12') => ({ id, date, amount, type: 'debit', category: 'vakantie', subcategory: '' })
const regel = (id, amount, myShare, matchedTxIds, extra = {}) => ({
  id, date: '2026-07-12', description: `regel ${id}`, amount, myShare, category: 'vakantie', subcategory: '', payer: 'Florian', matchedTxIds, ...extra,
})

console.log('\n--- één Splitser-regel, twee bankregels ---')
await t('hotel in twee delen betaald: beide gedekt, groep sluit aan', async () => {
  const txs = [debit(1, 150), debit(2, 150, '2026-07-14'), debit(3, 12)]
  const items = [regel(10, 300, 100, [1, 2])]
  const c = K.tripCosts({ items, transactions: txs })
  assert.deepEqual(c.coveredTxIds.sort(), [1, 2])
  assert.equal(c.bankNotCovered, 12)
  assert.equal(c.myCost, 112, 'mijn derde van het hotel plus de losse 12')
  const g = K.matchGroup(10, items, txs)
  assert.equal(g.itemSum, 300)
  assert.equal(g.txSum, 300)
  assert.equal(g.diff, 0)
})
await t('pas één deel gekoppeld: verschil is negatief', async () => {
  const txs = [debit(1, 150), debit(2, 150)]
  const g = K.matchGroup(10, [regel(10, 300, 100, [1])], txs)
  assert.equal(g.diff, -150)
})

console.log('\n--- twee Splitser-regels, één bankregel ---')
await t('diner en wijn apart in Splitser, één keer gepind', async () => {
  const txs = [debit(1, 85)]
  const items = [regel(10, 60, 30, [1]), regel(11, 25, 12.5, [1])]
  const c = K.tripCosts({ items, transactions: txs })
  assert.deepEqual(c.coveredTxIds, [1], 'de bankregel telt één keer als gedekt')
  assert.equal(c.bankNotCovered, 0)
  assert.equal(c.myCost, 42.5)
  assert.equal(c.bankOut, 85, 'de bank telt de afschrijving één keer')
  for (const id of [10, 11]) {
    const g = K.matchGroup(id, items, txs)
    assert.deepEqual(g.items.map(i => i.id).sort(), [10, 11], 'vanaf beide regels dezelfde groep')
    assert.equal(g.diff, 0)
  }
})
await t('een groep volgt de keten door: A-1, B-1, B-2', async () => {
  const txs = [debit(1, 40), debit(2, 20)]
  const items = [regel(10, 30, 15, [1]), regel(11, 30, 15, [1, 2]), regel(12, 9, 4.5, [])]
  const g = K.matchGroup(10, items, txs)
  assert.deepEqual(g.items.map(i => i.id).sort(), [10, 11])
  assert.deepEqual(g.transactions.map(tx => tx.id).sort(), [1, 2])
  assert.equal(g.diff, 0)
  assert.deepEqual(K.matchGroup(12, items, txs).transactions, [], 'een losse regel is een groep van één')
})

console.log(`\n${pass} ok, ${fail} fout`)
if (fail) process.exit(1)
