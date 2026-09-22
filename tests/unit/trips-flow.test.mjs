// De hele vakantieketen op de echte database: aanmaken met transacties, een
// Splitser-settlement importeren (inclusief tweede import), de koppeling met de
// bank, de kosten en het opruimen bij verwijderen.
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = new URL('../../src', import.meta.url).href
const FIXTURE = new URL('../../docs/voorbeelden/splitser-parijs.txt', import.meta.url)

let pass = 0, fail = 0
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok  ', name) }
  catch (e) { fail++; console.log('  FOUT', name, '\n       ', e.message) }
}

const { db } = await import(`${SRC}/db/db.js`)
const T = await import(`${SRC}/hooks/useTrips.js`)
const S = await import(`${SRC}/utils/trips/splitser.js`)
const K = await import(`${SRC}/utils/trips/costs.js`)
const { buildDefaultCategoryRows } = await import(`${SRC}/constants/categories.js`)

await db.open()
await db.categories.bulkPut(buildDefaultCategoryRows({ vakantie: 300 }))

const parsed = S.parseSplitserPdf(readFileSync(FIXTURE, 'utf8'))
// Alles in de Vakantie-bak; de echte app gebruikt hier categorizeWithLearning.
const categorize = async row => ({ category: /baguette|supermarkt|hummus|cola/i.test(row.description) ? 'boodschappen' : 'vakantie', subcategory: '' })

const pin = (date, amount, land, note) => ({
  date, amount, type: 'debit', category: 'vakantie', subcategory: '',
  note: `${note} Pasvolgnr: 01 Land: ${land}`, tripId: null,
})

const ids = await db.transactions.bulkAdd([
  pin('2026-07-13', 58.5, 'FRA', 'RESTAURANT INDIA PARIS'),
  pin('2026-07-12', 22.9, 'FRA', 'CAFE DU COIN'),
  { date: '2026-07-11', amount: 45, type: 'debit', category: 'reiskosten', subcategory: '', note: 'NS INTERNATIONAL', tripId: null },
  { date: '2026-07-15', amount: 22.97, type: 'credit', category: 'bankoverschrijving', subcategory: '', note: 'Yonathan verrekening', tripId: null },
  { date: '2026-07-13', amount: 30, type: 'debit', category: 'reiskosten', subcategory: '', note: 'TAXI WERKBEZOEK', claimStatus: 'open', tripId: null },
  { date: '2026-05-02', amount: 20, type: 'debit', category: 'boodschappen', subcategory: '', note: 'ALBERT HEIJN', tripId: null },
], { allKeys: true })
const [indiaas, cafe, trein, verrekening, declaratie, thuis] = ids

let tripId

console.log('\n--- vakantie aanmaken ---')
await t('createTrip koppelt de gekozen transacties', async () => {
  tripId = await T.createTrip({
    name: 'Parijs',
    from: '2026-07-11',
    to: '2026-07-14',
    countries: ['FRA'],
    note: 'met Dani en Yonathan',
    transactionIds: [indiaas, cafe, trein, verrekening, declaratie],
  })
  const trip = await db.trips.get(tripId)
  assert.equal(trip.name, 'Parijs')
  assert.deepEqual(trip.countries, ['FRA'])
  assert.equal(trip.splitser, null)
  const gekoppeld = await db.transactions.where('tripId').equals(tripId).toArray()
  assert.equal(gekoppeld.length, 5)
  assert.equal((await db.transactions.get(thuis)).tripId, null, 'de rest blijft ongemoeid')
})

console.log('\n--- Splitser importeren ---')
await t('16 regels erbij, met mijn aandeel en een categorie', async () => {
  const uit = await T.importSplitserRows(tripId, {
    rows: parsed.rows, myName: 'Florian', fileName: 'splitser-parijs.pdf', categorize,
  })
  assert.deepEqual(uit, { added: 16, kept: 0, removed: 0 })
  const items = await db.tripItems.where('tripId').equals(tripId).toArray()
  assert.equal(items.length, 16)
  assert.equal(K.round2(items.reduce((s, i) => s + i.myShare, 0)), 141.79)
  assert.equal(items.every(i => i.source === 'splitser'), true)
  assert.equal(items.find(i => i.description === 'Hummus').category, 'boodschappen')
  assert.equal(items.find(i => i.description === 'Avondeten indiaas').category, 'vakantie')
})
await t('het importlogboek en mijn naam staan op de vakantie', async () => {
  const trip = await db.trips.get(tripId)
  assert.equal(trip.splitser.myName, 'Florian')
  assert.equal(trip.splitser.imported.length, 1)
  assert.equal(trip.splitser.imported[0].fileName, 'splitser-parijs.pdf')
  assert.equal(trip.splitser.imported[0].rows, 16)
})
await t('regels die ik voorschoot zijn aan hun bankregel gekoppeld', async () => {
  const items = await db.tripItems.where('tripId').equals(tripId).toArray()
  assert.equal(items.find(i => i.description === 'Avondeten indiaas').matchedTxId, indiaas)
  assert.equal(items.find(i => i.description === 'Eerste dag uitgaven').matchedTxId, cafe)
  // Regels van Dani horen nooit bij een afschrijving van mij.
  assert.equal(items.find(i => i.description === 'Eten libanees').matchedTxId, null)
  assert.equal(items.filter(i => i.matchedTxId != null).length, 2)
})

