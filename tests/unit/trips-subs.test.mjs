// Vakantie-subcategorieën: het raden uit de omschrijving, het eenmalig
// aanmaken van de vaste subs, het in één keer op Vakantie zetten van de
// gekoppelde uitgaven en de twee waarheden (voor jou / bank) in de verdeling.
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = new URL('../../src', import.meta.url).href
const BRUGGE = new URL('../../docs/voorbeelden/splitser-brugge.txt', import.meta.url)

let pass = 0, fail = 0
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok  ', name) }
  catch (e) { fail++; console.log('  FOUT', name, '\n       ', e.message) }
}

const { db } = await import(`${SRC}/db/db.js`)
const T = await import(`${SRC}/hooks/useTrips.js`)
const U = await import(`${SRC}/utils/trips/subcategory.js`)
const K = await import(`${SRC}/utils/trips/costs.js`)
const S = await import(`${SRC}/utils/trips/splitser.js`)
const { buildDefaultCategoryRows } = await import(`${SRC}/constants/categories.js`)

await db.open()

/* ------------------------------------------------------------------ *
 * Raden op de omschrijving                                             *
 * ------------------------------------------------------------------ */

console.log('\n--- guessTripSub ---')
const raad = (tekst, sub) => assert.equal(U.guessTripSub(tekst), sub, `${tekst} → ${sub}`)

await t('vlucht en vervoer', () => {
  raad('Transavia HV6012', 'vlucht')
  raad('Vlucht heen Schiphol', 'vlucht')
  raad('NS', 'vervoer')
  raad('Taxi centrum', 'vervoer')
  raad('Huurauto Sixt', 'vervoer')
  raad('Parkeren centrum', 'vervoer')
})
await t('overnachting en eten & drinken', () => {
  raad('Hotel Bellevue', 'overnachting')
  raad('Toeristenbelasting', 'overnachting')
  raad('Airbnb Brugge', 'overnachting')
  raad('Le pain quotidien', 'eten_drinken')
  raad('Koffietje zaterdag', 'eten_drinken')
  raad('Olive streetfood', 'eten_drinken')
})
await t('activiteiten, boodschappen en de restbak', () => {
  raad('Museum 1', 'activiteiten')
  raad('Tickets kathedraal', 'activiteiten')
  raad('Carrefour Express', 'boodschappen_vakantie')
  raad('Supermarkt water', 'boodschappen_vakantie')
  raad('Contant', 'overig_vakantie')
  raad('De garre', 'overig_vakantie')
  raad('', 'overig_vakantie')
})
await t('bij gelijkspel wint het langste trefwoord', () => {
  // 'spar' (boodschappen) verslaat 'spa' (activiteiten), 'huurauto' (vervoer)
  // verslaat 'huur' (activiteiten) en 'overnacht' verslaat 'ov'.
  raad('Spar Brugge', 'boodschappen_vakantie')
  raad('Huurauto', 'vervoer')
  raad('Overnachting Gent', 'overnachting')
  raad('Souvenirs', 'overig_vakantie')
})

