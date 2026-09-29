// De database-kant van het Transacties-scherm: verwijderen + ongedaan maken
// (inclusief het los- en weer vastkoppelen van een bon), en de bulk-acties uit
// de selectiemodus (categorie, vakantie, declaratie, verwijderen).
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'

const SRC = new URL('../../src', import.meta.url).href

let pass = 0, fail = 0
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok  ', name) }
  catch (e) { fail++; console.log('  FOUT', name, '\n       ', e.stack ?? e.message) }
}

const { db } = await import(`${SRC}/db/db.js`)
const T = await import(`${SRC}/hooks/useTransactions.js`)
const C = await import(`${SRC}/utils/claims.js`)
const { buildDefaultCategoryRows } = await import(`${SRC}/constants/categories.js`)

await db.open()
await db.categories.bulkPut(buildDefaultCategoryRows({ boodschappen: 400, reiskosten: 100 }))

/* ---------------- verwijderen + herstellen ---------------- */

let txId, bonId
await t('opzet: transactie met een gekoppelde bon', async () => {
  txId = await db.transactions.add({
    date: '2026-09-10', amount: 12.5, type: 'debit', category: 'boodschappen', subcategory: '',
    note: 'Albert Heijn', claimStatus: null, tripId: 7,
  })
  bonId = await db.receipts.add({ transactionId: txId, date: '2026-09-10', status: 'linked', merchant: 'Albert Heijn' })
  await db.transactions.update(txId, { receiptId: bonId })
})

await t('verwijderen ontkoppelt de bon en geeft de volledige rij terug', async () => {
  const verwijderd = await T.deleteTransaction(txId)
  assert.equal(verwijderd.id, txId)
  assert.equal(verwijderd.note, 'Albert Heijn')
  assert.equal(verwijderd.receiptId, bonId, 'de teruggegeven rij bewaart de koppeling voor het herstel')
  assert.equal(await db.transactions.get(txId), undefined)

  const bon = await db.receipts.get(bonId)
  assert.equal(bon.transactionId, null, 'de bon wijst niet meer naar een verdwenen transactie')
  assert.equal(bon.status, 'new', 'nog niet uitgelezen, dus terug naar new')
})

await t('herstel zet de rij terug met hetzelfde id en dezelfde koppelingen', async () => {
  const verwijderd = { id: txId, date: '2026-09-10', amount: 12.5, type: 'debit', category: 'boodschappen', subcategory: '', note: 'Albert Heijn', claimStatus: null, tripId: 7, receiptId: bonId }
  await T.restoreTransaction(verwijderd)

  const terug = await db.transactions.get(txId)
  assert.ok(terug, 'de transactie bestaat weer')
  assert.equal(terug.id, txId, 'zelfde id')
  assert.equal(terug.tripId, 7)
  assert.equal(terug.receiptId, bonId)

  const bon = await db.receipts.get(bonId)
  assert.equal(bon.transactionId, txId, 'de bon is weer gekoppeld')
  assert.equal(bon.status, 'linked')
})

await t('verwijderen van een niet-bestaande transactie geeft null, geen fout', async () => {
  assert.equal(await T.deleteTransaction(999999), null)
})

/* ---------------- bulk verwijderen + herstellen ---------------- */

let idA, idB
await t('bulk-verwijderen geeft alle rijen terug en ruimt bonkoppelingen op', async () => {
  idA = await db.transactions.add({ date: '2026-09-11', amount: 5, type: 'debit', category: 'boodschappen', subcategory: '', note: 'Snacks' })
  idB = await db.transactions.add({ date: '2026-09-12', amount: 8, type: 'debit', category: 'boodschappen', subcategory: '', note: 'Drogist' })

  const verwijderd = await T.bulkDeleteTransactions([idA, idB])
  assert.equal(verwijderd.length, 2)
  assert.equal(await db.transactions.count(), 1, 'alleen de eerdere (herstelde) transactie staat nog')

  await T.restoreTransactions(verwijderd)
  const [a, b] = await db.transactions.bulkGet([idA, idB])
  assert.equal(a.note, 'Snacks')
  assert.equal(b.note, 'Drogist')
})

/* ---------------- bulk categorie ---------------- */

await t('bulkSetCategory zet de categorie op alle geselecteerde rijen en leert per rij', async () => {
  const n = await T.bulkSetCategory([idA, idB], 'reiskosten', 'trein')
  assert.equal(n, 2)
  const [a, b] = await db.transactions.bulkGet([idA, idB])
  assert.equal(a.category, 'reiskosten')
  assert.equal(a.subcategory, 'trein')
  assert.equal(b.category, 'reiskosten')

  const events = await db.merchantHistory.where('baseKey').equals('snacks').toArray()
  assert.equal(events.length, 1)
  assert.equal(events[0].wasCorrection, true, 'was eerst boodschappen, dus een correctie')
  assert.equal(events[0].previousCategory, 'boodschappen')
})

/* ---------------- bulk vakantie ---------------- */

await t('bulkSetTrip zet tripId op alle geselecteerde rijen, of juist los (null)', async () => {
  await T.bulkSetTrip([idA, idB], 3)
  const [a, b] = await db.transactions.bulkGet([idA, idB])
  assert.equal(a.tripId, 3)
  assert.equal(b.tripId, 3)

  await T.bulkSetTrip([idA], null)
  assert.equal((await db.transactions.get(idA)).tripId, null)
  assert.equal((await db.transactions.get(idB)).tripId, 3, 'de rest blijft ongemoeid')
})

/* ---------------- bulk declaratie ---------------- */

await t('bulkMarkClaim markeert alleen afschrijvingen zonder of met open claimStatus', async () => {
  const open = await db.transactions.add({ date: '2026-09-13', amount: 30, type: 'debit', category: 'reiskosten', subcategory: '', note: 'NS' })
  const algemarkeerd = await db.transactions.add({ date: '2026-09-13', amount: 20, type: 'debit', category: 'reiskosten', subcategory: '', note: 'Taxi', claimStatus: 'open' })
  const ingediend = await db.transactions.add({ date: '2026-09-13', amount: 15, type: 'debit', category: 'reiskosten', subcategory: '', note: 'Bus', claimStatus: 'submitted' })
  const bijschrijving = await db.transactions.add({ date: '2026-09-13', amount: 15, type: 'credit', category: 'salaris', subcategory: '', note: 'Loon' })

  const res = await T.bulkMarkClaim([open, algemarkeerd, ingediend, bijschrijving])
  assert.deepEqual(res, { updated: 2, skipped: 2 })

  const [o, a2, i, b2] = await db.transactions.bulkGet([open, algemarkeerd, ingediend, bijschrijving])
  assert.equal(C.claimStatusOf(o), 'open')
  assert.equal(C.claimStatusOf(a2), 'open')
  assert.equal(C.claimStatusOf(i), 'submitted', 'blijft ongemoeid, was al onderweg')
  assert.equal(C.claimStatusOf(b2), null, 'een bijschrijving wordt nooit een declaratie via deze knop')
})

console.log(`\n${pass} ok, ${fail} fout`)
process.exit(fail ? 1 : 0)