console.log('\n--- de cijfers ---')
await t('myCost = mijn Splitser-aandeel + de niet-gedekte bankregels', async () => {
  const items = await db.tripItems.where('tripId').equals(tripId).toArray()
  const txs = await db.transactions.where('tripId').equals(tripId).toArray()
  const c = K.tripCosts({ items, transactions: txs, from: '2026-07-11', to: '2026-07-14' })
  assert.equal(c.splitserShare, 141.79)
  assert.equal(c.bankNotCovered, 45, 'alleen de trein is niet via Splitser gelopen')
  assert.equal(c.myCost, 186.79)
  assert.equal(c.bankOut, 126.4, 'de lopende declaratie telt niet mee')
  assert.equal(c.bankIn, 22.97)
  assert.equal(c.bankNet, 103.43)
  assert.equal(c.reconcile, -83.36)
  assert.equal(c.days, 4)
  assert.equal(c.openClaimCount, 1)
  assert.equal(K.round2(c.perCategory.reduce((s, r) => s + r.amount, 0)), c.myCost)
})

console.log('\n--- handmatig bijsturen ---')
await t('een andere banktransactie kiezen maakt de oude vrij', async () => {
  const item = (await db.tripItems.where('tripId').equals(tripId).toArray())
    .find(i => i.description === 'Eten libanees')
  await T.setTripItemMatch(item.id, indiaas)
  const na = await db.tripItems.where('tripId').equals(tripId).toArray()
  assert.equal(na.find(i => i.description === 'Eten libanees').matchedTxId, indiaas)
  assert.equal(na.find(i => i.description === 'Avondeten indiaas').matchedTxId, null, 'één bankregel, één Splitser-regel')
  await T.setTripItemMatch(item.id, null)
  assert.equal((await db.tripItems.get(item.id)).matchedTxId, null)
})
await t('categorie van een regel bijwerken', async () => {
  const item = (await db.tripItems.where('tripId').equals(tripId).toArray())
    .find(i => i.description === 'Toeristenbelasting')
  await T.updateTripItem(item.id, { category: 'woning', subcategory: '' })
  assert.equal((await db.tripItems.get(item.id)).category, 'woning')
  await T.updateTripItem(item.id, { category: 'vakantie', subcategory: '' })
})

console.log('\n--- tweede import ---')
await t('bestaande regels houden hun categorie en koppeling', async () => {
  const voor = (await db.tripItems.where('tripId').equals(tripId).toArray())
    .find(i => i.description === 'Eerste dag uitgaven')
  const rows = [...parsed.rows.filter(r => r.description !== 'Omtbijt'),
    { date: '2026-07-13', description: 'Vergeten rondje', amount: 9, payer: 'Florian', participants: [{ name: 'Florian', share: 4.5 }, { name: 'Dani', share: 4.5 }] }]
  const uit = await T.importSplitserRows(tripId, { rows, myName: 'Florian', fileName: 'v2.pdf', categorize })
  assert.deepEqual(uit, { added: 1, kept: 15, removed: 1 })
  const items = await db.tripItems.where('tripId').equals(tripId).toArray()
  assert.equal(items.length, 16)
  assert.equal(items.some(i => i.description === 'Omtbijt'), false)
  const na = items.find(i => i.description === 'Eerste dag uitgaven')
  assert.equal(na.id, voor.id)
  assert.equal(na.matchedTxId, voor.matchedTxId)
  assert.equal((await db.trips.get(tripId)).splitser.imported.length, 2)
})

console.log('\n--- selectie en opruimen ---')
await t('setTripTransactions haalt een transactie weg', async () => {
  await T.setTripTransactions(tripId, [indiaas, cafe, trein, verrekening])
  assert.equal((await db.transactions.get(declaratie)).tripId, null)
  assert.equal((await db.transactions.where('tripId').equals(tripId).count()), 4)
})
await t('splitserName is een instelling met Florian als standaard', async () => {
  assert.equal(await T.getSplitserName(), 'Florian')
  await T.setSplitserName('Flo')
  assert.equal(await T.getSplitserName(), 'Flo')
  await T.setSplitserName('Florian')
})
await t('verwijderen laat de transacties staan, zonder vakantie', async () => {
  await T.deleteTrip(tripId)
  assert.equal(await db.trips.get(tripId), undefined)
  assert.equal(await db.tripItems.where('tripId').equals(tripId).count(), 0)
  assert.equal((await db.transactions.get(indiaas)).tripId, null)
  assert.equal(await db.transactions.count(), 6, 'geen transactie verdwenen')
})

console.log(`\n${pass} geslaagd, ${fail} mislukt`)
process.exit(fail ? 1 : 0)