console.log('\n--- sleutels en labels ---')
await t('tripSubKey vindt de sub op sleutel, anders op label', () => {
  const nieuw = { key: 'vakantie', subs: [{ key: 'eten_drinken', label: 'Eten & drinken' }] }
  assert.equal(U.tripSubKey(nieuw, 'eten_drinken'), 'eten_drinken')
  // In een bestaande database maakt addSub de sleutel uit het label.
  const oud = { key: 'vakantie', subs: [{ key: 'boodschappen', label: 'Boodschappen' }] }
  assert.equal(U.tripSubKey(oud, 'boodschappen_vakantie'), 'boodschappen')
  assert.equal(U.subLabelOf(oud, 'boodschappen'), 'Boodschappen')
  assert.equal(U.tripSubKey({ key: 'vakantie', subs: [] }, 'vlucht'), 'vlucht', 'anders de kanonieke sleutel')
})
await t('pickTripCategory: geleerd wint, anders Vakantie + geraden sub', () => {
  const cat = { key: 'vakantie', subs: [{ key: 'vlucht', label: 'Vlucht' }] }
  assert.deepEqual(
    U.pickTripCategory({ cat: 'kleding', sub: '', source: 'learned' }, { cat, description: 'Zara' }),
    { category: 'kleding', subcategory: '' },
    'bewust buiten Vakantie geleerd volgen we',
  )
  assert.deepEqual(
    U.pickTripCategory({ cat: 'boodschappen', sub: 'supermarkt', source: 'rules' }, { cat, description: 'Vlucht KLM' }),
    { category: 'vakantie', subcategory: 'vlucht' },
    'de ingebouwde regels tellen niet als geleerd',
  )
  assert.deepEqual(
    U.pickTripCategory({ cat: 'vakantie', sub: 'vlucht', source: 'learned' }, { cat, description: 'Onbekend' }),
    { category: 'vakantie', subcategory: 'vlucht' },
  )
  assert.deepEqual(
    U.pickTripCategory({ cat: '', sub: '', source: 'unknown' }, { cat: null, description: 'Museum' }),
    { category: '', subcategory: '' },
    'zonder Vakantie-categorie laten we het aan de categorizer',
  )
})

/* ------------------------------------------------------------------ *
 * ensureTripSubcategories                                              *
 * ------------------------------------------------------------------ */

console.log('\n--- ensureTripSubcategories ---')
await t('zonder categorie Vakantie gebeurt er niets', async () => {
  await db.categories.clear()
  await db.categories.put({ key: 'boodschappen', label: 'Boodschappen', order: 0, type: 'expense', subs: [] })
  assert.deepEqual(await T.ensureTripSubcategories(), { ok: false, key: null, added: 0 })
})
await t('een Vakantie zonder subs krijgt de zeven vaste subs', async () => {
  await db.categories.put({ key: 'vakantie', label: 'Vakantie', order: 1, type: 'expense', subs: [] })
  const uit = await T.ensureTripSubcategories()
  assert.deepEqual(uit, { ok: true, key: 'vakantie', added: 7 })
  const subs = (await db.categories.get('vakantie')).subs
  assert.deepEqual(subs.map(s => s.label),
    ['Vlucht', 'Vervoer', 'Overnachting', 'Eten & drinken', 'Activiteiten', 'Boodschappen', 'Overig'])
  // addSub maakt de sleutel uit het label; tripSubKey vertaalt de kanonieke.
  assert.deepEqual(subs.map(s => s.key),
    ['vlucht', 'vervoer', 'overnachting', 'eten_drinken', 'activiteiten', 'boodschappen', 'overig'])
  const cat = await db.categories.get('vakantie')
  assert.equal(U.tripSubKey(cat, 'boodschappen_vakantie'), 'boodschappen')
  assert.equal(U.tripSubKey(cat, 'overig_vakantie'), 'overig')
})
await t('een Vakantie met eigen subs blijft ongemoeid', async () => {
  await db.categories.clear()
  await db.categories.put({
    key: 'vakantie', label: 'Vakantie', order: 0, type: 'expense',
    subs: [{ key: 'zon', label: 'Zon' }],
  })
  assert.deepEqual(await T.ensureTripSubcategories(), { ok: true, key: 'vakantie', added: 0 })
  assert.deepEqual((await db.categories.get('vakantie')).subs, [{ key: 'zon', label: 'Zon' }])
})
await t('de categorie mag ook alleen op label Vakantie heten', async () => {
  await db.categories.clear()
  await db.categories.put({ key: 'reizen', label: 'Vakantie', order: 0, type: 'expense', subs: [] })
  assert.deepEqual(await T.ensureTripSubcategories(), { ok: true, key: 'reizen', added: 7 })
})

/* ------------------------------------------------------------------ *
 * recategorizeTripTransactions                                         *
 * ------------------------------------------------------------------ */

console.log('\n--- gekoppelde uitgaven op Vakantie ---')
await db.categories.clear()
await db.categories.bulkPut(buildDefaultCategoryRows({}))
await db.merchantHistory.clear()

const txIds = await db.transactions.bulkAdd([
  { date: '2026-07-22', amount: 24, type: 'debit', category: 'boodschappen', subcategory: 'supermarkt', note: 'CARREFOUR BRUGGE Land: BEL', tripId: null },
  { date: '2026-07-21', amount: 30, type: 'debit', category: 'reiskosten', subcategory: '', note: 'NMBS TREIN BRUSSEL', tripId: null },
  { date: '2026-07-23', amount: 7.2, type: 'credit', category: 'bankoverschrijving', subcategory: '', note: 'Sterre verrekening', tripId: null },
  { date: '2026-07-22', amount: 15, type: 'debit', category: 'reiskosten', subcategory: '', note: 'TAXI WERKBEZOEK', claimStatus: 'open', tripId: null },
  { date: '2026-07-22', amount: 80, type: 'debit', category: 'vakantie', subcategory: 'overnachting', note: 'HOTEL DE ORANGERIE Land: BEL', tripId: null },
  { date: '2026-07-22', amount: 29.3, type: 'debit', category: 'overige_kosten', subcategory: '', note: 'SUMUP LE PAIN Q Land: BEL', tripId: null },
], { allKeys: true })
const [carrefour, trein, verrekening, declaratie, hotel, pain] = txIds

const reisId = await T.createTrip({
  name: 'Brugge', from: '2026-07-21', to: '2026-07-23', countries: ['BEL'], transactionIds: txIds,
})
await db.tripItems.add({
  tripId: reisId, date: '2026-07-22', description: 'Le pain quotidien', amount: 29.3,
  payer: 'Florian', participants: [], myShare: 14.65,
  category: 'vakantie', subcategory: 'eten_drinken', matchedTxId: pain, source: 'splitser',
})

await t('alleen afschrijvingen buiten Vakantie worden omgezet', async () => {
  const aantal = await T.recategorizeTripTransactions(reisId)
  assert.equal(aantal, 3, 'carrefour, trein en de pain-regel')
  const na = async id => db.transactions.get(id)
  assert.deepEqual(pick(await na(carrefour)), { category: 'vakantie', subcategory: 'boodschappen_vakantie' })
  assert.deepEqual(pick(await na(trein)), { category: 'vakantie', subcategory: 'vervoer' })
  assert.deepEqual(pick(await na(pain)), { category: 'vakantie', subcategory: 'eten_drinken' },
    'de gematchte Splitser-regel wint van het raden')
})
await t('verrekening, lopende declaratie en wat al goed stond blijven staan', async () => {
  assert.deepEqual(pick(await db.transactions.get(verrekening)), { category: 'bankoverschrijving', subcategory: '' })
  assert.deepEqual(pick(await db.transactions.get(declaratie)), { category: 'reiskosten', subcategory: '' })
  assert.deepEqual(pick(await db.transactions.get(hotel)), { category: 'vakantie', subcategory: 'overnachting' })
  assert.equal(await T.recategorizeTripTransactions(reisId), 0, 'een tweede keer is er niets te doen')
})
await t('elke wijziging gaat als correctie de learning in', async () => {
  const events = await db.merchantHistory.toArray()
  assert.equal(events.length, 3)
  assert.ok(events.every(e => e.category === 'vakantie' && e.wasCorrection === true))
  assert.deepEqual([...new Set(events.map(e => e.previousCategory))].sort(),
    ['boodschappen', 'overige_kosten', 'reiskosten'])
  assert.deepEqual(events.map(e => e.subcategory).sort(),
    ['boodschappen_vakantie', 'eten_drinken', 'vervoer'])
})

function pick(tx) {
  return { category: tx.category, subcategory: tx.subcategory }
}

/* ------------------------------------------------------------------ *
 * Twee waarheden in de verdeling                                       *
 * ------------------------------------------------------------------ */

console.log('\n--- tripCosts: voor jou én bank ---')
await t('bank telt de gedekte afschrijving mee, mine niet', () => {
  const items = [{ id: 1, date: '2026-07-22', amount: 30, myShare: 15, category: 'vakantie', subcategory: 'eten_drinken', matchedTxId: 1 }]
  const txs = [
    { id: 1, date: '2026-07-22', amount: 30, type: 'debit', category: 'vakantie', subcategory: 'eten_drinken' },
    { id: 2, date: '2026-07-21', amount: 40, type: 'debit', category: 'vakantie', subcategory: 'vervoer' },
    { id: 3, date: '2026-07-23', amount: 15, type: 'credit', category: 'bankoverschrijving', subcategory: '' },
  ]
  const c = K.tripCosts({ items, transactions: txs, from: '2026-07-21', to: '2026-07-23' })
  assert.equal(c.myCost, 55)
  const eten = c.perCategory.find(r => r.key === 'vakantie|eten_drinken')
  const vervoer = c.perCategory.find(r => r.key === 'vakantie|vervoer')
  assert.deepEqual([eten.mine, eten.bank], [15, 30])
  assert.deepEqual([vervoer.mine, vervoer.bank], [40, 40])
  assert.equal(eten.amount, eten.mine, 'amount blijft de oude naam van mine')
  assert.equal(K.round2(c.perCategory.reduce((s, r) => s + r.mine, 0)), c.myCost)
  assert.equal(K.round2(c.perCategory.reduce((s, r) => s + r.bank, 0)), c.bankOut)
})
await t('een gedekte regel in een andere categorie krijgt een eigen rij', () => {
  const items = [{ id: 1, date: '2026-07-22', amount: 60, myShare: 30, category: 'kleding', subcategory: '', matchedTxId: 1 }]
  const txs = [{ id: 1, date: '2026-07-22', amount: 60, type: 'debit', category: 'vakantie', subcategory: 'overig_vakantie' }]
  const c = K.tripCosts({ items, transactions: txs })
  assert.deepEqual(c.perCategory.map(r => [r.key, r.mine, r.bank]), [
    ['kleding|', 30, 0],
    ['vakantie|overig_vakantie', 0, 60],
  ])
})

await t('Brugge doorrekenen: 130 voor jou, verdeeld over drie subs', () => {
  const parsed = S.parseSplitserPdf(readFileSync(BRUGGE, 'utf8'))
  const items = parsed.rows.map((row, i) => ({
    id: i + 1,
    date: row.date,
    amount: row.amount,
    myShare: S.shareOf(row, 'Florian'),
    category: 'vakantie',
    subcategory: U.guessTripSub(row.description),
    matchedTxId: row.description === 'Le pain quotidien' ? 1 : null,
  }))
  const txs = [
    { id: 1, date: '2026-07-22', amount: 29.3, type: 'debit', category: 'vakantie', subcategory: 'eten_drinken' },
    { id: 2, date: '2026-07-21', amount: 24, type: 'debit', category: 'vakantie', subcategory: 'boodschappen_vakantie' },
  ]
  const c = K.tripCosts({ items, transactions: txs, from: '2026-07-21', to: '2026-07-22' })
  assert.equal(c.splitserShare, 130)
  assert.equal(c.bankNotCovered, 24, 'alleen de supermarkt liep niet via Splitser')
  assert.equal(c.myCost, 154)
  const rij = key => c.perCategory.find(r => r.key === key)
  assert.deepEqual([rij('vakantie|eten_drinken').mine, rij('vakantie|eten_drinken').bank], [67.25, 29.3])
  assert.equal(rij('vakantie|activiteiten').mine, 26, 'twee musea')
  assert.equal(rij('vakantie|overig_vakantie').mine, 36.75, 'De garre, het restant indiaas en contant')
  assert.deepEqual([rij('vakantie|boodschappen_vakantie').mine, rij('vakantie|boodschappen_vakantie').bank], [24, 24])
  assert.equal(K.round2(c.perCategory.reduce((s, r) => s + r.mine, 0)), c.myCost)
})

console.log(`\n${pass} geslaagd, ${fail} mislukt`)
process.exit(fail ? 1 : 0)
